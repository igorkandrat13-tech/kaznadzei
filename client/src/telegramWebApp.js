const TELEGRAM_SESSION_STORAGE_KEY = 'kaznadzei.telegram_webapp';
const TELEGRAM_INIT_DATA_STORAGE_KEY = 'kaznadzei.telegram_init_data';

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

export function hasTelegramWebAppSession() {
  try {
    return window.sessionStorage?.getItem(TELEGRAM_SESSION_STORAGE_KEY) === '1';
  } catch (error) {
    return false;
  }
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

  try {
    return window.sessionStorage?.getItem(TELEGRAM_INIT_DATA_STORAGE_KEY) || '';
  } catch (error) {
    return '';
  }
}

export function getOrderPathFromQr(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  const directMatch = value.match(/\/order\/([^/?#]+)/i);
  if (directMatch?.[1]) {
    return `/order/${decodeURIComponent(directMatch[1])}`;
  }

  if (/^[a-zA-Z0-9_-]{6,}$/.test(value)) {
    return `/order/${value}`;
  }

  return '';
}

export function openTelegramQrScanner({ onSuccess, onError, onStatusChange } = {}) {
  const webApp = getTelegramWebApp();
  if (!webApp || typeof webApp.showScanQrPopup !== 'function') {
    onError?.('Сканирование доступно только внутри Telegram Web App на поддерживаемом устройстве.');
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
