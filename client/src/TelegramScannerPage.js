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
  if (normalized.includes('ещё не пришли') || normalized.includes('повторите попытку')) return true;
  if (normalized.includes('не переданы данные пользователя')) return true;
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
  const [bootstrapProgress, setBootstrapProgress] = useState({ step: 0, total: 12, ready: false, note: '' });
  useGlobalErrorEffect(error, 'Ошибка Telegram Web App.');

  const isReadyForScan = Boolean(
    bootstrapProgress.ready
      || getTelegramEmployeeDirectLink()
      || getTelegramEmployeeSessionToken()
  );

  const bootstrapTelegramSession = useCallback(async ({ retries = 12 } = {}) => {
    markTelegramWebAppSession();
    let lastError = null;
    let currentSessionToken = getTelegramEmployeeSessionToken();
    let currentEmployeeLink = getTelegramEmployeeDirectLink();
    const waitForTelegramAuth = (delayMs = 500) => new Promise(resolve => window.setTimeout(resolve, delayMs));
    if (currentEmployeeLink || currentSessionToken) {
      setBootstrapProgress({ step: retries, total: retries, ready: true, note: 'Использую сохранённый доступ.' });
      writeClientTelegramDiagnosticsLog('scanner.bootstrap.from-storage', {
        hasEmployeeLink: Boolean(currentEmployeeLink),
        hasSessionToken: Boolean(currentSessionToken),
      }, 'telegram-scanner');
      return true;
    }

    for (let attempt = 0; attempt < retries; attempt += 1) {
      persistTelegramInitData();
      persistTelegramUnsafeUser();

      const directWebApp = getTelegramWebApp();
      const initData = getTelegramInitData() || (directWebApp?.initData || '');
      const unsafeUser = getTelegramUnsafeUser() || (directWebApp?.initDataUnsafe?.user || null);
      const hasTelegramAuthPayload = Boolean(initData || unsafeUser?.id);
      const sessionToken = currentSessionToken || getTelegramEmployeeSessionToken();
      const employeeLink = currentEmployeeLink || getTelegramEmployeeDirectLink();

      setBootstrapProgress({
        step: attempt + 1,
        total: retries,
        ready: Boolean(employeeLink || sessionToken),
        note: hasTelegramAuthPayload ? 'Telegram данные подгрузились — получаю стабильную ссылку...' : 'Жду Telegram auth данные...',
      });

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
                setBootstrapProgress({ step: retries, total: retries, ready: true, note: 'Доступ получен. Можно сканировать.' });
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
              setBootstrapProgress(prev => ({ ...prev, note: 'Жду инициализацию Telegram...' }));
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
          const isRetryable = Boolean(data?.retryable || data?.needReopen);
          if (employeeLink) {
            writeClientTelegramDiagnosticsLog('scanner.session.direct-link-failed', {
              attempt,
              hasInitData: Boolean(initData),
              hasUnsafeUser: Boolean(unsafeUser?.id),
              hasSessionToken: Boolean(sessionToken),
              retryable: isRetryable,
              message: errorMessage.slice(0, 255),
            }, 'telegram-scanner');
          }
          if ((isRetryable || isRecoverableTelegramSessionMessage(errorMessage)) && attempt < retries - 1) {
            currentSessionToken = '';
            setTelegramEmployeeSessionToken('');
            setBootstrapProgress(prev => ({
              ...prev,
              note: 'Telegram auth данные ещё не пришли — жду…',
            }));
            writeClientTelegramDiagnosticsLog('scanner.session.retryable-wait', {
              attempt,
              message: errorMessage.slice(0, 255),
              retryable: isRetryable,
              matchedRecoverableMsg: isRecoverableTelegramSessionMessage(errorMessage),
            }, 'telegram-scanner');
            await waitForTelegramAuth(attempt < 3 ? 400 : (attempt < 6 ? 700 : 1000));
            continue;
          }
          if ((sessionToken || employeeLink) && isRecoverableTelegramSessionMessage(errorMessage) && attempt < retries - 1) {
            currentSessionToken = '';
            setTelegramEmployeeSessionToken('');
            await waitForTelegramAuth();
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
          try { setTelegramEmployeeDirectLink(String(data.employeeLink || '')); currentEmployeeLink = String(data.employeeLink || ''); } catch { /* ignore */ }
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
        if (currentSessionToken || currentEmployeeLink || data?.employeeLink) {
          setBootstrapProgress({ step: retries, total: retries, ready: true, note: 'Доступ готов. Можно сканировать.' });
          return true;
        }
      } catch (sessionError) {
        lastError = sessionError;
        writeClientTelegramDiagnosticsLog('scanner.session.error', {
          attempt,
          message: sessionError.message || '',
        }, 'telegram-scanner');
        await waitForTelegramAuth(attempt < 6 ? 500 : 900);
      }
    }

    setBootstrapProgress(prev => ({
      ...prev,
      step: retries,
      total: retries,
      ready: Boolean(getTelegramEmployeeDirectLink() || getTelegramEmployeeSessionToken()),
      note: lastError ? `Не удалось автоматически получить доступ: ${(lastError.message || '').slice(0, 60)}` : 'Telegram auth данные не пришли. Нажмите Повторить или откройте заново через кнопку в боте.',
    }));

    if (lastError) {
      setError(lastError.message || 'Не удалось подготовить доступ к заказу.');
    }
    return Boolean(getTelegramEmployeeDirectLink() || getTelegramEmployeeSessionToken());
  }, []);

  const openScanner = useCallback(() => {
    if (!isReadyForScan) {
      setError('Дождитесь завершения подготовки доступа (прогресс ниже). Если долго не готово — нажмите Повторить попытку или переоткройте webapp через кнопку в боте.');
      writeClientTelegramDiagnosticsLog('scanner.open.blocked-not-ready', {
        bootstrappingSession,
        bootstrapProgress,
        hasEmployeeLinkDirect: Boolean(getTelegramEmployeeDirectLink()),
        hasSessionTokenDirect: Boolean(getTelegramEmployeeSessionToken()),
      }, 'telegram-scanner');
      return;
    }
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
  }, [bootstrappingSession, bootstrapProgress, isReadyForScan, navigate, openingScanner]);

  const retryBootstrap = useCallback(() => {
    setError('');
    setBootstrappingSession(true);
    setBootstrapProgress({ step: 0, total: 12, ready: false, note: '' });
    bootstrapTelegramSession({ retries: 12 }).finally(() => setBootstrappingSession(false));
  }, [bootstrapTelegramSession]);

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
    if (!webApp || autoOpenedRef.current || bootstrappingSession || !isReadyForScan) return;

    autoOpenedRef.current = true;
    openScanner();
  }, [bootstrappingSession, isReadyForScan, openScanner]);

  const percent = Math.round(Math.min(100, Math.max(0, (bootstrapProgress.step / Math.max(1, bootstrapProgress.total)) * 100)));
  const readyBadge = isReadyForScan ? 'status-ready' : (bootstrappingSession ? 'status-wait' : 'status-stuck');

  return (
    <div className="card scanner-card">
      <h2>Сканирование QR-кода</h2>
      <p className="text-muted" style={{ lineHeight: 1.6 }}>
        После сканирования откроется страница заказа.
      </p>

      <div className={`scanner-status-box scanner-status-${readyBadge}`}>
        {isReadyForScan ? (
          <div>
            <div style={{ fontWeight: 700, color: 'var(--success,#2d7a4a)', marginBottom: 6 }}>
              ✅ Доступ готов. Можно сканировать QR.
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted,#666)' }}>
              {bootstrapProgress.note || status}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              Подготовка доступа… {percent}% ({bootstrapProgress.step}/{bootstrapProgress.total})
            </div>
            <div style={{
              width: '100%',
              height: 10,
              background: '#eee',
              borderRadius: 5,
              overflow: 'hidden',
              margin: '4px 0 8px',
            }}>
              <div style={{
                height: '100%',
                width: `${percent}%`,
                background: percent > 60 ? 'linear-gradient(90deg,#4a6991,#6da17a)' : '#4a6991',
                transition: 'width 200ms ease',
              }} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted,#666)' }}>
              {bootstrapProgress.note || 'Подождите несколько секунд — Telegram передаёт данные сотрудника.'}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="settings-alert settings-alert-error mb-16" style={{ textAlign: 'left' }}>
          {error}
        </div>
      )}

      <div className="inline-actions-centered">
        <button
          className="btn btn-primary"
          onClick={openScanner}
          disabled={bootstrappingSession || openingScanner || !isReadyForScan}
        >
          {openingScanner
            ? 'Открываю...'
            : !isReadyForScan
              ? 'Дождитесь подготовки...'
              : 'Открыть камеру'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={retryBootstrap}
          disabled={bootstrappingSession && bootstrapProgress.step < bootstrapProgress.total - 1}
          title="Если Telegram auth данные не пришли — попытаться ещё раз"
        >
          Повторить
        </button>
        <button className="btn btn-secondary" onClick={() => closeTelegramWebApp() || navigate('/')}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

export default TelegramScannerPage;
