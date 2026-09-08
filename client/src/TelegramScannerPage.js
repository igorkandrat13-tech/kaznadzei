﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiFetch, parseJsonSafely } from './api';
import {
  buildTelegramOrderPath,
  closeTelegramWebApp,
  getTelegramEmployeeSessionToken,
  getTelegramInitData,
  getTelegramUnsafeUser,
  getTelegramWebApp,
  hasTelegramWebAppSession,
  isTelegramEmployeeSessionTokenExpired,
  isTelegramWebApp,
  markTelegramWebAppSession,
  openTelegramQrScanner,
  persistTelegramInitData,
  persistTelegramUnsafeUser,
  readTelegramUrlSessionToken,
  readTelegramUrlSessionTokenRaw,
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
  const openingScannerRef = useRef(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Подготовка доступа к сканированию QR-кода изделия.');
  const [bootstrappingSession, setBootstrappingSession] = useState(true);
  const [openingScanner, setOpeningScanner] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinMessage, setPinMessage] = useState('');
  const debugMode = (() => {
    const paramDebug = new URLSearchParams(location.search).get('debug') === '1';
    return paramDebug;
  })();
  useGlobalErrorEffect(error, 'Ошибка Telegram Web App.');

  async function copyToClipboard(text) {
    const str = String(text || '');
    try {
      if (navigator && typeof navigator.clipboard?.writeText === 'function') {
        await navigator.clipboard.writeText(str);
        return true;
      }
    } catch (_) { /* ignore */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (_) { return false; }
  }

  const bootstrapTelegramSession = useCallback(async ({ retries = 8 } = {}) => {
    markTelegramWebAppSession();

    const existingToken = getTelegramEmployeeSessionToken() || readTelegramUrlSessionToken();
    if (existingToken) {
      return true;
    }

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

      if (sessionToken) {
        return true;
      }

      if (!hasTelegramAuthPayload) {
        if (attempt < retries - 1) {
          await waitForTelegramAuth();
          continue;
        }
      }

      if (!hasTelegramAuthPayload && !isLastAttempt) {
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
      setError(lastError.message || 'Не удалось подготовить доступ к заказам.');
    } else {
      setError('Telegram не передал данные сотрудника. Откройте страницу заново через кнопку в боте.');
    }
    return false;
  }, []);

  const openScanner = useCallback(() => {
    if (bootstrappingSession) return;
    if (openingScannerRef.current) return;
    if (openingScanner) return;
    openingScannerRef.current = true;
    setError('');
    setOpeningScanner(true);
    try {
      openTelegramQrScanner({
        onSuccess: async (orderPath) => {
          try {
            setError('');
            setStatus('Переход к найденному изделию...');
            const sessionToken = String(getTelegramEmployeeSessionToken() || '').trim();
            const relPath = buildTelegramOrderPath(orderPath, sessionToken);
            if (relPath) {
              const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
              let absUrl;
              if (sessionToken && sessionToken.length > 32) {
                const safeToken = encodeURIComponent(sessionToken);
                const encodedRelay = String(relPath).replace(/^\/+/, '');
                absUrl = `${origin}/telegram-app/t/${safeToken}/scan/${encodedRelay}`;
              } else {
                absUrl = origin + relPath;
              }
              window.location.replace(absUrl);
              return;
            }
          } finally {
            openingScannerRef.current = false;
            setOpeningScanner(false);
          }
        },
        onError: (nextError) => {
          openingScannerRef.current = false;
          setError(nextError);
          setOpeningScanner(false);
        },
        onStatusChange: setStatus,
      });
    } catch (scannerError) {
      openingScannerRef.current = false;
      setError(scannerError.message || 'Не удалось открыть камеру.');
      setOpeningScanner(false);
    }
  }, [bootstrappingSession, navigate, openingScanner]);

  const submitPinCode = useCallback(async () => {
    const rawPin = String(pinCode || '').trim().replace(/[^\d]/g, '');
    if (rawPin.length < 4 || rawPin.length > 8) {
      setPinMessage('Введите ПИН-код от 4 до 8 цифр.');
      return;
    }
    setPinLoading(true);
    setPinMessage('');
    setError('');
    try {
      const res = await apiFetch('/api/telegram/employee-link-by-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinCode: rawPin }),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) throw new Error(data?.message || 'Не удалось войти по ПИН-коду.');
      if (data?.sessionToken) {
        setTelegramEmployeeSessionToken(String(data.sessionToken));
        markTelegramWebAppSession();
      }
      const welcomeName = data?.employee?.fullName ? `, ${String(data.employee.fullName).split(' ')[0]}` : '';
      setPinMessage(`Вход выполнен${welcomeName}. Кнопка меню временно скрыта — используйте инлайн-ссылку «📤 Отправить ссылку в Telegram» в карточке сотрудника.`);
      setStatus(`Готово${welcomeName}. Нажмите «Открыть камеру» для сканирования.`);
      setTimeout(() => {
        openingScannerRef.current = false;
        setOpeningScanner(false);
      }, 800);
    } catch (pinErr) {
      setPinMessage(pinErr?.message || String(pinErr || 'Ошибка входа по ПИН-коду.'));
    } finally {
      setPinLoading(false);
    }
  }, [pinCode, openScanner]);

  useEffect(() => {
    const sessionTokenFromUrl = readTelegramUrlSessionToken();
    if (!sessionTokenFromUrl) return;

    if (!isTelegramEmployeeSessionTokenExpired(sessionTokenFromUrl)) {
      setTelegramEmployeeSessionToken(sessionTokenFromUrl);
    }
    // Don't navigate(replace=true) to empty /telegram-app because that would
    // strip the URL/hash tokens on some React Router / WebView builds. The
    // bootstrapTelegramSession effect below is idempotent.
  }, [location.search, location.hash]);

  useEffect(() => {
    const storedToken = getTelegramEmployeeSessionToken();
    const urlToken = readTelegramUrlSessionToken();
    const hasToken = Boolean(storedToken || urlToken);
    const webApp = getTelegramWebApp();

    if (!webApp && !hasToken) {
      setBootstrappingSession(false);
      return undefined;
    }
    if (webApp && !isTelegramWebApp() && !hasToken) {
      setBootstrappingSession(false);
      return undefined;
    }

    if (hasToken) {
      markTelegramWebAppSession();
      setBootstrappingSession(false);
    } else {
      bootstrapTelegramSession()
        .finally(() => setBootstrappingSession(false));
    }

    if (webApp && typeof webApp.ready === 'function') {
      try { webApp.ready(); } catch (_) { /* ignore */ }
    }

    if (webApp && typeof webApp.expand === 'function') {
      try { webApp.expand(); } catch (_) { /* ignore */ }
    }
    return undefined;
  }, [bootstrapTelegramSession, location.search, location.hash]);

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

      {(() => {
        const urlRaw = readTelegramUrlSessionTokenRaw();
        const storageToken = getTelegramEmployeeSessionToken() || '';
        const pathMatch = location.pathname.match(/^\/telegram-app\/t\/([^/]+)\/?/);
        const pathToken = pathMatch ? pathMatch[1] : '';
        const noTokenAtAll = !bootstrappingSession
          && !(pathToken && pathToken.length > 32)
          && !(urlRaw.token && urlRaw.length > 32)
          && !(storageToken && storageToken.length > 32);
        if (!noTokenAtAll) return null;
        return (
          <div className="settings-alert mb-16" style={{ textAlign: 'left', borderColor: '#c7a544', background: '#fff9e8', color: '#6b5000' }}>
            <strong style={{ display: 'block', marginBottom: 6 }}>Меню кнопка Telegram не передала токен доступа (Telegram Android может кешировать старую кнопку часами).</strong>
            <div style={{ marginBottom: 10 }}>
              Введите ваш ПИН-код (4–8 цифр из настроек сотрудника) — мгновенный вход без ожидания обновления кеша:
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                type="password"
                autoComplete="off"
                placeholder="ПИН-код"
                value={pinCode}
                onChange={(e) => {
                  const digits = String(e.target.value || '').replace(/[^\d]/g, '').slice(0, 8);
                  setPinCode(digits);
                  if (pinMessage) setPinMessage('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitPinCode();
                  }
                }}
                style={{
                  flex: '1 1 auto',
                  minWidth: 0,
                  padding: '10px 12px',
                  border: '1px solid #d6cfb6',
                  borderRadius: 6,
                  fontSize: 16,
                  letterSpacing: 3,
                  outline: 'none',
                  WebkitAppearance: 'none',
                }}
              />
              <button
                className="btn btn-primary"
                onClick={submitPinCode}
                disabled={pinLoading || !String(pinCode || '').replace(/[^\d]/g, '').length}
                style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {pinLoading ? 'Вход...' : 'Войти по ПИН'}
              </button>
            </div>
            {pinMessage && (
              <div style={{ marginTop: 8, color: /выполнен|готово/i.test(pinMessage) ? '#38704a' : '#8a6500', fontSize: 14, lineHeight: 1.5 }}>
                {pinMessage}
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55, color: '#7a5a00', opacity: 0.92 }}>
              Или администратор: <strong>Настройки → Telegram → 🔄 Обновить кнопки ТГ</strong>, затем в EmployeeModal нажать <strong>«☰ Проверить Menu Button»</strong> и перезапустить приложение Telegram.
            </div>
          </div>
        );
      })()}

      <div className="inline-actions-centered">
        <button className="btn btn-primary" onClick={openScanner} disabled={bootstrappingSession || openingScanner}>
          {bootstrappingSession ? 'Подготовка...' : openingScanner ? 'Переход...' : 'Открыть камеру'}
        </button>
        <button className="btn btn-secondary" onClick={() => closeTelegramWebApp() || navigate('/')}>
          Закрыть
        </button>
      </div>

      {debugMode && (() => {
        const urlRaw = readTelegramUrlSessionTokenRaw();
        const storageToken = getTelegramEmployeeSessionToken() || '';
        const pathMatch = location.pathname.match(/^\/telegram-app\/t\/([^/]+)\/?/);
        const pathToken = pathMatch ? pathMatch[1] : '';
        const snapshot = {
          at: new Date().toISOString(),
          location: location.pathname + location.search + location.hash,
          bootstrappingSession,
          openingScanner,
          pathTokenPresent: Boolean(pathToken && pathToken.length > 32),
          pathTokenLength: pathToken.length,
          urlParamTokenPresent: Boolean(urlRaw.token && urlRaw.length > 32),
          urlParamTokenLength: urlRaw.length,
          storageTokenPresent: Boolean(storageToken && storageToken.length > 32),
          storageTokenLength: storageToken.length,
          storageTokenPreview: storageToken ? storageToken.slice(0, 18) + '...' : '',
          anyTokenPresent: Boolean((pathToken && pathToken.length > 32) || (urlRaw.token && urlRaw.length > 32) || (storageToken && storageToken.length > 32)),
          error: error || '',
          status: status || '',
        };
        return (
          <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 20, paddingTop: 16, background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 14, color: '#666', fontWeight: 600 }}>СЛУЖЕБНАЯ ИНФОРМАЦИЯ (debug)</div>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => copyToClipboard(JSON.stringify(snapshot, null, 2))}
              >
                📋 JSON
              </button>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 6,
                fontSize: 12,
                background: '#fff',
                padding: 10,
                borderRadius: 6,
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ padding: 4 }}>
                <div style={{ color: '#888' }}>Path токен (/telegram-app/t/...)</div>
                <div style={{ fontWeight: 600, color: snapshot.pathTokenPresent ? '#27ae60' : '#c0392b' }}>
                  {snapshot.pathTokenPresent ? `✅ ${snapshot.pathTokenLength} симв.` : '❌ пустой'}
                </div>
              </div>
              <div style={{ padding: 4 }}>
                <div style={{ color: '#888' }}>URL query/hash токен</div>
                <div style={{ fontWeight: 600, color: snapshot.urlParamTokenPresent ? '#27ae60' : '#c0392b' }}>
                  {snapshot.urlParamTokenPresent ? `✅ ${snapshot.urlParamTokenLength} симв.` : '❌ пустой'}
                </div>
              </div>
              <div style={{ padding: 4 }}>
                <div style={{ color: '#888' }}>Storage (sessionStorage) токен</div>
                <div style={{ fontWeight: 600, color: snapshot.storageTokenPresent ? '#27ae60' : '#c0392b' }}>
                  {snapshot.storageTokenPresent ? `✅ ${snapshot.storageTokenLength} симв.` : '❌ пустой'}
                  {snapshot.storageTokenPreview ? (
                    <div style={{ fontSize: 10, color: '#666', fontFamily: 'monospace', marginTop: 2 }}>
                      {snapshot.storageTokenPreview}
                    </div>
                  ) : null}
                </div>
              </div>
              <div style={{ padding: 4 }}>
                <div style={{ color: '#888' }}>ИТОГО токен есть?</div>
                <div style={{ fontWeight: 600, color: snapshot.anyTokenPresent ? '#27ae60' : '#c0392b' }}>
                  {snapshot.anyTokenPresent ? '✅ ДА' : '❌ НЕТ'}
                </div>
              </div>
              <div style={{ padding: 4 }}>
                <div style={{ color: '#888' }}>bootstrappingSession</div>
                <div style={{ fontWeight: 600, color: snapshot.bootstrappingSession ? '#f39c12' : '#27ae60' }}>
                  {snapshot.bootstrappingSession ? '⏳ true' : '✅ false'}
                </div>
              </div>
              <div style={{ padding: 4, gridColumn: '1 / -1' }}>
                <div style={{ color: '#888' }}>Путь страницы</div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{snapshot.location}</div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default TelegramScannerPage;
