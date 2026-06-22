const { id, load, save } = require('../stores/store');
const SettingsStore = require('../stores/settingsStore');
const { getRoleLabel } = require('../config/roles');

const MAX_ACTIVITY_LOGS = 1000;

function buildActor(actor = {}) {
  if (!actor || typeof actor !== 'object') {
    return { type: 'system', label: 'Система' };
  }

  const type = String(actor.type || '').trim() || 'system';
  const role = String(actor.role || '').trim();
  const name = String(actor.name || '').trim();
  const settings = SettingsStore.get();
  const label = String(actor.label || '').trim()
    || name
    || (role === 'admin' ? 'Администратор'
      : role === 'manager' ? 'Менеджер'
        : (role ? getRoleLabel(role, settings.roles || settings.roleLabels || {}) : (type === 'system' ? 'Система' : type)));

  return {
    type,
    role,
    name,
    label,
  };
}

function addActivityLog(entry = {}) {
  const db = load();
  const nextEntry = {
    _id: id(),
    createdAt: new Date().toISOString(),
    action: String(entry.action || '').trim() || 'action',
    entityType: String(entry.entityType || '').trim() || '',
    entityId: String(entry.entityId || '').trim() || '',
    entityName: String(entry.entityName || '').trim() || '',
    message: String(entry.message || '').trim() || '',
    actor: buildActor(entry.actor),
    details: entry.details && typeof entry.details === 'object' ? entry.details : {},
  };

  db.activityLogs.push(nextEntry);
  if (db.activityLogs.length > MAX_ACTIVITY_LOGS) {
    db.activityLogs = db.activityLogs.slice(-MAX_ACTIVITY_LOGS);
  }
  save();
  return nextEntry;
}

function getActivityLogs({ limit = 200 } = {}) {
  const db = load();
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 200, MAX_ACTIVITY_LOGS));
  return db.activityLogs.slice(-normalizedLimit).reverse();
}

function clearActivityLogs() {
  const db = load();
  db.activityLogs = [];
  save();
}

function getRequestActor(req, fallback = {}) {
  if (req?.auth?.role) {
    return {
      type: 'app',
      role: req.auth.role,
      label: req.auth.role === 'admin' ? 'Администратор' : 'Менеджер',
      ...fallback,
    };
  }
  return buildActor(fallback);
}

module.exports = {
  addActivityLog,
  clearActivityLogs,
  getActivityLogs,
  getRequestActor,
};
