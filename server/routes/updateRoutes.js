const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const SettingsStore = require('../stores/settingsStore');
const { checkAdminAccess, isSelfUpdateEnabled, requireAdminAccess } = require('../middleware/security');

const router = express.Router();

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CLIENT_ROOT = path.join(PROJECT_ROOT, 'client');
const DEFAULT_PATH = process.platform === 'win32'
  ? process.env.PATH
  : '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

let installInProgress = false;

function getConfiguredUpdateBranch() {
  return SettingsStore.get().updateBranch || process.env.UPDATE_BRANCH || 'main';
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

function getErrorText(error) {
  return [error.message, error.stdout, error.stderr].filter(Boolean).join('\n').trim();
}

async function hasGit() {
  try {
    const result = await runFile(getGitCommand(), ['--version']);
    return result.stdout || 'git available';
  } catch {
    return null;
  }
}

async function tryGit(args, cwd) {
  try {
    return await runFile(getGitCommand(), args, cwd);
  } catch {
    return null;
  }
}

async function getUpdateStatus() {
  const gitVersion = await hasGit();
  const status = {
    enabled: isSelfUpdateEnabled(),
    gitAvailable: Boolean(gitVersion),
    gitVersion,
    isRepo: fs.existsSync(path.join(PROJECT_ROOT, '.git')),
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

  const remoteResult = await tryGit(['remote', 'get-url', 'origin']);
  status.remoteUrl = remoteResult?.stdout || null;
  status.hasRemote = Boolean(status.remoteUrl);

  if (!status.hasRemote) {
    status.message = 'Remote origin не настроен. Подключите удаленный репозиторий.';
    return status;
  }

  await tryGit(['fetch', 'origin', '--prune']);

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
      message: 'Self-update отключен. Включите ENABLE_SELF_UPDATE=true и настройте ADMIN_TOKEN.',
    });
  }

  const authError = checkAdminAccess(req, {
    invalidTokenMessage: 'Для проверки обновлений требуется ADMIN_TOKEN.',
  });
  if (authError) {
    return res.status(authError.status).json(authError.body);
  }

  try {
    const status = await getUpdateStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: getErrorText(error) });
  }
});

router.post('/updates/install', requireAdminAccess({
  invalidTokenMessage: 'Для установки обновлений требуется ADMIN_TOKEN.',
}), async (req, res) => {
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
    await runFile('git', ['pull', '--ff-only', 'origin', statusBefore.targetRef.replace('origin/', '')], PROJECT_ROOT);

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

module.exports = router;
