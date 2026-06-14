import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function getOrderPathFromQr(rawValue) {
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

function TelegramScannerPage() {
  const navigate = useNavigate();
  const autoOpenedRef = useRef(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Откройте камеру и наведите её на QR-код заказа.');

  const openScanner = useCallback(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp || typeof webApp.showScanQrPopup !== 'function') {
      setError('Сканирование доступно только внутри Telegram Web App на поддерживаемом устройстве.');
      return;
    }

    setError('');
    setStatus('Наведите камеру на QR-код заказа.');

    webApp.showScanQrPopup(
      { text: 'Наведите камеру на QR-код заказа' },
      (scannedText) => {
        const orderPath = getOrderPathFromQr(scannedText);
        if (!orderPath) {
          setError('QR-код не распознан. Используйте QR-код заказа, сгенерированный в системе.');
          return false;
        }

        if (typeof webApp.closeScanQrPopup === 'function') {
          webApp.closeScanQrPopup();
        }

        setStatus('Открываю страницу заказа...');
        navigate(orderPath);
        return true;
      }
    );
  }, [navigate]);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;

    if (typeof webApp.ready === 'function') {
      webApp.ready();
    }

    if (typeof webApp.expand === 'function') {
      webApp.expand();
    }
  }, []);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp || autoOpenedRef.current) return;

    autoOpenedRef.current = true;
    openScanner();
  }, [openScanner]);

  return (
    <div className="card" style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
      <h2>Сканирование QR-кода</h2>
      <p style={{ color: '#555', lineHeight: 1.6 }}>
        После сканирования откроется страница заказа прямо внутри Telegram Web App.
      </p>

      <div style={{ margin: '20px 0', padding: 16, borderRadius: 10, background: '#f7f8fa', color: '#2c3e50' }}>
        {status}
      </div>

      {error && (
        <div className="settings-alert settings-alert-error" style={{ textAlign: 'left', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={openScanner}>
          Открыть камеру
        </button>
        <button className="btn" onClick={() => navigate('/')}>
          На главную
        </button>
      </div>
    </div>
  );
}

export default TelegramScannerPage;
