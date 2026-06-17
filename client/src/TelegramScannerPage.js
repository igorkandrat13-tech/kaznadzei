import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  const location = useLocation();
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
          throw new Error(data?.message || 'Не удалось подготовить доступ к заказу.');
        }
        setTelegramEmployeeSessionToken(data?.sessionToken || '');
        return Boolean(data?.sessionToken);
      } catch (sessionError) {
        lastError = sessionError;
        await new Promise(resolve => window.setTimeout(resolve, 250));
      }
    }

    if (lastError) {
      setError(lastError.message || 'Не удалось подготовить доступ к заказу.');
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
    const params = new URLSearchParams(location.search);
    const sessionTokenFromUrl = params.get('employeeSessionToken');
    if (!sessionTokenFromUrl) return;

    setTelegramEmployeeSessionToken(sessionTokenFromUrl);
    navigate('/telegram-app', { replace: true });
  }, [location.search, navigate]);

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
    <div className="card scanner-card">
      <h2>Сканирование QR-кода</h2>
      <p className="text-muted" style={{ lineHeight: 1.6 }}>
        После сканирования откроется страница заказа.
      </p>

      <div className="scanner-status-box">
        {bootstrappingSession ? 'Подготавливаю доступ...' : status}
      </div>

      {error && (
        <div className="settings-alert settings-alert-error mb-16" style={{ textAlign: 'left' }}>
          {error}
        </div>
      )}

      <div className="inline-actions-centered">
        <button className="btn btn-primary" onClick={openScanner}>
          Открыть камеру
        </button>
        <button className="btn btn-secondary" onClick={() => closeTelegramWebApp() || navigate('/')}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

export default TelegramScannerPage;
