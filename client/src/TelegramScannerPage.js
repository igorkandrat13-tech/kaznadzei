﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Подготовка доступа к сканированию QR-кода изделия.');
  const [bootstrappingSession, setBootstrappingSession] = useState(true);
  const [openingScanner, setOpeningScanner] = useState(false);
  const debugMode = (() => {
    const paramDebug = new URLSearchParams(location.search).get('debug') === '1';
    if (paramDebug) return true;
    const hasStorageToken = Boolean(getTelegramEmployeeSessionToken() && getTelegramEmployeeSessionToken().length > 32);
    if (hasStorageToken) return true;
    const urlRaw = readTelegramUrlSessionTokenRaw();
    if (urlRaw && urlRaw.length > 32) return true;
    const pathMatch = location.pathname.match(/^\/telegram-app\/t\/[^/]+\/?$/);
    if (pathMatch) return true;
    if (hasTelegramWebAppSession()) return true;
    if (Boolean(getTelegramWebApp())) return true;
    if (isTelegramWebApp()) return true;
    return false;
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
    if (bootstrappingSession || openingScanner) return;
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
          <div className="settings-alert mb-16" style={{ textAlign: 'left', borderColor: '#e0b34a', background: '#fffbea', color: '#7a5a00' }}>
            <strong>Меню кнопка Telegram не передала токен доступа.</strong>
            <div style={{ marginTop: 6 }}>
              Администратору: откройте <strong>Настройки → Telegram</strong> и нажмите <strong>«🔄 Обновить кнопки ТГ»</strong>.
              Либо в карточке сотрудника нажмите <strong>«📤 Отправить ссылку в Telegram»</strong> и откройте сканер по инлайн-ссылке.
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
