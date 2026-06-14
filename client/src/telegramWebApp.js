export function getTelegramWebApp() {
  return window.Telegram?.WebApp || null;
}

export function isTelegramWebApp() {
  const webApp = getTelegramWebApp();
  return Boolean(webApp && (webApp.initData || webApp.initDataUnsafe?.user));
}

export function getTelegramInitData() {
  return getTelegramWebApp()?.initData || '';
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
