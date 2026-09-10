﻿﻿﻿﻿﻿﻿﻿﻿﻿const TELEGRAM_SESSION_STORAGE_KEY = 'kaznadzei.telegram_webapp';
const TELEGRAM_INIT_DATA_STORAGE_KEY = 'kaznadzei.telegram_init_data';
const TELEGRAM_UNSAFE_USER_STORAGE_KEY = 'kaznadzei.telegram_unsafe_user';
const TELEGRAM_EMPLOYEE_SESSION_TOKEN_KEY = 'kaznadzei.telegram_employee_session_token';

function decodeBase64Url(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return window.atob(padded);
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

export function isTelegramEmployeeSessionTokenExpired(sessionToken) {
  const payload = parseTelegramEmployeeSessionToken(sessionToken);
  if (!payload?.exp) {
    return Boolean(String(sessionToken || '').trim());
  }
  return Number(payload.exp) <= Date.now();
}

export function getTelegramWebApp() {
  return window.Telegram?.WebApp || null;
}

export function markTelegramWebAppSession() {
  try {
    window.sessionStorage?.setItem(TELEGRAM_SESSION_STORAGE_KEY, '1');
  } catch (error) {
    // Ignore storage issues in restricted webviews.
  }
}

export function persistTelegramInitData() {
  const initData = getTelegramWebApp()?.initData || '';
  if (!initData) return '';

  try {
    window.sessionStorage?.setItem(TELEGRAM_INIT_DATA_STORAGE_KEY, initData);
  } catch (error) {
    // Ignore storage issues in restricted webviews.
  }

  return initData;
}

export function persistTelegramUnsafeUser() {
  const unsafeUser = getTelegramWebApp()?.initDataUnsafe?.user || null;
  if (!unsafeUser?.id) return null;

  try {
    window.sessionStorage?.setItem(TELEGRAM_UNSAFE_USER_STORAGE_KEY, JSON.stringify(unsafeUser));
  } catch (error) {
    // Ignore storage issues in restricted webviews.
  }

  return unsafeUser;
}

export function hasTelegramWebAppSession() {
  try {
    return window.sessionStorage?.getItem(TELEGRAM_SESSION_STORAGE_KEY) === '1';
  } catch (error) {
    return false;
  }
}

export function isTelegramWebApp() {
  const webApp = getTelegramWebApp();
  const storageToken = Boolean(getTelegramEmployeeSessionToken());
  const urlToken = Boolean(readTelegramUrlSessionToken());
  return Boolean(
    (webApp && (webApp.initData || webApp.initDataUnsafe?.user || hasTelegramWebAppSession()))
    || storageToken
    || urlToken,
  );
}

export function getTelegramInitData() {
  const freshInitData = persistTelegramInitData();
  if (freshInitData) {
    return freshInitData;
  }

  try {
    return window.sessionStorage?.getItem(TELEGRAM_INIT_DATA_STORAGE_KEY) || '';
  } catch (error) {
    return '';
  }
}

export function getTelegramUnsafeUser() {
  const freshUnsafeUser = persistTelegramUnsafeUser();
  if (freshUnsafeUser?.id) {
    return freshUnsafeUser;
  }

  try {
    const storedUnsafeUser = window.sessionStorage?.getItem(TELEGRAM_UNSAFE_USER_STORAGE_KEY);
    return storedUnsafeUser ? JSON.parse(storedUnsafeUser) : null;
  } catch (error) {
    return null;
  }
}

export function setTelegramEmployeeSessionToken(sessionToken) {
  try {
    if (sessionToken) {
      window.sessionStorage?.setItem(TELEGRAM_EMPLOYEE_SESSION_TOKEN_KEY, String(sessionToken));
      return;
    }
    window.sessionStorage?.removeItem(TELEGRAM_EMPLOYEE_SESSION_TOKEN_KEY);
  } catch (error) {
    // Ignore storage issues in restricted webviews.
  }
}

export function getTelegramEmployeeSessionToken() {
  try {
    const storedToken = window.sessionStorage?.getItem(TELEGRAM_EMPLOYEE_SESSION_TOKEN_KEY) || '';
    if (storedToken && isTelegramEmployeeSessionTokenExpired(storedToken)) {
      window.sessionStorage?.removeItem(TELEGRAM_EMPLOYEE_SESSION_TOKEN_KEY);
      return '';
    }
    return storedToken;
  } catch (error) {
    return '';
  }
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

export function buildTelegramOrderPath(orderPath, sessionToken = getTelegramEmployeeSessionToken()) {
  const normalizedPath = String(orderPath || '').trim();
  if (!normalizedPath) return '';

  const [pathWithoutHash, hashPart = ''] = normalizedPath.split('#', 2);
  const [pathWithoutSearch, searchPart = ''] = pathWithoutHash.split('?', 2);
  const url = new URL(pathWithoutSearch + (searchPart ? `?${searchPart}` : ''), window.location.origin);
  if (sessionToken) {
    url.searchParams.set('employeeSessionToken', String(sessionToken));
    const hashParams = new URLSearchParams(hashPart);
    hashParams.set('token', String(sessionToken));
    const hashStr = hashParams.toString();
    url.hash = hashStr;
  } else if (hashPart) {
    url.hash = hashPart;
  }

  return `${url.pathname}${url.search}${url.hash ? url.hash : ''}`;
}

export function readTelegramUrlSessionToken() {
  if (typeof window === 'undefined' || !window.location) return '';
  const pathname = String(window.location.pathname || '');
  const pathMatch = pathname.match(/^\/telegram-app\/t\/([^/]+)\/?/);
  if (pathMatch && pathMatch[1]) {
    const pathToken = String(pathMatch[1]).trim();
    if (pathToken && pathToken.length > 32 && !isTelegramEmployeeSessionTokenExpired(pathToken)) {
      return pathToken;
    }
  }
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const queryToken = String(searchParams.get('employeeSessionToken') || '').trim();
    if (queryToken && queryToken.length > 32 && !isTelegramEmployeeSessionTokenExpired(queryToken)) {
      return queryToken;
    }
  } catch (_) { /* ignore */ }
  try {
    const rawHash = String(window.location.hash || '').replace(/^#/, '');
    const hashParams = new URLSearchParams(rawHash);
    const hashToken = String(hashParams.get('token') || '').trim();
    if (hashToken && hashToken.length > 32 && !isTelegramEmployeeSessionTokenExpired(hashToken)) {
      return hashToken;
    }
  } catch (_) { /* ignore */ }
  return '';
}

export function readTelegramUrlSessionTokenRaw() {
  if (typeof window === 'undefined' || !window.location) return { token: '', length: 0 };
  const pathname = String(window.location.pathname || '');
  const pathMatch = pathname.match(/^\/telegram-app\/t\/([^/]+)\/?/);
  if (pathMatch && pathMatch[1]) {
    const pathToken = String(pathMatch[1]);
    return { token: pathToken, length: pathToken.length };
  }
  let token = '';
  let length = 0;
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const raw = searchParams.get('employeeSessionToken');
    if (raw) {
      token = String(raw);
      length = String(raw).length;
    }
  } catch (_) { /* ignore */ }
  if (token) return { token, length };
  try {
    const rawHash = String(window.location.hash || '').replace(/^#/, '');
    const hashParams = new URLSearchParams(rawHash);
    const raw = hashParams.get('token');
    if (raw) {
      token = String(raw);
      length = String(raw).length;
    }
  } catch (_) { /* ignore */ }
  return { token, length };
}

export function isTelegramUrlSessionTokenValid() {
  const token = readTelegramUrlSessionToken();
  return Boolean(token);
}

export function openTelegramQrScanner({ onSuccess, onError, onStatusChange } = {}) {
  const webApp = getTelegramWebApp();
  if (!webApp || typeof webApp.showScanQrPopup !== 'function') {
    onError?.('Камера для сканирования QR-кодов недоступна. Откройте эту страницу через Telegram, используя кнопку в боте.');
    return false;
  }

  onError?.('');
  onStatusChange?.('Подготовка камеры для сканирования QR-кода изделия.');

  const IGNORE_EVENTS = new Set([
    'WebAppScanQrPopupOpened',
    'WebAppScanQrPopupClosed',
    'qrTextReceived',
    'popupOpened',
    'scanQrPopupClosed',
  ]);

  let popupClosed = false;
  let succeeded = false;
  let closedHandler = null;
  try {
    closedHandler = () => { popupClosed = true; };
    webApp.onEvent?.('scanQrPopupClosed', closedHandler);
  } catch (_e) { /* ignore */ }

  webApp.showScanQrPopup(
    { text: 'Подготовка камеры для сканирования QR-кода изделия' },
    (rawScannedText) => {
      try {
        if (webApp.offEvent && closedHandler) {
          try { webApp.offEvent('scanQrPopupClosed', closedHandler); } catch (_) { /* ignore */ }
        }
      } catch (_offErr) { /* ignore */ }

      if (popupClosed) return false;
      if (succeeded) return false;

      let scannedText = rawScannedText;

      if (typeof scannedText === 'string') {
        const trimmed = scannedText.trim();
        if (!trimmed) return false;
        if (IGNORE_EVENTS.has(trimmed)) return false;
        if (/^WebApp[A-Za-z]+$/.test(trimmed)) return false;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object') {
            if (typeof parsed.data === 'string' && parsed.data) {
              scannedText = parsed.data;
            } else if (typeof parsed.text === 'string' && parsed.text) {
              scannedText = parsed.text;
            } else {
              return false;
            }
          }
        } catch (_jsonErr) { /* не JSON, используем как есть */ }
      }

      const orderPath = getOrderPathFromQr(scannedText);
      if (!orderPath) {
        onError?.('QR-код не распознан. Используйте QR-код изделия, расположенный на упаковке.');
        return false;
      }

      succeeded = true;

      if (typeof webApp.closeScanQrPopup === 'function') {
        try { webApp.closeScanQrPopup(); } catch (_) { /* ignore */ }
      }

      onStatusChange?.('Переход к найденному изделию...');
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
