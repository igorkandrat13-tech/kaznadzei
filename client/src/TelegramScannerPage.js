﻿﻿﻿import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiFetch, parseJsonSafely } from './api';
import {
  buildTelegramOrderPath,
  closeTelegramWebApp,
  getTelegramEmployeeSessionToken,
  getTelegramInitData,
  getTelegramUnsafeUser,
  getTelegramWebApp,
  isTelegramEmployeeSessionTokenExpired,
  isTelegramWebApp,
  markTelegramWebAppSession,
  openTelegramQrScanner,
  persistTelegramInitData,
  persistTelegramUnsafeUser,
  setTelegramEmployeeSessionToken,
  tryExpandTelegramWebApp,
  tryReadyTelegramWebApp,
} from './telegramWebApp';
import { useGlobalErrorEffect } from './globalErrors';

function isRecoverableTelegramSessionMessage(message) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('session token telegram web app')
    && (
      normalized.includes('истек')
      || normalized.includes('истёк')
      || normalized.includes('устарел')
      || normalized.includes('не про')
      || normalized.includes('некоррект')
      || normalized.includes('непол')
    );
}

function TelegramScannerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const autoOpenedRef = useRef(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Откройте камеру и наведите её на QR-код заказа.');
  const [bootstrappingSession, setBootstrappingSession] = useState(true);
  const [openingScanner, setOpeningScanner] = useState(false);
  useGlobalErrorEffect(error, 'Ошибка Telegram Web App.');

  const bootstrapTelegramSession = useCallback(async ({ retries = 6 } = {}) => {
    markTelegramWebAppSession();
    const watchdogTimerId = { current: 0 };
    let cleanupWatchdogCalled = false;
    const cleanupWatchdog = () => {
      if (cleanupWatchdogCalled) return;
      cleanupWatchdogCalled = true;
      if (watchdogTimerId.current) {
        window.clearTimeout(watchdogTimerId.current);
        watchdogTimerId.current = 0;
      }
    };
    const watchdogPromise = new Promise((_, reject) => {
      watchdogTimerId.current = window.setTimeout(() => {
        cleanupWatchdog();
        reject(new Error('Таймаут подготовки доступа. Обновите страницу или откройте через кнопку в боте.'));
      }, 10000);
    });
    watchdogPromise.catch(() => {});

    const mainFlow = (async () => {
      let lastError = null;
      let currentSessionToken = getTelegramEmployeeSessionToken();
      const waitForTelegramAuth = () => new Promise(resolve => window.setTimeout(resolve, 350));

      for (let attempt = 0; attempt < retries; attempt += 1) {
        persistTelegramInitData();
        persistTelegramUnsafeUser();

        const initData = getTelegramInitData();
        const unsafeUser = getTelegramUnsafeUser();
        const hasTelegramAuthPayload = Boolean(initData || unsafeUser?.id);
        const sessionToken = currentSessionToken || getTelegramEmployeeSessionToken();
        const isLastAttempt = attempt === retries - 1;

        if (!hasTelegramAuthPayload && !sessionToken && !isLastAttempt) {
          await waitForTelegramAuth();
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
            const errorMessage = data?.message || 'Не удалось подготовить доступ к заказам.';
            if (sessionToken && isRecoverableTelegramSessionMessage(errorMessage)) {
              currentSessionToken = '';
              setTelegramEmployeeSessionToken('');
              if (!isLastAttempt) {
                await waitForTelegramAuth();
              }
              continue;
            }
            throw new Error(errorMessage);
          }
          currentSessionToken = data?.sessionToken || '';
          setTelegramEmployeeSessionToken(currentSessionToken);
          return Boolean(currentSessionToken);
        } catch (sessionError) {
          lastError = sessionError;
          if (!isLastAttempt) {
            await waitForTelegramAuth();
          }
        }
      }

      if (lastError) {
        setError(lastError.message || 'Не удалось подготовить доступ к заказам.');
      }
      return false;
    })();

    try {
      return await Promise.race([mainFlow, watchdogPromise]);
    } catch (watchdogOrFlowErr) {
      if (watchdogOrFlowErr?.message) {
        setError(String(watchdogOrFlowErr.message));
      } else {
        setError('Не удалось подготовить доступ. Пожалуйста, обновите страницу.');
      }
      return false;
    } finally {
      cleanupWatchdog();
    }
  }, []);

  const openScanner = useCallback(() => {
    if (bootstrappingSession || openingScanner) return;
    setError('');
    setOpeningScanner(true);
    try {
      openTelegramQrScanner({
        onSuccess: async (orderPath) => {
          try {
            setError('');
            setStatus('Открываю страницу заказа...');
            navigate(buildTelegramOrderPath(orderPath));
          } finally {
            setOpeningScanner(false);
          }
        },
        onError: (nextError) => {
          setError(nextError);
          setOpeningScanner(false);
        },
        onStatusChange: setStatus,
      });
    } catch (scannerError) {
      setError(scannerError.message || 'Не удалось открыть камеру.');
      setOpeningScanner(false);
    }
  }, [bootstrappingSession, navigate, openingScanner]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sessionTokenFromUrl = params.get('employeeSessionToken');
    if (!sessionTokenFromUrl) return;

    if (!isTelegramEmployeeSessionTokenExpired(sessionTokenFromUrl)) {
      setTelegramEmployeeSessionToken(sessionTokenFromUrl);
    }
    navigate('/telegram-app', { replace: true });
  }, [location.search, navigate]);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    const storedToken = getTelegramEmployeeSessionToken();
    if (!webApp && !storedToken) return undefined;
    if (webApp && !isTelegramWebApp() && !storedToken) return undefined;

    bootstrapTelegramSession()
      .finally(() => setBootstrappingSession(false));

    tryReadyTelegramWebApp();
    tryExpandTelegramWebApp();
    return undefined;
  }, [bootstrapTelegramSession]);

  useEffect(() => {
    if (autoOpenedRef.current || bootstrappingSession) return;

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
        <button className="btn btn-primary" onClick={openScanner} disabled={bootstrappingSession || openingScanner}>
          {bootstrappingSession ? 'Подготовка...' : openingScanner ? 'Открываю...' : 'Открыть камеру'}
        </button>
        <button className="btn btn-secondary" onClick={() => closeTelegramWebApp() || navigate('/')}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

export default TelegramScannerPage;
