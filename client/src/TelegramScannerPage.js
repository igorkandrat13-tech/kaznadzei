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
  const [fallbackEmployeeCode, setFallbackEmployeeCode] = useState('');
  const [submittingFallback, setSubmittingFallback] = useState(false);
  const [fallbackEmployeePin, setFallbackEmployeePin] = useState('');
  const [submittingFallbackPin, setSubmittingFallbackPin] = useState(false);
  const [fallbackEmployeeName, setFallbackEmployeeName] = useState('');
  const [directory, setDirectory] = useState({ loaded: false, count: 0, employees: [], error: false });
  const loadDirectoryOnceRef = useRef(false);
  useGlobalErrorEffect(error, 'Ошибка Telegram Web App.');

  useEffect(() => {
    if (loadDirectoryOnceRef.current) return;
    loadDirectoryOnceRef.current = true;
    (async () => {
      try {
        writeClientTelegramDiagnosticsLog('scanner.directory.fetch.start', {}, 'telegram-scanner');
        const res = await apiFetch('/api/telegram/employee-directory', { method: 'GET' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const raw = await res.text();
        let data;
        try { data = JSON.parse(raw || '{}'); } catch (_) { throw new Error('Invalid JSON: ' + (raw || '').slice(0,100)); }
        if (!data?.ok) throw new Error(data?.message || 'Unknown directory response');
        const list = Array.isArray(data?.employees) ? data.employees : [];
        setDirectory({ loaded: true, count: Number(data?.count || list.length), employees: list });
        writeClientTelegramDiagnosticsLog('scanner.directory.fetch.success', { count: list.length }, 'telegram-scanner');
      } catch (dirErr) {
        writeClientTelegramDiagnosticsLog('scanner.directory.fetch.error', { message: String(dirErr.message || '').slice(0,255) }, 'telegram-scanner');
        setDirectory(prev => ({ ...prev, loaded: true, error: true }));
      }
    })();
  }, []);

  const isReadyForScan = Boolean(
    bootstrapProgress.ready
      || getTelegramEmployeeDirectLink()
      || getTelegramEmployeeSessionToken()
  );

  const stuckAtMax = bootstrapProgress.step >= bootstrapProgress.total && !isReadyForScan;

  const submitFallbackEmployeeCode = useCallback(async () => {
    const code = String(fallbackEmployeeCode || '').trim();
    if (!code) {
      setError('Введите код сотрудника.');
      return;
    }
    setSubmittingFallback(true);
    setError('');
    try {
      writeClientTelegramDiagnosticsLog('scanner.fallback.code-submit', {
        codeLength: code.length,
        codeTail: String(code).slice(-4),
      }, 'telegram-scanner');
      const res = await apiFetch('/api/telegram/webapp/employee-link-by-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const rawText = await res.text();
      let data = null;
      try { data = JSON.parse(rawText || '{}'); } catch (_) { data = { ok:false, message: (rawText || '').slice(0, 200) || 'Empty response' }; }
      writeClientTelegramDiagnosticsLog('scanner.fallback.response', {
        codeLength: code.length,
        resStatus: Number(res.status) || 0,
        resOk: Boolean(res.ok),
        contentType: res.headers && typeof res.headers.get === 'function' ? String(res.headers.get('content-type')||'').slice(0,80) : '',
        responseMessage: String(data?.message || '').slice(0,200),
        responseRawTail: String(rawText||'').slice(-160),
        dataOk: Boolean(data?.ok),
        hasEmployeeLink: Boolean(data?.employeeLink),
        hasSessionToken: Boolean(data?.sessionToken),
      }, 'telegram-scanner');
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || 'Не удалось получить доступ.');
      }
      if (data?.employeeLink) {
        setTelegramEmployeeDirectLink(String(data.employeeLink || ''));
      }
      if (data?.sessionToken) {
        setTelegramEmployeeSessionToken(String(data.sessionToken || ''));
      }
      const empName = data?.employee?.fullName || data?.employee?.name || '';
      setFallbackEmployeeName(empName);
      writeClientTelegramDiagnosticsLog('scanner.fallback.success', {
        employeeId: data?.employee?._id ? String(data.employee._id).slice(-6) : '',
        employeeRole: String(data?.employee?.role || '').slice(0, 80),
        hasLink: Boolean(data?.employeeLink),
        hasSession: Boolean(data?.sessionToken),
      }, 'telegram-scanner');
      setBootstrapProgress(prev => ({
        ...prev,
        step: prev.total,
        ready: true,
        note: empName ? `Доступ получен: ${empName}. Можно сканировать.` : 'Доступ готов. Можно сканировать.',
      }));
    } catch (fallbackErr) {
      const msg = fallbackErr?.message || fallbackErr?.toString?.() || 'Unknown fallback error';
      setError(msg || 'Не удалось получить доступ по коду сотрудника.');
      writeClientTelegramDiagnosticsLog('scanner.fallback.error', {
        message: String(msg || '').slice(0, 255),
        fallbackErrName: String(fallbackErr?.name || '').slice(0,80),
      }, 'telegram-scanner');
    } finally {
      setSubmittingFallback(false);
    }
  }, [fallbackEmployeeCode]);

  const submitFallbackPin = useCallback(async () => {
    const code = String(fallbackEmployeePin || '').trim();
    if (!code || !/^\d+$/.test(code)) {
      setError('Введите PIN сотрудника (только цифры, 4-6 знаков).');
      return;
    }
    if (code.length < 4) {
      setError('PIN сотрудника слишком короткий. Введите 4-6 цифр.');
      return;
    }
    setSubmittingFallbackPin(true);
    setError('');
    try {
      writeClientTelegramDiagnosticsLog('scanner.fallback.pin-submit', {
        pinLength: code.length,
        pinTail: String(code).slice(-2),
      }, 'telegram-scanner');
      const res = await apiFetch('/api/telegram/webapp/employee-link-by-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const rawText = await res.text();
      let data = null;
      try { data = JSON.parse(rawText || '{}'); } catch (_) { data = { ok:false, message: (rawText || '').slice(0, 200) || 'Empty response' }; }
      writeClientTelegramDiagnosticsLog('scanner.fallback.pin-response', {
        pinLength: code.length,
        resStatus: Number(res.status) || 0,
        resOk: Boolean(res.ok),
        contentType: res.headers && typeof res.headers.get === 'function' ? String(res.headers.get('content-type')||'').slice(0,80) : '',
        responseMessage: String(data?.message || '').slice(0,200),
        responseRawTail: String(rawText||'').slice(-160),
        dataOk: Boolean(data?.ok),
        hasEmployeeLink: Boolean(data?.employeeLink),
        hasSessionToken: Boolean(data?.sessionToken),
      }, 'telegram-scanner');
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || 'Не удалось получить доступ по PIN.');
      }
      if (data?.employeeLink) {
        setTelegramEmployeeDirectLink(String(data.employeeLink || ''));
      }
      if (data?.sessionToken) {
        setTelegramEmployeeSessionToken(String(data.sessionToken || ''));
      }
      const empName = data?.employee?.fullName || data?.employee?.name || '';
      setFallbackEmployeeName(empName);
      writeClientTelegramDiagnosticsLog('scanner.fallback.pin-success', {
        employeeId: data?.employee?._id ? String(data.employee._id).slice(-6) : '',
        employeeRole: String(data?.employee?.role || '').slice(0, 80),
        hasLink: Boolean(data?.employeeLink),
        hasSession: Boolean(data?.sessionToken),
      }, 'telegram-scanner');
      setBootstrapProgress(prev => ({
        ...prev,
        step: prev.total,
        ready: true,
        note: empName ? `Доступ получен: ${empName}. Можно сканировать.` : 'Доступ готов. Можно сканировать.',
      }));
    } catch (fallbackErr) {
      const msg = fallbackErr?.message || fallbackErr?.toString?.() || 'Unknown fallback error';
      setError(msg || 'Не удалось получить доступ по PIN сотрудника.');
      writeClientTelegramDiagnosticsLog('scanner.fallback.pin-error', {
        message: String(msg || '').slice(0, 255),
        fallbackErrName: String(fallbackErr?.name || '').slice(0,80),
      }, 'telegram-scanner');
    } finally {
      setSubmittingFallbackPin(false);
    }
  }, [fallbackEmployeePin]);

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

      {stuckAtMax && (
        <div className="card" style={{
          margin: '16px 0',
          padding: '16px 18px',
          background: 'linear-gradient(180deg,#fff8ed,#fff4de)',
          border: '1px solid #f1d8a2',
          borderRadius: 10,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#965c0c' }}>
            ⚠️ Telegram не передал данные сотрудника (возможно после долгого неиспользования). Введите свой PIN — это самый быстрый способ:
          </div>

          <div style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            marginBottom: 14,
            padding: 12,
            background: '#ffffff',
            border: '1px solid #e9dcb9',
            borderRadius: 8,
          }}>
            <div style={{ flex: '1 1 180px', minWidth: 180 }}>
              <label style={{
                fontSize: 12,
                color: 'var(--muted,#555)',
                display: 'block',
                marginBottom: 4,
                fontWeight: 700,
              }}>
                🟢 PIN сотрудника (4-6 цифр, вы использовали его при регистрации в боте):
              </label>
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                className="form-input"
                value={fallbackEmployeePin}
                onChange={(e) => {
                  const onlyDigits = (e.target.value || '').replace(/[^0-9]/g, '').slice(0, 8);
                  setFallbackEmployeePin(onlyDigits);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') submitFallbackPin(); }}
                placeholder="например: 200133"
                style={{ width: '100%', padding: '10px 12px', fontSize: 18, fontFamily: 'monospace', letterSpacing: 2 }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <div style={{ fontSize: 11, color: 'var(--muted,#777)', marginTop: 4 }}>
                PIN можно посмотреть в Настройки → Сотрудники (у администратора).
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 180 }}>
              <button
                className="btn btn-success"
                onClick={submitFallbackPin}
                disabled={submittingFallbackPin || !fallbackEmployeePin || fallbackEmployeePin.length < 4}
                style={{ minWidth: 180, fontWeight: 700 }}
              >
                {submittingFallbackPin ? 'Проверяю PIN...' : '✅ Войти по PIN'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={retryBootstrap}
                disabled={submittingFallbackPin || submittingFallback}
                style={{ minWidth: 180 }}
              >
                ↻ Ещё раз попробовать Telegram
              </button>
            </div>
          </div>

          <div style={{
            textAlign: 'center',
            fontSize: 12,
            fontWeight: 600,
            color: '#8a6a2a',
            margin: '8px 0 14px',
          }}>
            — ИЛИ —
          </div>

          {directory.loaded && !directory.error && directory.employees.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
              gap: 8,
              margin: '0 0 16px',
            }}>
              {directory.employees.map((emp, idx) => {
                const label = (emp.code ? emp.code + ' · ' : '') + (emp.name || '');
                if (!label) return null;
                const active = fallbackEmployeeCode && (
                  (emp.code && String(fallbackEmployeeCode).toLowerCase() === String(emp.code).toLowerCase())
                  || (emp.username && String(fallbackEmployeeCode).toLowerCase() === String(emp.username).toLowerCase())
                  || (emp.name && String(fallbackEmployeeCode).toLowerCase() === String(emp.name).toLowerCase())
                );
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setError('');
                      setFallbackEmployeeCode(emp.code || emp.username || (emp.name ? emp.name.slice(0, 24) : ''));
                    }}
                    className="btn"
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      background: active ? '#4a6991' : '#ffffff',
                      color: active ? '#fff' : '#222',
                      border: active ? '1px solid #3d587a' : '1px solid #d8d8d8',
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      lineHeight: 1.35,
                    }}
                    title={emp.name || ''}
                  >
                    {emp.code && <span style={{ fontFamily: 'monospace' }}>{emp.code}</span>}
                    {emp.code && emp.name && <span style={{ opacity: 0.7 }}> · </span>}
                    {emp.name && <span style={{ fontWeight: 500 }}>{emp.name}</span>}
                    {emp.role && !emp.name && <span style={{ opacity: 0.65 }}> · {emp.role}</span>}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 180px', minWidth: 180 }}>
              <label style={{
                fontSize: 12,
                color: 'var(--muted,#555)',
                display: 'block',
                marginBottom: 4,
              }}>
                Код сотрудника / Фамилия / @username:
              </label>
              <input
                type="text"
                className="form-input"
                value={fallbackEmployeeCode}
                onChange={(e) => setFallbackEmployeeCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitFallbackEmployeeCode(); }}
                placeholder="например: fvams2 или Игорь"
                style={{ width: '100%', padding: '8px 10px', fontSize: 15 }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <div style={{ fontSize: 11, color: 'var(--muted,#777)', marginTop: 4 }}>
                Можно ввести: персональный код сотрудника, username ТГ, или первые 3 буквы ФИО.
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 170 }}>
              <button
                className="btn btn-primary"
                onClick={submitFallbackEmployeeCode}
                disabled={submittingFallback || !fallbackEmployeeCode || submittingFallbackPin}
                style={{ minWidth: 170 }}
              >
                {submittingFallback ? 'Получаю доступ...' : 'Получить доступ по коду'}
              </button>
            </div>
          </div>
          {fallbackEmployeeName && (
            <div style={{
              marginTop: 12,
              fontSize: 13,
              color: 'var(--success,#2d7a4a)',
              fontWeight: 600,
            }}>
              ✅ Авторизован как: {fallbackEmployeeName}
            </div>
          )}
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
