const express = require('express');
const { isSelfUpdateEnabled, requireAdminAccess } = require('../middleware/security');
const {
  appendInstallJobLog,
  createInstallJob,
  finishInstallJob,
  getConfiguredServiceName,
  getErrorText,
  getInstallJobSnapshot,
  getStoredInstallJob,
  getSudoersHint,
  getUpdateStatus,
  hasSystemctl,
  isInstallInProgress,
  requiresInteractiveSudo,
  spawnDetachedInstallWorker,
  tryJournalctlDetailed,
  trySystemctlDetailed,
} = require('../services/updateService');

const router = express.Router();

router.get('/updates/status', requireAdminAccess(), async (req, res) => {
  const installJob = getStoredInstallJob();
  const installInProgress = installJob?.status === 'running';

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
      installJob: getInstallJobSnapshot(installJob),
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

router.get('/updates/install-status', requireAdminAccess(), (req, res) => {
  const installJob = getStoredInstallJob();
  res.json({
    installInProgress: installJob?.status === 'running',
    installJob: getInstallJobSnapshot(installJob),
  });
});

router.post('/updates/install', requireAdminAccess(), async (req, res) => {
  if (!isSelfUpdateEnabled()) {
    return res.status(403).json({ message: 'Self-update отключен. Включите ENABLE_SELF_UPDATE=true в .env.' });
  }

  const installJob = getStoredInstallJob();
  if (installJob?.status === 'running' || isInstallInProgress()) {
    return res.status(409).json({
      message: 'Установка обновлений уже выполняется.',
      installJob: getInstallJobSnapshot(installJob),
    });
  }

  try {
    const job = createInstallJob();
    appendInstallJobLog(job.id, 'Detached worker для установки обновлений создан.');
    try {
      spawnDetachedInstallWorker(job.id);
    } catch (spawnError) {
      finishInstallJob(job.id, {
        status: 'failed',
        message: 'Не удалось запустить фоновую установку обновлений.',
        details: getErrorText(spawnError),
      });
      return res.status(500).json({
        message: 'Не удалось запустить фоновую установку обновлений.',
        details: getErrorText(spawnError),
        installJob: getInstallJobSnapshot(getStoredInstallJob()),
      });
    }

    res.status(202).json({
      ok: true,
      accepted: true,
      message: 'Установка обновлений запущена в отдельном фоне. Страница будет отслеживать её статус без длинного HTTP-запроса.',
      installJob: getInstallJobSnapshot(job),
    });
  } catch (error) {
    res.status(500).json({
      message: 'Не удалось запустить установку обновлений.',
      details: getErrorText(error),
    });
  }
});

router.post('/updates/restart-service', requireAdminAccess(), async (req, res) => {
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

router.get('/updates/service-details', requireAdminAccess(), async (req, res) => {
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
