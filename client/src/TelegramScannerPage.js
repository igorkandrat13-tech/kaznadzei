import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiFetch, parseJsonSafely } from './api';
import {
  buildTelegramOrderPath,
  closeTelegramWebApp,
  getTelegramEmployeeSessionToken,
  getTelegramInitData,
  getTelegramEmployeeDirectLink,
  getTelegramUnsafeUser,
  getTelegramWebApp,
  isTelegramEmployeeSessionTokenExpired,
  markTelegramWebAppSession,
  openTelegramQrScanner,
  persistTelegramInitData,
  persistTelegramUnsafeUser,
  setTelegramEmployeeDirectLink,
  setTelegramEmployeeSessionToken,
  writeClientTelegramDiagnosticsLog,
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
  const [status, setStatus] = useState('Откройте камеру и наведите её на QR-код заказа.');
  const [bootstrappingSession, setBootstrappingSession] = useState(true);
  const [openingScanner, setOpeningScanner] = useState(false);
  useGlobalErrorEffect(error, 'Ошибка Telegram Web App.');

  const bootstrapTelegramSession = useCallback(async ({ retries = 12 } = {}) => {
    markTelegramWebAppSession();
    let lastError = null;
    let currentSessionToken = getTelegramEmployeeSessionToken();
    let currentEmployeeLink = getTelegramEmployeeDirectLink();
    const waitForTelegramAuth = (delayMs = 500) => new Promise(resolve => window.setTimeout(resolve, delayMs));

    for (let attempt = 0; attempt < retries; attempt += 1) {
      persistTelegramInitData();
      persistTelegramUnsafeUser();

      const directWebApp = getTelegramWebApp();
      const initData = getTelegramInitData() || (directWebApp?.initData || '');
      const unsafeUser = getTelegramUnsafeUser() || (directWebApp?.initDataUnsafe?.user || null);
      const hasTelegramAuthPayload = Boolean(initData || unsafeUser?.id);
      const sessionToken = currentSessionToken || getTelegramEmployeeSessionToken();
      const employeeLink = currentEmployeeLink || getTelegramEmployeeDirectLink();

      writeClientTelegramDiagnosticsLog('scanner.bootstrap.attempt', {
        attempt,
        totalRetries: retries,
        hasEmployeeLink: Boolean(employeeLink),
        hasSessionToken: Boolean(sessionToken),
        hasInitData: Boolean(initData),
        hasUnsafeUserId: Boolean(unsafeUser?.id),
        initDataLength: initData ? String(initData).length : 0,
      }, 'telegram-scanner');

      if ((attempt === 0 || attempt === 2 || attempt === 4 || attempt === 6 || attempt === 8 || attempt === 10) && !employeeLink) {
        try {
          writeClientTelegramDiagnosticsLog('scanner.bootstrap.call', {
            attempt,
            hasInitData: Boolean(initData),
            hasUnsafeUserId: Boolean(unsafeUser?.id),
          }, 'telegram-scanner');
          const bootstrapRes = await apiFetch('/api/telegram/webapp/bootstrap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData, unsafeUser, scope: 'scanner-bootstrap' }),
          });
          if (bootstrapRes.ok) {
            const bootstrapData = await parseJsonSafely(bootstrapRes);
            if (bootstrapData?.employeeLink) {
              currentEmployeeLink = String(bootstrapData.employeeLink || '');
              setTelegramEmployeeDirectLink(currentEmployeeLink);
            }
            if (bootstrapData?.sessionToken) {
              currentSessionToken = String(bootstrapData.sessionToken || '');
              setTelegramEmployeeSessionToken(currentSessionToken);
            }
            if (bootstrapData?.employee) {
              const stableNow = currentEmployeeLink || getTelegramEmployeeDirectLink();
              const sessionNow = currentSessionToken || getTelegramEmployeeSessionToken();
              if (stableNow || sessionNow) {
                writeClientTelegramDiagnosticsLog('scanner.bootstrap.success', {
                  attempt,
                  hasEmployeeLink: Boolean(stableNow),
                  hasSessionToken: Boolean(sessionNow),
                  employeeId: bootstrapData.employee._id ? String(bootstrapData.employee._id).slice(-6) : '',
                  employeeRole: String(bootstrapData.employee.role || '').slice(0, 80),
                }, 'telegram-scanner');
                return true;
              }
            }
            if (bootstrapData?.needBotAuth && attempt < retries - 1) {
              writeClientTelegramDiagnosticsLog('scanner.bootstrap.need-bot-auth-wait', {
                attempt,
                message: (bootstrapData.message || '').slice(0, 255),
              }, 'telegram-scanner');
              await waitForTelegramAuth(attempt === 0 ? 300 : 700);
              continue;
            }
          }
        } catch (bootstrapError) {
          lastError = bootstrapError;
          writeClientTelegramDiagnosticsLog('scanner.bootstrap.webapp-failed', {
            attempt,
            message: bootstrapError.message || '',
          }, 'telegram-scanner');
        }
      }

      if (!hasTelegramAuthPayload && !sessionToken && !employeeLink) {
        if (attempt < retries - 1) {
          await waitForTelegramAuth(attempt < 3 ? 400 : (attempt < 6 ? 700 : 1000));
          continue;
        }
      }

      try {
        const res = await apiFetch('/api/telegram/webapp/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initData,
            unsafeUser,
            sessionToken,
            employeeLink,
          }),
        });
        const data = await parseJsonSafely(res);
        if (!res.ok) {
          const errorMessage = data?.message || 'Не удалось подготовить доступ к заказу.';
          if (employeeLink) {
            writeClientTelegramDiagnosticsLog('scanner.session.direct-link-failed', {
              attempt,
              hasInitData: Boolean(initData),
              hasUnsafeUser: Boolean(unsafeUser?.id),
              hasSessionToken: Boolean(sessionToken),
              message: errorMessage.slice(0, 255),
            }, 'telegram-scanner');
          }
          if ((sessionToken || employeeLink) && isRecoverableTelegramSessionMessage(errorMessage)) {
            currentSessionToken = '';
            setTelegramEmployeeSessionToken('');
            if (attempt < retries - 1) {
              await waitForTelegramAuth();
            }
            continue;
          }
          if (hasTelegramAuthPayload && attempt < retries - 1) {
            currentSessionToken = '';
            setTelegramEmployeeSessionToken('');
            await waitForTelegramAuth();
            continue;
          }
          throw new Error(errorMessage);
        }
        currentSessionToken = data?.sessionToken || '';
        setTelegramEmployeeSessionToken(currentSessionToken);
        if (!currentEmployeeLink && data?.employeeLink && typeof setTelegramEmployeeDirectLink === 'function') {
          try { setTelegramEmployeeDirectLink(String(data.employeeLink || '')); } catch { /* ignore */ }
        }
        writeClientTelegramDiagnosticsLog('scanner.session.success', {
          attempt,
          hasSessionToken: Boolean(currentSessionToken),
          hasDirectLink: Boolean(employeeLink || (data?.employeeLink)),
          employeeLinkReturned: Boolean(data?.employeeLink),
          employeeLinkReturnedTail: data?.employeeLink ? String(data.employeeLink).slice(-8) : '',
          employeeId: data?.employee?._id ? String(data.employee._id).slice(-6) : '',
          employeeRole: data?.employee?.role ? String(data.employee.role).slice(0, 80) : '',
        }, 'telegram-scanner');
        return Boolean(currentSessionToken || employeeLink || data?.employeeLink);
      } catch (sessionError) {
        lastError = sessionError;
        writeClientTelegramDiagnosticsLog('scanner.session.error', {
          attempt,
          message: sessionError.message || '',
        }, 'telegram-scanner');
        await waitForTelegramAuth(attempt < 6 ? 500 : 900);
      }
    }

    if (lastError) {
      setError(lastError.message || 'Не удалось подготовить доступ к заказу.');
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

    const normalizedToken = String(sessionTokenFromUrl || '').trim();
    setTelegramEmployeeSessionToken(normalizedToken);
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
