const express = require('express');
const { isSelfUpdateEnabled, requireAdminAccess } = require('../middleware/security');
const {
  appendInstallJobLog,
  createInstallJob,
  finishInstallJob,
  getErrorText,
  getInstallJobSnapshot,
  getStoredInstallJob,
  getUpdateStatus,
  isInstallInProgress,
  spawnDetachedInstallWorker,
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

module.exports = router;
