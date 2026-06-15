import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, parseJsonSafely } from './api';
import {
  closeTelegramWebApp,
  getTelegramEmployeeSessionToken,
  getTelegramInitData,
  getTelegramUnsafeUser,
  getTelegramWebApp,
  markTelegramWebAppSession,
  openTelegramQrScanner,
  persistTelegramInitData,
  persistTelegramUnsafeUser,
  setTelegramEmployeeSessionToken,
} from './telegramWebApp';

function TelegramScannerPage() {
  const navigate = useNavigate();
  const autoOpenedRef = useRef(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Откройте камеру и наведите её на QR-код заказа.');
  const [bootstrappingSession, setBootstrappingSession] = useState(true);

  const bootstrapTelegramSession = useCallback(async ({ retries = 4 } = {}) => {
    markTelegramWebAppSession();
    let lastError = null;

    for (let attempt = 0; attempt < retries; attempt += 1) {
      persistTelegramInitData();
      persistTelegramUnsafeUser();

      const initData = getTelegramInitData();
      const unsafeUser = getTelegramUnsafeUser();
      const sessionToken = getTelegramEmployeeSessionToken();

      if (!initData && !unsafeUser?.id && !sessionToken) {
        await new Promise(resolve => window.setTimeout(resolve, 250));
        continue;
      }

      try {
        const res = await apiFetch('/api/telegram/webapp/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initData,
            unsafeUser,
            sessionToken,
          }),
        });
        const data = await parseJsonSafely(res);
        if (!res.ok) {
          throw new Error(data?.message || 'Не удалось подготовить Telegram-сессию.');
        }
        setTelegramEmployeeSessionToken(data?.sessionToken || '');
        return Boolean(data?.sessionToken);
      } catch (sessionError) {
        lastError = sessionError;
        await new Promise(resolve => window.setTimeout(resolve, 250));
      }
    }

    if (lastError) {
      setError(lastError.message || 'Не удалось подготовить Telegram-сессию.');
    }
    return false;
  }, []);

  const openScanner = useCallback(() => {
    openTelegramQrScanner({
      onSuccess: async (orderPath) => {
        setStatus('Подготавливаю доступ к заказу...');
        await bootstrapTelegramSession({ retries: 6 });
        navigate(orderPath);
      },
      onError: setError,
      onStatusChange: setStatus,
    });
  }, [bootstrapTelegramSession, navigate]);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;

    bootstrapTelegramSession()
      .finally(() => setBootstrappingSession(false));

    if (typeof webApp.ready === 'function') {
      webApp.ready();
    }

    if (typeof webApp.expand === 'function') {
      webApp.expand();
    }
  }, [bootstrapTelegramSession]);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp || autoOpenedRef.current || bootstrappingSession) return;

    autoOpenedRef.current = true;
    openScanner();
  }, [bootstrappingSession, openScanner]);

  return (
    <div className="card" style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
      <h2>Сканирование QR-кода</h2>
      <p style={{ color: '#555', lineHeight: 1.6 }}>
        После сканирования откроется страница заказа прямо внутри Telegram Web App.
      </p>

      <div style={{ margin: '20px 0', padding: 16, borderRadius: 10, background: '#f7f8fa', color: '#2c3e50' }}>
        {bootstrappingSession ? 'Подготавливаю Telegram-сессию сотрудника...' : status}
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
