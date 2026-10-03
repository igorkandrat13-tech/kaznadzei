const APP_AUTH_STORAGE_KEY = 'kaznadzei.app_auth';
const SETTINGS_PIN_STORAGE_KEY = 'kaznadzei.settings_pin_auth';
const APP_AUTH_EVENT = 'kaznadzei-auth-changed';

const PAGE_KEYS = ['orders', 'requests', 'archive', 'customers', 'employees', 'stages', 'users', 'settings'];

function notifyAuthChanged() {
  window.dispatchEvent(new Event(APP_AUTH_EVENT));
}

export function normalizePagePermissions(source = {}) {
  const pages = {};
  for (const key of PAGE_KEYS) {
    pages[key] = Boolean(source?.[key]);
  }
  return pages;
}

function readSessionFromStorage() {
  try {
    const raw = window.localStorage.getItem(APP_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionToStorage(session) {
  if (!session || !session.sessionToken || !session.role) {
    clearAppAuthSession();
    return;
  }
  const toSave = {
    sessionToken: String(session.sessionToken || ''),
    role: String(session.role || ''),
  };
  if (session.me && typeof session.me === 'object') {
    toSave.me = session.me;
  }
  if (session.permissions && typeof session.permissions === 'object') {
    toSave.permissions = normalizePagePermissions(session.permissions);
  }
  if (typeof session.fullAccess === 'boolean') {
    toSave.fullAccess = session.fullAccess;
  }
  window.localStorage.setItem(APP_AUTH_STORAGE_KEY, JSON.stringify(toSave));
  notifyAuthChanged();
}

export function getAppAuthSession() {
  const parsed = readSessionFromStorage();
  if (!parsed) return null;
  return {
    sessionToken: String(parsed.sessionToken || ''),
    role: String(parsed.role || ''),
  };
}

export function getAppAuthToken() {
  return readSessionFromStorage()?.sessionToken || '';
}

export function getAppAuthRole() {
  return readSessionFromStorage()?.role || '';
}

export function getAppAuthMe() {
  const parsed = readSessionFromStorage();
  if (!parsed || !parsed.me || typeof parsed.me !== 'object') return null;
  return parsed.me;
}

export function getAppAuthPermissions() {
  const parsed = readSessionFromStorage();
  if (!parsed) return normalizePagePermissions({});
  if (parsed.fullAccess) return normalizePagePermissions(PAGE_KEYS.reduce((acc, k) => { acc[k] = true; return acc; }, {}));
  return normalizePagePermissions(parsed.permissions || {});
}

export function canAccessPage(page, actualRoleOrPermissions = null) {
  if (!PAGE_KEYS.includes(page)) return false;
  const parsed = readSessionFromStorage();
  if (!parsed) return false;
  if (parsed.fullAccess) return true;
  const permissions = actualRoleOrPermissions && typeof actualRoleOrPermissions === 'object'
    ? normalizePagePermissions(actualRoleOrPermissions)
    : normalizePagePermissions(parsed.permissions || {});
  return Boolean(permissions[page]);
}

export function setAppAuthSession(session) {
  const nextSession = {
    sessionToken: String(session?.sessionToken || ''),
    role: String(session?.role || ''),
  };
  if (session?.me && typeof session.me === 'object') {
    nextSession.me = session.me;
  }
  if (session?.permissions && typeof session.permissions === 'object') {
    nextSession.permissions = normalizePagePermissions(session.permissions);
  } else if (session?.me?.role?.pages) {
    nextSession.permissions = normalizePagePermissions(session.me.role.pages);
  }
  if (typeof session?.fullAccess === 'boolean') {
    nextSession.fullAccess = session.fullAccess;
  } else if (session?.me?.fullAccess === true || session?.role === 'admin') {
    nextSession.fullAccess = true;
  } else {
    nextSession.fullAccess = Boolean(session?.me?.role?.isSystem);
  }
  writeSessionToStorage(nextSession);
}

export function clearAppAuthSession() {
  window.localStorage.removeItem(APP_AUTH_STORAGE_KEY);
  window.localStorage.removeItem(SETTINGS_PIN_STORAGE_KEY);
  notifyAuthChanged();
}

export function getSettingsPinSessionToken() {
  return window.localStorage.getItem(SETTINGS_PIN_STORAGE_KEY) || '';
}

export function setSettingsPinSessionToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) {
    clearSettingsPinSessionToken();
    return;
  }
  window.localStorage.setItem(SETTINGS_PIN_STORAGE_KEY, normalized);
  notifyAuthChanged();
}

export function clearSettingsPinSessionToken() {
  window.localStorage.removeItem(SETTINGS_PIN_STORAGE_KEY);
  notifyAuthChanged();
}

export function canAccessRole(requiredRole, actualRole = getAppAuthRole()) {
  if (requiredRole === 'manager') {
    const parsed = readSessionFromStorage();
    if (parsed?.fullAccess) return true;
    if (canAccessPage('orders', parsed?.permissions || null)) return true;
    return actualRole === 'manager' || actualRole === 'admin';
  }
  if (requiredRole === 'admin') {
    const parsed = readSessionFromStorage();
    if (parsed?.fullAccess) return true;
    if (canAccessPage('settings', parsed?.permissions || null)) return true;
    return actualRole === 'admin';
  }
  return false;
}

export function subscribeToAppAuth(callback) {
  window.addEventListener(APP_AUTH_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(APP_AUTH_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export { PAGE_KEYS };
