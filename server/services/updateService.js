const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const SettingsStore = require('../stores/settingsStore');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CLIENT_ROOT = path.join(PROJECT_ROOT, 'client');
const DEFAULT_PATH = process.platform === 'win32'
  ? process.env.PATH
  : '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const INSTALL_JOB_FILE = path.join(PROJECT_ROOT, '.update-install-job.json');
const INSTALL_JOB_STALE_MS = 2 * 60 * 1000;

let installJobSequence = 0;

function hasPackageLock(cwd) {
  return fs.existsSync(path.join(cwd, 'package-lock.json'));
}

function getInstallCommandArgs(cwd) {
  return hasPackageLock(cwd) ? ['ci'] : ['install'];
}

function isNpmCiLockSyncError(errorText = '') {
  const text = String(errorText || '').toLowerCase();
  return text.includes('npm ci')
    && (
      text.includes('package.json and package-lock.json')
      || text.includes('missing:')
      || text.includes('eusage')
      || text.includes('npm-shrinkwrap.json are in sync')
    );
}

function normalizeSystemdServiceName(serviceName = '') {
  const normalized = String(serviceName || '').trim() || 'kaznadzei';
  return normalized.includes('.') ? normalized : `${normalized}.service`;
}

function getConfiguredServiceName() {
  return normalizeSystemdServiceName(process.env.SYSTEMD_SERVICE_NAME || 'kaznadzei');
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

function getRestartSudoersHint(serviceName) {
  const sudoUser = process.env.SUDO_USER || process.env.USER || 'www-data';
  const safeServiceName = serviceName || 'kaznadzei';
  return [
    'Для кнопки перезапуска настройте sudoers только на одну команду.',
    'Откройте sudoers командой: sudo visudo',
    'Добавьте строку:',
    `${sudoUser} ALL=(root) NOPASSWD: /usr/bin/systemctl restart --no-block ${safeServiceName}`,
  ].join('\n');
}

function readInstallJob() {
  try {
    if (!fs.existsSync(INSTALL_JOB_FILE)) return null;
    return JSON.parse(fs.readFileSync(INSTALL_JOB_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeInstallJob(job) {
  fs.writeFileSync(INSTALL_JOB_FILE, JSON.stringify(job, null, 2));
}

function updateInstallJob(jobId, updater) {
  const currentJob = readInstallJob();
  if (!currentJob || currentJob.id !== jobId) return null;
  const nextJob = typeof updater === 'function'
    ? updater(currentJob)
    : { ...currentJob, ...updater };
  const normalizedJob = {
    ...nextJob,
    updatedAt: new Date().toISOString(),
  };
  writeInstallJob(normalizedJob);
  return normalizedJob;
}

function finalizeStaleInstallJob(job) {
  if (!job || job.status !== 'running') {
    return job;
  }

  const updatedAtTime = new Date(job.updatedAt || job.startedAt || 0).getTime();
  if (!updatedAtTime || (Date.now() - updatedAtTime) < INSTALL_JOB_STALE_MS) {
    return job;
  }

  const failedJob = {
    ...job,
    status: 'failed',
    finishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    message: 'Установка обновлений была прервана.',
    details: 'Фоновая задача не обновляла статус слишком долго. Вероятно, процесс был перезапущен или завершился аварийно.',
    logs: [
      ...(Array.isArray(job.logs) ? job.logs : []),
      'Задача автоматически переведена в ошибку из-за отсутствия heartbeat.',
    ].slice(-200),
  };
  writeInstallJob(failedJob);
  return failedJob;
}

function getStoredInstallJob() {
  return finalizeStaleInstallJob(readInstallJob());
}

function isInstallInProgress() {
  return getStoredInstallJob()?.status === 'running';
}

function getInstallJobSnapshot(job) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    updatedAt: job.updatedAt,
    message: job.message,
    details: job.details,
    logs: Array.isArray(job.logs) ? [...job.logs] : [],
    statusBefore: job.statusBefore || null,
    statusAfter: job.statusAfter || null,
    stashCreated: Boolean(job.stashCreated),
    stashEntry: job.stashEntry || '',
    stashedFiles: Array.isArray(job.stashedFiles) ? [...job.stashedFiles] : [],
    installFallbackUsed: Boolean(job.installFallbackUsed),
  };
}

function appendInstallJobLog(jobId, message) {
  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage) return;
  updateInstallJob(jobId, (job) => ({
    ...job,
    logs: [...(Array.isArray(job.logs) ? job.logs : []), normalizedMessage].slice(-200),
  }));
}

function createInstallJob(statusBefore = null) {
  const createdAt = new Date().toISOString();
  const job = {
    id: `install-${Date.now()}-${++installJobSequence}`,
    status: 'running',
    startedAt: createdAt,
    finishedAt: '',
    updatedAt: createdAt,
    message: 'Установка обновлений запущена.',
    details: '',
    logs: [],
    statusBefore,
    statusAfter: null,
    stashCreated: false,
    stashEntry: '',
    stashedFiles: [],
    installFallbackUsed: false,
  };
  writeInstallJob(job);
  return job;
}

function finishInstallJob(jobId, {
  status = 'failed',
  message = '',
  details = '',
  statusAfter = null,
  stashCreated = false,
  stashEntry = '',
  stashedFiles = [],
  installFallbackUsed = false,
} = {}) {
  updateInstallJob(jobId, (job) => ({
    ...job,
    status,
    finishedAt: new Date().toISOString(),
    message: String(message || '').trim(),
    details: String(details || '').trim(),
    statusAfter,
    stashCreated: Boolean(stashCreated),
    stashEntry: String(stashEntry || '').trim(),
    stashedFiles: Array.isArray(stashedFiles) ? [...stashedFiles] : [],
    installFallbackUsed: Boolean(installFallbackUsed),
  }));
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

  try {
    return await runFile(systemctlCommand, args);
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

  try {
    const result = await runFile(systemctlCommand, args);
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

async function tryRestartServiceDetailed(serviceName) {
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
  if (!sudoCommand) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      errorText: 'sudo недоступен на этой платформе.',
    };
  }

  try {
    const result = await runFile(sudoCommand, ['-n', systemctlCommand, 'restart', '--no-block', String(serviceName || '').trim()]);
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

  try {
    const result = await runFile(journalctlCommand, args);
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

async function getTrackedGitChanges() {
  const statusResult = await tryGit(['status', '--porcelain', '--untracked-files=no'], PROJECT_ROOT);
  if (!statusResult?.stdout) {
    return [];
  }
  return statusResult.stdout
    .split(/\r?\n/)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

async function stashTrackedGitChanges() {
  const dirtyFiles = await getTrackedGitChanges();
  if (!dirtyFiles.length) {
    return {
      created: false,
      stashEntry: '',
      dirtyFiles: [],
      error: '',
    };
  }

  const stashMessage = `kaznadzei-auto-update-${new Date().toISOString()}`;
  const stashResult = await tryGitDetailed(['stash', 'push', '-m', stashMessage], PROJECT_ROOT);
  if (!stashResult.ok) {
    return {
      created: false,
      stashEntry: '',
      dirtyFiles,
      error: stashResult.errorText || 'Не удалось временно сохранить локальные изменения перед обновлением.',
    };
  }

  const stashEntry = (await tryGit(['stash', 'list', '--max-count=1', '--format=%gd'], PROJECT_ROOT))?.stdout || 'stash@{0}';
  return {
    created: true,
    stashEntry,
    dirtyFiles,
    error: '',
  };
}

async function installDependenciesWithFallback(cwd, logs, label = '') {
  const preferredArgs = getInstallCommandArgs(cwd);
  const suffix = label ? ` (${label})` : '';

  logs.push(`npm ${preferredArgs.join(' ')}${suffix}`);
  try {
    await runFile(getNpmCommand(), preferredArgs, cwd);
    return {
      usedFallback: false,
      fallbackReason: '',
    };
  } catch (error) {
    const errorText = getErrorText(error);
    if (preferredArgs[0] !== 'ci' || !isNpmCiLockSyncError(errorText)) {
      throw error;
    }

    logs.push(`npm ci${suffix} не выполнен: обнаружен рассинхрон package-lock, переключаюсь на npm install${suffix}`);
    logs.push(`npm install${suffix}`);
    await runFile(getNpmCommand(), ['install'], cwd);

    return {
      usedFallback: true,
      fallbackReason: errorText,
    };
  }
}

async function getUpdateStatus() {
  const installJob = getStoredInstallJob();
  const installInProgress = installJob?.status === 'running';
  const gitVersion = await hasGit();
  const status = {
    enabled: true,
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
    workingTreeDirty: false,
    dirtyTrackedFiles: [],
    canInstall: false,
    installInProgress,
    installJob: getInstallJobSnapshot(installJob),
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

  status.dirtyTrackedFiles = await getTrackedGitChanges();
  status.workingTreeDirty = status.dirtyTrackedFiles.length > 0;
  status.canInstall = !installInProgress && status.hasRemote && Boolean(status.targetRef);
  status.message = status.updatesAvailable
    ? `Доступно обновлений: ${status.behind}`
    : 'Обновлений нет';

  return status;
}

async function runInstallJob(jobId) {
  try {
    updateInstallJob(jobId, (job) => ({
      ...job,
      message: 'Проверяю состояние репозитория перед установкой.',
    }));
    const statusBefore = await getUpdateStatus();
    updateInstallJob(jobId, (job) => ({
      ...job,
      statusBefore,
    }));

    if (!statusBefore.gitAvailable || !statusBefore.isRepo || !statusBefore.hasRemote || !statusBefore.targetRef) {
      finishInstallJob(jobId, {
        status: 'failed',
        message: 'Не удалось подготовить установку обновлений.',
        details: statusBefore.message || 'Не выполнены предварительные условия установки.',
        statusAfter: statusBefore,
      });
      return;
    }

    if (!statusBefore.updatesAvailable) {
      finishInstallJob(jobId, {
        status: 'completed',
        message: 'Новых обновлений нет.',
        statusAfter: statusBefore,
      });
      return;
    }

    const stashResult = await stashTrackedGitChanges();
    if (stashResult.error) {
      finishInstallJob(jobId, {
        status: 'failed',
        message: 'Не удалось подготовить локальный репозиторий к обновлению.',
        details: stashResult.error,
        statusAfter: statusBefore,
      });
      return;
    }
    if (stashResult.created) {
      appendInstallJobLog(jobId, `git stash push -m "${stashResult.stashEntry}"`);
      appendInstallJobLog(jobId, `Временно сохранены локальные изменения: ${stashResult.dirtyFiles.join(', ')}`);
    }

    updateInstallJob(jobId, (job) => ({
      ...job,
      message: 'Получаю и применяю изменения из удалённого репозитория.',
      stashCreated: stashResult.created,
      stashEntry: stashResult.stashEntry,
      stashedFiles: stashResult.dirtyFiles,
    }));
    appendInstallJobLog(jobId, `git pull --ff-only origin ${statusBefore.targetRef.replace('origin/', '')}`);
    await runFile(getGitCommand(), ['pull', '--ff-only', 'origin', statusBefore.targetRef.replace('origin/', '')], PROJECT_ROOT);

    updateInstallJob(jobId, (job) => ({
      ...job,
      message: 'Обновляю зависимости проекта и клиента.',
    }));
    const rootLogs = [];
    const rootInstallResult = await installDependenciesWithFallback(PROJECT_ROOT, rootLogs);
    rootLogs.forEach((entry) => appendInstallJobLog(jobId, entry));
    const clientLogs = [];
    const clientInstallResult = await installDependenciesWithFallback(CLIENT_ROOT, clientLogs, 'client');
    clientLogs.forEach((entry) => appendInstallJobLog(jobId, entry));

    updateInstallJob(jobId, (job) => ({
      ...job,
      message: 'Собираю клиент после обновления.',
    }));
    appendInstallJobLog(jobId, 'npm run build (client)');
    await runFile(getNpmCommand(), ['run', 'build'], CLIENT_ROOT);

    updateInstallJob(jobId, (job) => ({
      ...job,
      message: 'Проверяю итоговый статус после установки.',
    }));
    const statusAfter = await getUpdateStatus();
    const installFallbackUsed = rootInstallResult.usedFallback || clientInstallResult.usedFallback;
    const installFallbackMessage = installFallbackUsed
      ? ' При установке зависимостей обнаружен рассинхрон lock-файла, поэтому updater автоматически переключился с npm ci на npm install.'
      : '';
    const stashMessage = stashResult.created
      ? ` Локальные изменения временно сохранены в ${stashResult.stashEntry}. При необходимости их можно вернуть командой git stash pop ${stashResult.stashEntry}.`
      : '';

    finishInstallJob(jobId, {
      status: 'completed',
      message: `Обновления установлены, клиент пересобран. Перезапустите приложение для применения изменений.${installFallbackMessage}${stashMessage}`,
      statusAfter,
      stashCreated: stashResult.created,
      stashEntry: stashResult.stashEntry,
      stashedFiles: stashResult.dirtyFiles,
      installFallbackUsed,
    });
  } catch (error) {
    appendInstallJobLog(jobId, `Ошибка: ${getErrorText(error)}`);
    finishInstallJob(jobId, {
      status: 'failed',
      message: 'Не удалось установить обновления.',
      details: getErrorText(error),
    });
  }
}

function spawnDetachedInstallWorker(jobId) {
  const workerScript = path.join(__dirname, '..', 'workers', 'installUpdateJob.js');
  if (!fs.existsSync(workerScript)) {
    throw new Error('Файл worker для установки обновлений не найден.');
  }

  const child = spawn(process.execPath, [workerScript, jobId], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      PATH: process.env.PATH || DEFAULT_PATH,
    },
  });
  child.unref();
  return child;
}

module.exports = {
  createInstallJob,
  appendInstallJobLog,
  finishInstallJob,
  getConfiguredServiceName,
  getErrorText,
  getInstallJobSnapshot,
  getStoredInstallJob,
  getRestartSudoersHint,
  getUpdateStatus,
  hasSystemctl,
  isInstallInProgress,
  requiresInteractiveSudo,
  runInstallJob,
  spawnDetachedInstallWorker,
  tryJournalctlDetailed,
  tryRestartServiceDetailed,
  trySystemctlDetailed,
};
