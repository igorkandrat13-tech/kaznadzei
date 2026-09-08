﻿﻿import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  markTelegramWebAppSession,
  openTelegramQrScanner,
  persistTelegramInitData,
  persistTelegramUnsafeUser,
  setTelegramEmployeeSessionToken,
} from './telegramWebApp';
import { useGlobalErrorEffect } from './globalErrors';

function isRecoverableTelegramSessionMessage(message) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('session token telegram web app')
    && (
      normalized.includes('истек')
      || normalized.includes('истёк')
      || normalized.includes('устарел')
      || normalized.includes('не прош')
      || normalized.includes('некоррект')
      || normalized.includes('непол')
    );
}

function TelegramScannerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const autoOpenedRef = useRef(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Подготовка доступа к сканированию QR-кода изделия.');
  const [bootstrappingSession, setBootstrappingSession] = useState(true);
  const [openingScanner, setOpeningScanner] = useState(false);
  useGlobalErrorEffect(error, 'Ошибка Telegram Web App.');

  const bootstrapTelegramSession = useCallback(async ({ retries = 8 } = {}) => {
    markTelegramWebAppSession();
    let lastError = null;
    let currentSessionToken = getTelegramEmployeeSessionToken();
    const waitForTelegramAuth = () => new Promise(resolve => window.setTimeout(resolve, 400));

    for (let attempt = 0; attempt < retries; attempt += 1) {
      persistTelegramInitData();
      persistTelegramUnsafeUser();

      const initData = getTelegramInitData();
      const unsafeUser = getTelegramUnsafeUser();
      const hasTelegramAuthPayload = Boolean(initData || unsafeUser?.id);
      const sessionToken = currentSessionToken || getTelegramEmployeeSessionToken();
      const isLastAttempt = attempt === retries - 1;

      // In Telegram Web App the signed auth payload may appear a bit later than the
      // URL query token. Give it a chance to arrive before trusting a stale token.
      if (!hasTelegramAuthPayload) {
        if (attempt < retries - 1) {
          await waitForTelegramAuth();
          continue;
        }
      }

      if (!hasTelegramAuthPayload && !sessionToken && !isLastAttempt) {
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
            if (attempt < retries - 1) {
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
        if (attempt < retries - 1) {
          await waitForTelegramAuth();
        }
      }
    }

    if (lastError) {
      setError(lastError.message || 'Не удалось подготовить доступ к заказам. Если вы открыли страницу через кнопку в боте — запросите у администратора персональную ссылку и откройте её из чата Telegram.');
    } else {
      setError('Telegram не передал данные сотрудника (initData пустой). Если вы открыли страницу через кнопку в боте — запросите у администратора персональную ссылку с токеном и откройте её из чата Telegram.');
    }
    return false;
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
            setStatus('Переход к найденному изделию...');
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
      <h2>Сканер QR-кодов</h2>
      <p className="text-muted" style={{ lineHeight: 1.6 }}>
        Наведите камеру телефона на QR-код изделия.
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
          {bootstrappingSession ? 'Подготовка...' : openingScanner ? 'Переход...' : 'Открыть камеру'}
        </button>
        <button className="btn btn-secondary" onClick={() => closeTelegramWebApp() || navigate('/')}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

export default TelegramScannerPage;
