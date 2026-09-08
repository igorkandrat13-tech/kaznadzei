import React, { useCallback, useEffect, useRef, useState } from 'react';
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
      normalized.includes('¦¬TÁTÂ¦¦¦¦')
      || normalized.includes('¦¬TÁTÂTÑ¦¦')
      || normalized.includes('TÃTÁTÂ¦-TÀ¦¦¦¬')
      || normalized.includes('¦-¦¦ ¦¬TÀ¦-TÈ')
      || normalized.includes('¦-¦¦¦¦¦-TÀTÀ¦¦¦¦TÂ')
      || normalized.includes('¦-¦¦¦¬¦-¦¬')
    );
}

function TelegramScannerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const autoOpenedRef = useRef(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('¦ÞTÂ¦¦TÀ¦-¦¦TÂ¦¦ ¦¦¦-¦-¦¦TÀTÃ ¦¬ ¦-¦-¦-¦¦¦+¦¬TÂ¦¦ ¦¦TÑ ¦-¦- QR-¦¦¦-¦+ ¦¬¦-¦¦¦-¦¬¦-.');
  const [bootstrappingSession, setBootstrappingSession] = useState(true);
  const [openingScanner, setOpeningScanner] = useState(false);
  useGlobalErrorEffect(error, '¦ÞTÈ¦¬¦-¦¦¦- Telegram Web App.');

  const bootstrapTelegramSession = useCallback(async ({ retries = 4 } = {}) => {
    markTelegramWebAppSession();
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

      // In Telegram Web App the signed auth payload may appear a bit later than the
      // URL query token. Give it a chance to arrive before trusting a stale token.
      if (!hasTelegramAuthPayload) {
        if (attempt < retries - 1) {
          await waitForTelegramAuth();
          continue;
        }
      }

      if (!hasTelegramAuthPayload && !sessionToken) {
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
          const errorMessage = data?.message || '¦Ý¦¦ TÃ¦+¦-¦¬¦-TÁTÌ ¦¬¦-¦+¦¦¦-TÂ¦-¦-¦¬TÂTÌ ¦+¦-TÁTÂTÃ¦¬ ¦¦ ¦¬¦-¦¦¦-¦¬TÃ.';
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
        await waitForTelegramAuth();
      }
    }

    if (lastError) {
      setError(lastError.message || '¦Ý¦¦ TÃ¦+¦-¦¬¦-TÁTÌ ¦¬¦-¦+¦¦¦-TÂ¦-¦-¦¬TÂTÌ ¦+¦-TÁTÂTÃ¦¬ ¦¦ ¦¬¦-¦¦¦-¦¬TÃ.');
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
            setStatus('¦ÞTÂ¦¦TÀTË¦-¦-TÎ TÁTÂTÀ¦-¦-¦¬TÆTÃ ¦¬¦-¦¦¦-¦¬¦-...');
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
      setError(scannerError.message || '¦Ý¦¦ TÃ¦+¦-¦¬¦-TÁTÌ ¦-TÂ¦¦TÀTËTÂTÌ ¦¦¦-¦-¦¦TÀTÃ.');
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
      <h2>¦á¦¦¦-¦-¦¬TÀ¦-¦-¦-¦-¦¬¦¦ QR-¦¦¦-¦+¦-</h2>
      <p className="text-muted" style={{ lineHeight: 1.6 }}>
        ¦ß¦-TÁ¦¬¦¦ TÁ¦¦¦-¦-¦¬TÀ¦-¦-¦-¦-¦¬TÏ ¦-TÂ¦¦TÀ¦-¦¦TÂTÁTÏ TÁTÂTÀ¦-¦-¦¬TÆ¦- ¦¬¦-¦¦¦-¦¬¦-.
      </p>

      <div className="scanner-status-box">
        {bootstrappingSession ? '¦ß¦-¦+¦¦¦-TÂ¦-¦-¦¬¦¬¦-¦-TÎ ¦+¦-TÁTÂTÃ¦¬...' : status}
      </div>

      {error && (
        <div className="settings-alert settings-alert-error mb-16" style={{ textAlign: 'left' }}>
          {error}
        </div>
      )}

      <div className="inline-actions-centered">
        <button className="btn btn-primary" onClick={openScanner} disabled={bootstrappingSession || openingScanner}>
          {bootstrappingSession ? '¦ß¦-¦+¦¦¦-TÂ¦-¦-¦¦¦-...' : openingScanner ? '¦ÞTÂ¦¦TÀTË¦-¦-TÎ...' : '¦ÞTÂ¦¦TÀTËTÂTÌ ¦¦¦-¦-¦¦TÀTÃ'}
        </button>
        <button className="btn btn-secondary" onClick={() => closeTelegramWebApp() || navigate('/')}>
          ¦×¦-¦¦TÀTËTÂTÌ
        </button>
      </div>
    </div>
  );
}

export default TelegramScannerPage;
