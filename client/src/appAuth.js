const APP_AUTH_STORAGE_KEY = 'kaznadzei.app_auth';
const APP_AUTH_EVENT = 'kaznadzei-auth-changed';

function notifyAuthChanged() {
  window.dispatchEvent(new Event(APP_AUTH_EVENT));
}

export function getAppAuthSession() {
  try {
    const raw = window.localStorage.getItem(APP_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return {
      sessionToken: String(parsed.sessionToken || ''),
      role: String(parsed.role || ''),
    };
  } catch {
    return null;
  }
}

export function getAppAuthToken() {
  return getAppAuthSession()?.sessionToken || '';
}

export function getAppAuthRole() {
  return getAppAuthSession()?.role || '';
}

export function setAppAuthSession(session) {
  const nextSession = {
    sessionToken: String(session?.sessionToken || ''),
    role: String(session?.role || ''),
  };

  if (!nextSession.sessionToken || !nextSession.role) {
    clearAppAuthSession();
    return;
  }

  window.localStorage.setItem(APP_AUTH_STORAGE_KEY, JSON.stringify(nextSession));
  notifyAuthChanged();
}

export function clearAppAuthSession() {
  window.localStorage.removeItem(APP_AUTH_STORAGE_KEY);
  notifyAuthChanged();
}

export function canAccessRole(requiredRole, actualRole = getAppAuthRole()) {
  if (requiredRole === 'manager') {
    return actualRole === 'manager' || actualRole === 'admin';
  }
  if (requiredRole === 'admin') {
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
