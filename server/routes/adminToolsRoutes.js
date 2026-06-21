const express = require('express');
const { requireAdminAccess } = require('../middleware/security');
const { getSnapshot, replaceSnapshot, normalizeDb } = require('../stores/store');
const OrderStore = require('../stores/orderStore');
const {
  addActivityLog,
  clearActivityLogs,
  getActivityLogs,
  getRequestActor,
} = require('../services/activityLog');

const router = express.Router();
const BACKUP_KEYS = ['orders', 'employees', 'processSteps', 'colors', 'settings', 'activityLogs'];

function countSnapshotEntities(snapshot = {}) {
  const db = normalizeDb(snapshot);
  return {
    orders: db.orders.length,
    employees: db.employees.length,
    processSteps: db.processSteps.length,
    colors: db.colors.length,
    activityLogs: db.activityLogs.length,
  };
}

function resolveBackupSource(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Файл резервной копии имеет неверный формат.');
  }

  if (payload.data && typeof payload.data === 'object') {
    if (payload.meta?.app && payload.meta.app !== 'kaznadzei') {
      throw new Error('Эта резервная копия создана не для проекта Kaznadzei.');
    }
    return payload.data;
  }

  const hasKnownBackupKeys = BACKUP_KEYS.some((key) => Object.prototype.hasOwnProperty.call(payload, key));
  if (!hasKnownBackupKeys) {
    throw new Error('Файл не похож на резервную копию Kaznadzei.');
  }

  return payload;
}

router.get('/backup/export', requireAdminAccess(), (req, res) => {
  const snapshot = getSnapshot();
  const fileName = `kaznadzei-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

  addActivityLog({
    action: 'backup.export',
    entityType: 'backup',
    entityName: fileName,
    actor: getRequestActor(req),
    message: 'Экспортирована резервная копия проекта.',
    details: countSnapshotEntities(snapshot),
  });

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.json({
    meta: {
      exportedAt: new Date().toISOString(),
      app: 'kaznadzei',
      version: 1,
    },
    data: snapshot,
  });
});

router.post('/backup/import', requireAdminAccess(), (req, res) => {
  try {
    const payload = req.body || {};
    const source = resolveBackupSource(payload);
    const snapshot = normalizeDb(source);

    replaceSnapshot(snapshot);
    OrderStore.syncStagesWithProcessSteps();

    const counts = countSnapshotEntities(snapshot);
    addActivityLog({
      action: 'backup.import',
      entityType: 'backup',
      entityName: 'db.json',
      actor: getRequestActor(req),
      message: 'Импортирована резервная копия проекта.',
      details: counts,
    });

    res.json({
      ok: true,
      message: 'Резервная копия успешно импортирована.',
      counts,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Не удалось импортировать резервную копию.' });
  }
});

router.get('/activity-logs', requireAdminAccess(), (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query?.limit) || 200, 1000));
  const logs = getActivityLogs({ limit });
  res.json({
    ok: true,
    logs,
    count: logs.length,
    limit,
  });
});

router.delete('/activity-logs', requireAdminAccess(), (req, res) => {
  clearActivityLogs();
  res.json({
    ok: true,
    message: 'Журнал действий очищен.',
  });
});

module.exports = router;
