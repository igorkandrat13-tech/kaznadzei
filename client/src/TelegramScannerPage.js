import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { closeTelegramWebApp, getTelegramWebApp, markTelegramWebAppSession, openTelegramQrScanner, persistTelegramInitData, persistTelegramUnsafeUser } from './telegramWebApp';

function TelegramScannerPage() {
  const navigate = useNavigate();
  const autoOpenedRef = useRef(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Откройте камеру и наведите её на QR-код заказа.');

  const openScanner = useCallback(() => {
    openTelegramQrScanner({
      onSuccess: (orderPath) => navigate(orderPath),
      onError: setError,
      onStatusChange: setStatus,
    });
  }, [navigate]);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;

    markTelegramWebAppSession();
    persistTelegramInitData();
    persistTelegramUnsafeUser();

    if (typeof webApp.ready === 'function') {
      webApp.ready();
    }

    if (typeof webApp.expand === 'function') {
      webApp.expand();
    }
  }, []);

  useEffect(() => {
    const webApp = getTelegramWebApp();
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
        <button className="btn" onClick={() => closeTelegramWebApp() || navigate('/')}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

export default TelegramScannerPage;
