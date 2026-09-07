const TELEGRAM_SESSION_STORAGE_KEY = 'kaznadzei.telegram_webapp';
const TELEGRAM_INIT_DATA_STORAGE_KEY = 'kaznadzei.telegram_init_data';
const TELEGRAM_UNSAFE_USER_STORAGE_KEY = 'kaznadzei.telegram_unsafe_user';
const TELEGRAM_EMPLOYEE_SESSION_TOKEN_KEY = 'kaznadzei.telegram_employee_session_token';
const TELEGRAM_EMPLOYEE_DIRECT_LINK_KEY = 'kaznadzei.telegram_employee_direct_link';

function getStorageBackends() {
  const backends = [];
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      backends.push(window.localStorage);
    }
  } catch (error) {
    // ignore
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      backends.push(window.sessionStorage);
    }
  } catch (error) {
    // ignore
  }
  return backends;
}

function storageGet(key) {
  const normalizedKey = String(key || '');
  if (!normalizedKey) return '';
  const backends = getStorageBackends();
  for (const backend of backends) {
    try {
      const value = backend.getItem(normalizedKey);
      if (value != null && value !== '') return value;
    } catch (error) {
      // ignore
    }
  }
  return '';
}

function storageSet(key, value) {
  const normalizedKey = String(key || '');
  const normalizedValue = value == null ? '' : String(value);
  if (!normalizedKey) return;
  const backends = getStorageBackends();
  for (const backend of backends) {
    try {
      if (normalizedValue === '') {
        backend.removeItem(normalizedKey);
      } else {
        backend.setItem(normalizedKey, normalizedValue);
      }
    } catch (error) {
      // ignore
    }
  }
}

function storageRemove(key) {
  storageSet(key, '');
}

function decodeBase64Url(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    return window.atob(padded);
  }
  return Buffer.from(padded, 'base64').toString('utf8');
}

function parseTelegramEmployeeSessionToken(sessionToken) {
  const normalizedSessionToken = String(sessionToken || '').trim();
  if (!normalizedSessionToken) return null;

  const [payloadPart] = normalizedSessionToken.split('.');
  if (!payloadPart) return null;

  try {
    return JSON.parse(decodeBase64Url(payloadPart));
  } catch (error) {
    return null;
  }
}

export function isTelegramEmployeeSessionTokenExpired(sessionToken, { graceMs = 0 } = {}) {
  const payload = parseTelegramEmployeeSessionToken(sessionToken);
  if (!payload) {
    return true;
  }
  if (!payload?.exp) {
    return false;
  }
  const graceWindow = Number(graceMs) >= 0 ? Number(graceMs) : 0;
  return Number(payload.exp) + graceWindow <= Date.now();
}

export function getTelegramWebApp() {
  return window.Telegram?.WebApp || null;
}

function maskTelegramValueForClientLog(raw, tail = 4) {
  if (raw == null || raw === '') return raw;
  const s = typeof raw === 'string' ? raw : String(raw);
  if (s.length <= tail) return '***';
  return `••••${s.slice(-tail)}`;
}

function getClientApiFetch() {
  try {
    if (typeof window !== 'undefined' && typeof window.__telegramDiagFetch === 'function') {
      return window.__telegramDiagFetch;
    }
  } catch (error) {
    // ignore
  }
  try {
    return (url, options) => fetch(url, options);
  } catch (error) {
    return null;
  }
}

function getTelegramClientDiagnosticsContext() {
  const webApp = typeof getTelegramWebApp === 'function' ? getTelegramWebApp() : null;
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 300) : '';
  return {
    clientTimestamp: new Date().toISOString(),
    hasWebApp: Boolean(webApp),
    webAppReadyState: typeof webApp !== 'undefined' && webApp && typeof webApp.isVersionAtLeast === 'function' ? 'ok' : (webApp ? 'minimal' : 'missing'),
    webAppHasInitData: Boolean(webApp && webApp.initData),
    webAppInitDataLength: webApp && webApp.initData ? String(webApp.initData).length : 0,
    webAppHasUnsafeUser: Boolean(webApp && webApp.initDataUnsafe && webApp.initDataUnsafe.user && webApp.initDataUnsafe.user.id),
    webAppUnsafeUserIdTail: maskTelegramValueForClientLog(webApp && webApp.initDataUnsafe && webApp.initDataUnsafe.user && webApp.initDataUnsafe.user.id, 4),
    platform: typeof webApp !== 'undefined' && webApp && webApp.platform ? String(webApp.platform) : '',
    version: typeof webApp !== 'undefined' && webApp && webApp.version ? String(webApp.version) : '',
    userAgent: ua,
    href: typeof location !== 'undefined' ? String(location.pathname || '').slice(0, 200) + (String(location.search || '').length > 0 ? '?…' : '') : '',
  };
}

export async function writeClientTelegramDiagnosticsLog(event, details = {}, scope = 'telegram-webapp') {
  const fallbackEvent = event || 'client.event';
  const normalizedScope = String(scope || 'telegram-webapp').toLowerCase().trim();
  try {
    const fetch = getClientApiFetch();
    if (!fetch) return false;
    const context = getTelegramClientDiagnosticsContext();
    const safeDetails = (() => {
      const out = {};
      const raw = details && typeof details === 'object' && !Array.isArray(details) ? details : { raw: details };
      Object.keys(raw).forEach((key) => {
        const normalizedKey = String(key || '').toLowerCase();
        const value = raw[key];
        const sensitive = normalizedKey.includes('token') || /(password|secret|key$|hash|signature|session|auth_date|initdata|bot.?token|telegramuserid|telegramchatid)/i.test(normalizedKey);
        if (sensitive) {
          if (value == null || value === '') {
            out[key] = value;
          } else if (typeof value === 'object') {
            out[key] = '[redacted object]';
          } else {
            out[key] = maskTelegramValueForClientLog(value, 4);
          }
          return;
        }
        if (typeof value === 'string' && value.length > 3000) {
          out[key] = `${value.slice(0, 3000)}… [truncated ${value.length - 3000} chars]`;
          return;
        }
        out[key] = value;
      });
      return out;
    })();
    const response = await fetch('/api/telegram/client-diagnostics-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: normalizedScope,
        event: String(fallbackEvent).slice(0, 128),
        details: {
          ...safeDetails,
          clientContext: context,
        },
      }),
    });
    return Boolean(response && response.ok);
  } catch (error) {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('[telegram-diag] client log failed:', error && error.message ? error.message : String(error));
    }
    return false;
  }
}

export function markTelegramWebAppSession() {
  storageSet(TELEGRAM_SESSION_STORAGE_KEY, '1');
}

export function persistTelegramInitData() {
  const initData = getTelegramWebApp()?.initData || '';
  if (initData) {
    storageSet(TELEGRAM_INIT_DATA_STORAGE_KEY, initData);
    return initData;
  }
  return storageGet(TELEGRAM_INIT_DATA_STORAGE_KEY) || '';
}

export function persistTelegramUnsafeUser() {
  const unsafeUser = getTelegramWebApp()?.initDataUnsafe?.user || null;
  if (unsafeUser?.id) {
    storageSet(TELEGRAM_UNSAFE_USER_STORAGE_KEY, JSON.stringify(unsafeUser));
    return unsafeUser;
  }
  const storedRaw = storageGet(TELEGRAM_UNSAFE_USER_STORAGE_KEY);
  if (!storedRaw) return null;
  try {
    return JSON.parse(storedRaw);
  } catch (error) {
    return null;
  }
}

export function hasTelegramWebAppSession() {
  return storageGet(TELEGRAM_SESSION_STORAGE_KEY) === '1';
}

export function isTelegramWebApp() {
  const webApp = getTelegramWebApp();
  return Boolean(webApp && (webApp.initData || webApp.initDataUnsafe?.user || hasTelegramWebAppSession()));
}

export function getTelegramInitData() {
  const freshInitData = persistTelegramInitData();
  if (freshInitData) {
    return freshInitData;
  }
  return storageGet(TELEGRAM_INIT_DATA_STORAGE_KEY) || '';
}

export function getTelegramUnsafeUser() {
  const freshUnsafeUser = persistTelegramUnsafeUser();
  if (freshUnsafeUser?.id) {
    return freshUnsafeUser;
  }
  const storedRaw = storageGet(TELEGRAM_UNSAFE_USER_STORAGE_KEY);
  try {
    return storedRaw ? JSON.parse(storedRaw) : null;
  } catch (error) {
    return null;
  }
}

export function setTelegramEmployeeSessionToken(sessionToken) {
  storageSet(TELEGRAM_EMPLOYEE_SESSION_TOKEN_KEY, String(sessionToken || ''));
}

export function getTelegramEmployeeSessionToken() {
  const storedToken = storageGet(TELEGRAM_EMPLOYEE_SESSION_TOKEN_KEY);
  if (storedToken && isTelegramEmployeeSessionTokenExpired(storedToken)) {
    storageRemove(TELEGRAM_EMPLOYEE_SESSION_TOKEN_KEY);
    return '';
  }
  return storedToken;
}

export function setTelegramEmployeeDirectLink(value) {
  storageSet(TELEGRAM_EMPLOYEE_DIRECT_LINK_KEY, value == null ? '' : String(value));
}

export function getTelegramEmployeeDirectLink() {
  return storageGet(TELEGRAM_EMPLOYEE_DIRECT_LINK_KEY) || '';
}

export function getOrderPathFromQr(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  const itemMatch = value.match(/\/order\/([^/?#]+)\/item\/([^/?#]+)/i);
  if (itemMatch?.[1] && itemMatch?.[2]) {
    return `/order/${decodeURIComponent(itemMatch[1])}/item/${decodeURIComponent(itemMatch[2])}`;
  }

  const directMatch = value.match(/\/order\/([^/?#]+)/i);
  if (directMatch?.[1]) {
    return `/order/${decodeURIComponent(directMatch[1])}`;
  }

  if (/^[a-zA-Z0-9_-]{6,}$/.test(value)) {
    return `/order/${value}`;
  }

  return '';
}

export function buildTelegramOrderPath(orderPath, sessionToken = getTelegramEmployeeSessionToken(), employeeLink = getTelegramEmployeeDirectLink()) {
  const normalizedPath = String(orderPath || '').trim();
  if (!normalizedPath) return '';

  const [pathWithoutHash, hashPart = ''] = normalizedPath.split('#', 2);
  const url = new URL(pathWithoutHash, window.location.origin);
  if (employeeLink) {
    url.searchParams.set('employeeLink', String(employeeLink));
  }
  if (sessionToken && !url.searchParams.get('employeeLink')) {
    url.searchParams.set('employeeSessionToken', String(sessionToken));
  }

  return `${url.pathname}${url.search}${hashPart ? `#${hashPart}` : ''}`;
}

export function openTelegramQrScanner({ onSuccess, onError, onStatusChange } = {}) {
  const webApp = getTelegramWebApp();
  if (!webApp || typeof webApp.showScanQrPopup !== 'function') {
    onError?.('Сканирование доступно только в приложении Telegram на поддерживаемом устройстве.');
    return false;
  }

  onError?.('');
  onStatusChange?.('Наведите камеру на QR-код заказа.');

  webApp.showScanQrPopup(
    { text: 'Наведите камеру на QR-код заказа' },
    (scannedText) => {
      const orderPath = getOrderPathFromQr(scannedText);
      if (!orderPath) {
        onError?.('QR-код не распознан. Используйте QR-код заказа, сгенерированный в системе.');
        return false;
      }

      if (typeof webApp.closeScanQrPopup === 'function') {
        webApp.closeScanQrPopup();
      }

      onStatusChange?.('Открываю страницу заказа...');
      onSuccess?.(orderPath);
      return true;
    }
  );

  return true;
}

export function closeTelegramWebApp() {
  const webApp = getTelegramWebApp();
  if (webApp && typeof webApp.close === 'function') {
    webApp.close();
    return true;
  }
  return false;
}
