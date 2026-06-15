const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const SettingsStore = require('../stores/settingsStore');
const { isSelfUpdateEnabled } = require('../middleware/security');

const router = express.Router();

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CLIENT_ROOT = path.join(PROJECT_ROOT, 'client');
const DEFAULT_PATH = process.platform === 'win32'
  ? process.env.PATH
  : '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

let installInProgress = false;

function getConfiguredServiceName() {
  return (process.env.SYSTEMD_SERVICE_NAME || 'kaznadzei').trim();
}

function getConfiguredUpdateBranch() {
  return SettingsStore.get().updateBranch || process.env.UPDATE_BRANCH || 'main';
}

function getConfiguredUpdateRepositoryUrl() {
  return (
    SettingsStore.get().updateRepositoryUrl
    || process.env.UPDATE_REPOSITORY_URL
    || process.env.GIT_REMOTE_URL
    || ''
  ).trim();
}

function runFile(command, args, cwd = PROJECT_ROOT) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        PATH: process.env.PATH || DEFAULT_PATH,
      },
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function getExecutable(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes(path.sep) && fs.existsSync(candidate)) {
      return candidate;
    }
    if (!candidate.includes(path.sep)) {
      return candidate;
    }
  }
  return candidates[candidates.length - 1];
}

function getGitCommand() {
  if (process.platform === 'win32') {
    return getExecutable(['git.exe', 'git']);
  }
  return getExecutable(['/usr/bin/git', '/usr/local/bin/git', 'git']);
}

function getNpmCommand() {
  if (process.platform === 'win32') {
    return getExecutable(['npm.cmd', 'npm']);
  }
  return getExecutable(['/usr/bin/npm', '/usr/local/bin/npm', 'npm']);
}

function getSystemctlCommand() {
  if (process.platform === 'win32') {
    return null;
  }
  return getExecutable(['/usr/bin/systemctl', '/bin/systemctl', 'systemctl']);
}

function getJournalctlCommand() {
  if (process.platform === 'win32') {
    return null;
  }
  return getExecutable(['/usr/bin/journalctl', '/bin/journalctl', 'journalctl']);
}

function getSudoCommand() {
  if (process.platform === 'win32') {
    return null;
  }
  return getExecutable(['/usr/bin/sudo', '/bin/sudo', 'sudo']);
}

function getErrorText(error) {
  return [error.message, error.stdout, error.stderr].filter(Boolean).join('\n').trim();
}

function requiresInteractiveSudo(errorText) {
  const text = String(errorText || '').toLowerCase();
  return text.includes('interactive authentication is required')
    || text.includes('a password is required')
    || text.includes('sudo:')
    || text.includes('sudo-rs:');
}

function getSudoersHint(serviceName) {
  const sudoUser = process.env.SUDO_USER || process.env.USER || 'www-data';
  const safeServiceName = serviceName || 'kaznadzei';
  return [
    'Для кнопок перезапуска и логов настройте sudoers в режиме NOPASSWD.',
    `Откройте sudoers командой: sudo visudo`,
    'Добавьте строку:',
    `${sudoUser} ALL=(root) NOPASSWD: /usr/bin/systemctl restart --no-block ${safeServiceName}, /usr/bin/systemctl status ${safeServiceName} --no-pager -l, /usr/bin/journalctl -u ${safeServiceName} -n 80 --no-pager -o short-iso`,
  ].join('\n');
}

async function hasGit() {
  try {
    const result = await runFile(getGitCommand(), ['--version']);
    return result.stdout || 'git available';
  } catch {
    return null;
  }
}

async function hasSystemctl() {
  const command = getSystemctlCommand();
  if (!command) {
    return null;
  }
  try {
    const result = await runFile(command, ['--version']);
    return result.stdout || 'systemctl available';
  } catch {
    return null;
  }
}

async function trySystemctl(args) {
  const systemctlCommand = getSystemctlCommand();
  if (!systemctlCommand) {
    return null;
  }

  const sudoCommand = getSudoCommand();
  const command = sudoCommand || systemctlCommand;
  const finalArgs = sudoCommand ? ['-n', systemctlCommand, ...args] : args;

  try {
    return await runFile(command, finalArgs);
  } catch {
    return null;
  }
}

async function trySystemctlDetailed(args) {
  const systemctlCommand = getSystemctlCommand();
  if (!systemctlCommand) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      errorText: 'systemctl недоступен на этой платформе.',
    };
  }

  const sudoCommand = getSudoCommand();
  const command = sudoCommand || systemctlCommand;
  const finalArgs = sudoCommand ? ['-n', systemctlCommand, ...args] : args;

  try {
    const result = await runFile(command, finalArgs);
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      errorText: getErrorText(error),
    };
  }
}

async function tryJournalctlDetailed(args) {
  const journalctlCommand = getJournalctlCommand();
  if (!journalctlCommand) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      errorText: 'journalctl недоступен на этой платформе.',
    };
  }

  const sudoCommand = getSudoCommand();
  const command = sudoCommand || journalctlCommand;
  const finalArgs = sudoCommand ? ['-n', journalctlCommand, ...args] : args;

  try {
    const result = await runFile(command, finalArgs);
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      errorText: getErrorText(error),
    };
  }
}

async function tryGit(args, cwd) {
  try {
    return await runFile(getGitCommand(), args, cwd);
  } catch {
    return null;
  }
}

async function tryGitDetailed(args, cwd) {
  try {
    const result = await runFile(getGitCommand(), args, cwd);
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      errorText: getErrorText(error),
    };
  }
}

async function ensureGitRemoteConfigured() {
  const configuredRemoteUrl = getConfiguredUpdateRepositoryUrl();
  if (!configuredRemoteUrl) {
    return {
      configuredRemoteUrl: '',
      remoteUrl: (await tryGit(['remote', 'get-url', 'origin']))?.stdout || null,
      changed: false,
      error: '',
    };
  }

  const currentRemote = await tryGit(['remote', 'get-url', 'origin']);
  if (currentRemote?.stdout === configuredRemoteUrl) {
    return {
      configuredRemoteUrl,
      remoteUrl: configuredRemoteUrl,
      changed: false,
      error: '',
    };
  }

  const remoteUpdateResult = currentRemote?.stdout
    ? await tryGitDetailed(['remote', 'set-url', 'origin', configuredRemoteUrl])
    : await tryGitDetailed(['remote', 'add', 'origin', configuredRemoteUrl]);

  if (!remoteUpdateResult.ok) {
    return {
      configuredRemoteUrl,
      remoteUrl: currentRemote?.stdout || null,
      changed: false,
      error: remoteUpdateResult.errorText || 'Не удалось настроить origin.',
    };
  }

  return {
    configuredRemoteUrl,
    remoteUrl: configuredRemoteUrl,
    changed: true,
    error: '',
  };
}

async function getUpdateStatus() {
  const gitVersion = await hasGit();
  const status = {
    enabled: isSelfUpdateEnabled(),
    gitAvailable: Boolean(gitVersion),
    gitVersion,
    systemctlAvailable: Boolean(await hasSystemctl()),
    serviceName: getConfiguredServiceName(),
    serviceActiveState: null,
    restartSupported: false,
    isRepo: fs.existsSync(path.join(PROJECT_ROOT, '.git')),
    hasRemote: false,
    upstreamConfigured: false,
    branch: null,
    remoteUrl: null,
    configuredRemoteUrl: getConfiguredUpdateRepositoryUrl() || null,
    currentCommit: null,
    targetRef: null,
    updatesAvailable: false,
    ahead: 0,
    behind: 0,
    canInstall: false,
    installInProgress,
    fetchError: '',
    message: '',
  };

  if (!status.gitAvailable) {
    status.message = 'Git не найден в PATH. Установите Git на локальную машину.';
    return status;
  }

  if (!status.isRepo) {
    status.message = 'Локальный git-репозиторий не инициализирован.';
    return status;
  }

  const branchResult = await tryGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  status.branch = branchResult?.stdout || null;

  const commitResult = await tryGit(['rev-parse', 'HEAD']);
  status.currentCommit = commitResult?.stdout || null;

  if (status.systemctlAvailable && status.serviceName) {
    const serviceStateResult = await trySystemctl(['is-active', status.serviceName]);
    if (serviceStateResult?.stdout) {
      status.serviceActiveState = serviceStateResult.stdout;
      status.restartSupported = ['active', 'activating', 'reloading'].includes(serviceStateResult.stdout);
    }
  }

  const remoteSetup = await ensureGitRemoteConfigured();
  status.remoteUrl = remoteSetup.remoteUrl || null;
  status.hasRemote = Boolean(status.remoteUrl);

  if (remoteSetup.error) {
    status.message = remoteSetup.error;
    return status;
  }

  if (!status.hasRemote) {
    status.message = status.configuredRemoteUrl
      ? 'Не удалось применить URL репозитория к origin.'
      : 'Remote origin не настроен. Укажите URL репозитория в настройках обновлений.';
    return status;
  }

  const fetchResult = await tryGitDetailed(['fetch', 'origin', '--prune']);
  if (!fetchResult.ok) {
    status.fetchError = fetchResult.errorText || 'Не удалось выполнить git fetch origin.';
    status.message = 'Не удалось обратиться к удаленному репозиторию. Проверьте SSH deploy key и URL репозитория.';
    return status;
  }

  const upstreamName = await tryGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (upstreamName?.stdout) {
    status.upstreamConfigured = true;
    status.targetRef = upstreamName.stdout;
  } else {
    const fallbackBranch = getConfiguredUpdateBranch() || status.branch || 'main';
    const remoteBranch = await tryGit(['rev-parse', '--verify', `origin/${fallbackBranch}`]);
    if (remoteBranch?.stdout) {
      status.targetRef = `origin/${fallbackBranch}`;
    }
  }

  if (!status.targetRef) {
    status.message = 'Не удалось определить ветку для обновления.';
    return status;
  }

  const counts = await tryGit(['rev-list', '--left-right', '--count', `HEAD...${status.targetRef}`]);
  if (counts?.stdout) {
    const [ahead = '0', behind = '0'] = counts.stdout.split(/\s+/);
    status.ahead = Number(ahead) || 0;
    status.behind = Number(behind) || 0;
    status.updatesAvailable = status.behind > 0;
  }

  status.canInstall = !installInProgress && status.hasRemote && Boolean(status.targetRef);
  status.message = status.updatesAvailable
    ? `Доступно обновлений: ${status.behind}`
    : 'Обновлений нет';

  return status;
}

router.get('/updates/status', async (req, res) => {
  if (!isSelfUpdateEnabled()) {
    return res.json({
      enabled: false,
      gitAvailable: false,
      gitVersion: null,
      systemctlAvailable: Boolean(await hasSystemctl()),
      serviceName: getConfiguredServiceName(),
      serviceActiveState: null,
      restartSupported: false,
      isRepo: false,
      hasRemote: false,
      upstreamConfigured: false,
      branch: null,
      remoteUrl: null,
      currentCommit: null,
      targetRef: null,
      updatesAvailable: false,
      ahead: 0,
      behind: 0,
      canInstall: false,
      installInProgress,
      message: 'Self-update отключен. Включите ENABLE_SELF_UPDATE=true в .env.',
    });
  }

  try {
    const status = await getUpdateStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: getErrorText(error) });
  }
});

router.post('/updates/install', async (req, res) => {
  if (!isSelfUpdateEnabled()) {
    return res.status(403).json({ message: 'Self-update отключен. Включите ENABLE_SELF_UPDATE=true в .env.' });
  }

  if (installInProgress) {
    return res.status(409).json({ message: 'Установка обновлений уже выполняется.' });
  }

  installInProgress = true;
  const logs = [];

  try {
    const statusBefore = await getUpdateStatus();

    if (!statusBefore.gitAvailable) {
      return res.status(400).json({ message: statusBefore.message, status: statusBefore });
    }
    if (!statusBefore.isRepo) {
      return res.status(400).json({ message: statusBefore.message, status: statusBefore });
    }
    if (!statusBefore.hasRemote || !statusBefore.targetRef) {
      return res.status(400).json({ message: statusBefore.message, status: statusBefore });
    }

    if (!statusBefore.updatesAvailable) {
      return res.json({ ok: true, updated: false, message: 'Новых обновлений нет.', logs, status: statusBefore });
    }

    logs.push(`git pull --ff-only origin ${statusBefore.targetRef.replace('origin/', '')}`);
    await runFile(getGitCommand(), ['pull', '--ff-only', 'origin', statusBefore.targetRef.replace('origin/', '')], PROJECT_ROOT);

    logs.push('npm install');
    await runFile(getNpmCommand(), ['install'], PROJECT_ROOT);

    logs.push('npm install (client)');
    await runFile(getNpmCommand(), ['install'], CLIENT_ROOT);

    logs.push('npm run build (client)');
    await runFile(getNpmCommand(), ['run', 'build'], CLIENT_ROOT);

    const statusAfter = await getUpdateStatus();
    res.json({
      ok: true,
      updated: true,
      message: 'Обновления установлены, клиент пересобран. Перезапустите приложение для применения изменений.',
      logs,
      status: statusAfter,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Не удалось установить обновления.',
      details: getErrorText(error),
      logs,
    });
  } finally {
    installInProgress = false;
  }
});

router.post('/updates/restart-service', async (req, res) => {
  const systemctlVersion = await hasSystemctl();
  if (!systemctlVersion) {
    return res.status(400).json({
      message: 'Перезапуск сервиса поддерживается только на Linux-сервере с systemd.',
    });
  }

  const serviceName = getConfiguredServiceName();
  if (!serviceName) {
    return res.status(400).json({
      message: 'Не задано имя systemd-сервиса. Укажите SYSTEMD_SERVICE_NAME в .env.',
    });
  }

  const restartResult = await trySystemctlDetailed(['restart', '--no-block', serviceName]);
  if (!restartResult.ok) {
    const sudoHint = requiresInteractiveSudo(restartResult.errorText) ? `\n\n${getSudoersHint(serviceName)}` : '';
    return res.status(500).json({
      message: 'Не удалось запустить перезапуск сервиса.',
      details: `${restartResult.errorText || 'Проверьте права на systemctl и sudoers.'}${sudoHint}`,
    });
  }

  res.json({
    ok: true,
    message: `Команда перезапуска отправлена для сервиса ${serviceName}.`,
    serviceName,
  });
});

router.get('/updates/service-details', async (req, res) => {
  const systemctlVersion = await hasSystemctl();
  if (!systemctlVersion) {
    return res.status(400).json({
      message: 'Просмотр статуса сервиса поддерживается только на Linux-сервере с systemd.',
    });
  }

  const serviceName = getConfiguredServiceName();
  if (!serviceName) {
    return res.status(400).json({
      message: 'Не задано имя systemd-сервиса. Укажите SYSTEMD_SERVICE_NAME в .env.',
    });
  }

  const statusResult = await trySystemctlDetailed(['status', serviceName, '--no-pager', '-l']);
  const logsResult = await tryJournalctlDetailed(['-u', serviceName, '-n', '80', '--no-pager', '-o', 'short-iso']);

  if (!statusResult.ok && !logsResult.ok) {
    const combinedErrorText = [statusResult.errorText, logsResult.errorText].filter(Boolean).join('\n\n');
    const sudoHint = requiresInteractiveSudo(combinedErrorText) ? `\n\n${getSudoersHint(serviceName)}` : '';
    return res.status(500).json({
      message: 'Не удалось получить статус и логи сервиса.',
      details: `${combinedErrorText}${sudoHint}`,
    });
  }

  res.json({
    ok: true,
    serviceName,
    statusText: statusResult.stdout || statusResult.stderr || 'Статус сервиса не получен.',
    logsText: logsResult.stdout || logsResult.stderr || 'Логи сервиса не получены.',
    statusError: statusResult.ok ? '' : statusResult.errorText,
    logsError: logsResult.ok ? '' : logsResult.errorText,
  });
});

module.exports = router;
