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

function matchesActivityLogFilters(entry = {}, filters = {}) {
  const details = entry?.details && typeof entry.details === 'object' ? entry.details : {};
  const orderId = String(filters?.orderId || '').trim();
  const itemId = String(filters?.itemId || '').trim();
  const columnKey = String(filters?.columnKey || '').trim();

  if (orderId && String(details.orderId || '').trim() !== orderId) {
    return false;
  }
  if (itemId && String(details.itemId || '').trim() !== itemId) {
    return false;
  }
  if (columnKey && String(details.columnKey || '').trim() !== columnKey) {
    return false;
  }
  return true;
}

function getActivityLogs({ limit = 200, filters = {} } = {}) {
  const db = load();
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 200, MAX_ACTIVITY_LOGS));
  return db.activityLogs
    .filter((entry) => matchesActivityLogFilters(entry, filters))
    .slice(-normalizedLimit)
    .reverse();
}

function clearActivityLogs() {
  const db = load();
  db.activityLogs = [];
  save();
}

function getRequestActor(req, fallback = {}) {
  const auth = req?.auth || null;
  if (auth) {
    const employeeName = String(auth.employeeName || auth.employee_fullName || '').trim();
    const username = String(auth.username || '').trim();
    const userId = String(auth.userId || '').trim();
    const employeeId = String(auth.employeeId || '').trim();
    const roleKey = String(auth.roleKey || auth.roleKeyLabel || auth.role || '').trim();
    const permissionPages = auth.permissions && typeof auth.permissions === 'object' ? auth.permissions : null;
    const pagesCount = permissionPages
      ? Object.values(permissionPages).filter(Boolean).length
      : null;
    let label = String(fallback?.label || '').trim() || '';
    let name = String(fallback?.name || '').trim() || employeeName || username || '';
    if (!label) {
      if (employeeName) label = employeeName;
      else if (username) label = username;
      else if (auth.role === 'admin') label = 'Администратор';
      else if (auth.role === 'manager') label = 'Менеджер';
      else label = roleKey || (auth.fullAccess ? 'Администратор' : 'Пользователь');
    }
    return {
      type: userId ? 'user' : (employeeId ? 'employee' : 'app'),
      role: auth.role || roleKey || '',
      roleKey,
      roleLabel: label,
      name,
      label,
      userId,
      employeeId,
      pagesCount,
      ...fallback,
      name: fallback?.name || name,
      label: fallback?.label || label,
      role: fallback?.role || auth.role || roleKey || '',
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
