import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import { buildOrderStageLegendConfig } from './orderStageLegend';
import { getOrderOverallStatus, getOrderPrimaryItem } from './orderSelectors';
import { ROLE_COLUMN_ACCESS_OPTIONS } from './roleColumnAccess';
import { getOrderStatusMeta } from './statusMeta';
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
} from './telegramWebApp';

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

function createPackageItemId() {
  return `package-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePackageItems(items = [], legacyPackageName = '') {
  const sourceItems = Array.isArray(items) ? items : [];
  const normalizedItems = sourceItems.reduce((acc, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return acc;
    const name = String(item.name || '').trim();
    if (!name) return acc;
    acc.push({
      id: String(item.id || createPackageItemId()).trim(),
      name,
      isCompleted: Boolean(item.isCompleted),
      completedAt: item.isCompleted ? (String(item.completedAt || '').trim() || new Date().toISOString().split('T')[0]) : null,
    });
    return acc;
  }, []);
  if (normalizedItems.length > 0) return normalizedItems;

  return String(legacyPackageName || '')
    .split(/[\n,;]+/g)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const isCompleted = /^(\+|\[x\]|x\s+|✓\s+|✔\s+)/i.test(token);
      const normalizedName = token
        .replace(/^(\+|\-|\[x\]|\[\s\]|x\s+|✓\s+|✔\s+)/i, '')
        .trim();
      return {
        id: createPackageItemId(),
        name: normalizedName || token,
        isCompleted,
        completedAt: isCompleted ? new Date().toISOString().split('T')[0] : null,
      };
    })
    .filter((item) => item.name);
}

function getPackageStats(items = [], legacyPackageName = '') {
  const normalizedItems = normalizePackageItems(items, legacyPackageName);
  const total = normalizedItems.length;
  const completed = normalizedItems.filter((item) => item.isCompleted).length;
  return {
    total,
    completed,
    pending: Math.max(0, total - completed),
    items: normalizedItems,
  };
}

function normalizeMaterialRequestItems(items = [], legacyRequests = '') {
  return normalizePackageItems(items, legacyRequests);
}

function getMaterialRequestStats(items = [], legacyRequests = '') {
  const normalizedItems = normalizeMaterialRequestItems(items, legacyRequests);
  const total = normalizedItems.length;
  const completed = normalizedItems.filter((item) => item.isCompleted).length;
  return {
    total,
    completed,
    pending: Math.max(0, total - completed),
    items: normalizedItems,
  };
}

function getTelegramMaterialRequestErrorMessage(error, fallbackMessage = 'Не удалось добавить заявку на расходники.') {
  const rawMessage = String(error?.message || '').trim();
  if (rawMessage && !/^error\.?$/i.test(rawMessage)) {
    return rawMessage;
  }
  return `${fallbackMessage} Проверьте, что сотрудник авторизован в Telegram-боте, QR открыт на существующее изделие и сервер доступен для сохранения заказа.`;
}

const LEGACY_ORDER_COLUMN_KEY_MAP = {
  photoLink: 'materialRequests',
};

function normalizeOrderColumnKey(columnKey = '') {
  const normalizedColumnKey = String(columnKey || '').trim();
  return LEGACY_ORDER_COLUMN_KEY_MAP[normalizedColumnKey] || normalizedColumnKey;
}

function getPrimaryColumnIndexForManualStageColumn(columnKey = '') {
  switch (normalizeOrderColumnKey(columnKey)) {
    case 'orderNumber':
      return 0;
    case 'customer':
      return 1;
    case 'room':
      return 2;
    case 'roomNumber':
      return 3;
    case 'itemNumber':
      return 4;
    case 'quantity':
      return 5;
    case 'name':
      return 6;
    case 'orderCard':
      return 7;
    case 'packageName':
      return 8;
    case 'notes':
      return 9;
    case 'deliveryDate':
      return 10;
    case 'carpenter':
      return 11;
    case 'materialRequests':
      return 12;
    case 'paint':
      return 13;
    case 'itemStartDate':
      return 14;
    case 'itemEndDate':
      return 15;
    case 'itemDuration':
      return 16;
    case 'duration':
      return 17;
    default:
      return -1;
  }
}

function getSecondaryHeaderForPrimaryColumn(columnIndex = -1, secondaryHeaders = []) {
  if (columnIndex < 0) return null;
  let currentIndex = 0;
  for (const cell of secondaryHeaders) {
    const span = Number(cell?.colSpan) || 1;
    if (columnIndex >= currentIndex && columnIndex < currentIndex + span) {
      return cell || null;
    }
    currentIndex += span;
  }
  return null;
}

function getSecondaryHeaderBackground(header = null) {
  if (!header) return '#FFFFFF';
  if (header.useTableBackground) return 'var(--orders-table-cell-background)';
  return String(header.hex || '').trim() || '#FFFFFF';
}

function getSecondaryHeaderTextColor(header = null) {
  if (!header) return '#000000';
  if (header.useTableBackground) return '#000000';
  return String(header.textHex || '').trim() || '#000000';
}

function formatDateValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '—';
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleDateString();
}

function formatDateTimeValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleString();
}

function OrderDetail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id, itemId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orderStageLegendConfig, setOrderStageLegendConfig] = useState(() => buildOrderStageLegendConfig());
  const [telegramEmployee, setTelegramEmployee] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [telegramActionError, setTelegramActionError] = useState('');
  const [scanActivationError, setScanActivationError] = useState('');
  const [stageActionKey, setStageActionKey] = useState('');
  const [stageError, setStageError] = useState('');
  const [materialRequestDraft, setMaterialRequestDraft] = useState('');
  const [materialRequestError, setMaterialRequestError] = useState('');
  const [materialRequestBusyKey, setMaterialRequestBusyKey] = useState('');
  const [telegramAuth, setTelegramAuth] = useState({ initData: '', unsafeUser: null });
  const [telegramAuthResolved, setTelegramAuthResolved] = useState(false);
  const [telegramSessionBootstrapKey, setTelegramSessionBootstrapKey] = useState(0);
  const telegramSessionTokenRef = useRef(getTelegramEmployeeSessionToken());
  const activatedItemKeyRef = useRef('');

  const telegramMode = isTelegramWebApp();
  const telegramInitData = telegramAuth.initData;
  const telegramUnsafeUser = telegramAuth.unsafeUser;

  const refreshTelegramAuth = useCallback(() => {
    const nextInitData = persistTelegramInitData() || getTelegramInitData();
    const nextUnsafeUser = persistTelegramUnsafeUser() || getTelegramUnsafeUser();

    setTelegramAuth(current => {
      const sameUnsafeUserId = String(current?.unsafeUser?.id || '') === String(nextUnsafeUser?.id || '');
      if (current.initData === nextInitData && sameUnsafeUserId) {
        return current;
      }
      return {
        initData: nextInitData,
        unsafeUser: nextUnsafeUser,
      };
    });
  }, []);

  const updateTelegramSessionToken = useCallback((nextToken = '') => {
    const normalizedToken = String(nextToken || '');
    telegramSessionTokenRef.current = normalizedToken;
    setTelegramEmployeeSessionToken(normalizedToken);
  }, []);

  const getActiveTelegramSessionToken = useCallback(() => {
    return telegramSessionTokenRef.current || getTelegramEmployeeSessionToken();
  }, []);

  const fetchOrder = useCallback(async ({ showLoader = false } = {}) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const res = await apiFetch(`/api/orders/${id}`);
      if (!res.ok) {
        throw new Error('Order not found');
      }
      const data = await parseJsonSafely(res);
      setOrder(data || null);
    } catch {
      setOrder(null);
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [id]);

  const fetchOrderStageLegendConfig = useCallback(async () => {
    try {
      const res = await apiFetch('/api/order-stage-legend-config');
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось загрузить этапы производства.');
      }
      setOrderStageLegendConfig(buildOrderStageLegendConfig(data || {}));
    } catch {
      setOrderStageLegendConfig(buildOrderStageLegendConfig());
    }
  }, []);

  useEffect(() => {
    fetchOrder({ showLoader: true });
    fetchOrderStageLegendConfig();
  }, [fetchOrder, fetchOrderStageLegendConfig]);

  const loadTelegramEmployeeSession = useCallback(() => {
    if (!telegramMode) return;
    const hasTelegramAuthPayload = Boolean(telegramInitData || telegramUnsafeUser?.id);
    const currentSessionToken = getActiveTelegramSessionToken();
    if (!hasTelegramAuthPayload && !currentSessionToken) {
      if (!telegramAuthResolved) {
        setSessionLoading(true);
        setSessionError('');
        return;
      }
      setTelegramEmployee(null);
      setSessionLoading(false);
      setSessionError('Не удалось подтвердить ваш доступ. Откройте заказ заново через кнопку в боте.');
      return;
    }
    setSessionLoading(true);
    setSessionError('');

    const resolveSession = async (sessionTokenOverride = currentSessionToken) => {
      const res = await apiFetch('/api/telegram/webapp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: telegramInitData,
          unsafeUser: telegramUnsafeUser,
          sessionToken: sessionTokenOverride,
        }),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось определить ваш профиль.');
      }
      return data;
    };

    return resolveSession()
      .catch(async (error) => {
        const canRetryWithoutToken = currentSessionToken
          && hasTelegramAuthPayload
          && isRecoverableTelegramSessionMessage(error.message);
        if (!canRetryWithoutToken) {
          throw error;
        }
        updateTelegramSessionToken('');
        return resolveSession('');
      })
      .then(data => {
        const nextSessionToken = data?.sessionToken || '';
        updateTelegramSessionToken(nextSessionToken);
        setTelegramEmployee(data?.employee || null);
        setSessionError('');
      })
      .catch(error => {
        setTelegramEmployee(null);
        setSessionError(error.message || 'Не удалось определить ваш профиль.');
      })
      .finally(() => setSessionLoading(false));
  }, [getActiveTelegramSessionToken, telegramAuthResolved, telegramInitData, telegramMode, telegramUnsafeUser, updateTelegramSessionToken]);

  useEffect(() => {
    if (!telegramMode) return;

    const params = new URLSearchParams(location.search);
    const sessionTokenFromUrl = params.get('employeeSessionToken');
    if (!sessionTokenFromUrl) return;

    if (!isTelegramEmployeeSessionTokenExpired(sessionTokenFromUrl)) {
      updateTelegramSessionToken(sessionTokenFromUrl);
    } else {
      updateTelegramSessionToken('');
    }
    setTelegramSessionBootstrapKey(current => current + 1);
    params.delete('employeeSessionToken');

    navigate({
      pathname: location.pathname,
      search: params.toString() ? `?${params.toString()}` : '',
    }, { replace: true });
  }, [location.pathname, location.search, navigate, telegramMode, updateTelegramSessionToken]);

  useEffect(() => {
    loadTelegramEmployeeSession();
  }, [loadTelegramEmployeeSession, telegramSessionBootstrapKey]);

  useEffect(() => {
    if (!telegramMode) return;

    const webApp = getTelegramWebApp();
    if (!webApp) return;

    markTelegramWebAppSession();
    refreshTelegramAuth();

    if (typeof webApp.ready === 'function') {
      webApp.ready();
    }

    if (typeof webApp.expand === 'function') {
      webApp.expand();
    }

    const retryTimers = [100, 350, 800, 1500].map(delay => window.setTimeout(refreshTelegramAuth, delay));
    const finishTimer = window.setTimeout(() => {
      refreshTelegramAuth();
      setTelegramAuthResolved(true);
    }, 1700);

    return () => {
      retryTimers.forEach(timerId => window.clearTimeout(timerId));
      window.clearTimeout(finishTimer);
    };
  }, [refreshTelegramAuth, telegramMode]);

  useEffect(() => {
    if (!telegramMode) return undefined;

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      refreshTelegramAuth();
    };

    window.addEventListener('focus', handleVisibilityRefresh);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      window.removeEventListener('focus', handleVisibilityRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [refreshTelegramAuth, telegramMode]);

  useEffect(() => {
    if (!telegramMode) return undefined;

    const refreshOrder = () => {
      if (document.visibilityState === 'hidden') return;
      fetchOrder();
    };

    const intervalId = window.setInterval(refreshOrder, 10000);
    window.addEventListener('focus', refreshOrder);
    document.addEventListener('visibilitychange', refreshOrder);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshOrder);
      document.removeEventListener('visibilitychange', refreshOrder);
    };
  }, [fetchOrder, telegramMode]);

  const calcDuration = (start, end) => {
    if (!start || !end) return '—';
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff + ' дн.' : '—';
  };

  const selectedItem = order
    ? ((Array.isArray(order.items) ? order.items : []).find(item => item.itemId === itemId)
      || (Array.isArray(order.items) ? order.items[0] : null))
    : null;
  const primaryItem = getOrderPrimaryItem(order);
  const statusMeta = getOrderStatusMeta(selectedItem?.overallStatus || getOrderOverallStatus(order));
  const detailItems = order ? [
    { label: 'Номер заказа', value: order.orderNumber || '—' },
    { label: 'Заказчик', value: order.customer || '—' },
    { label: 'Изделие', value: selectedItem?.name || primaryItem?.name || '—' },
    { label: '№ изделия в заказе', value: selectedItem?.itemNumber || '—' },
    { label: 'Помещение', value: selectedItem?.room || '—' },
    { label: '№ помещения', value: selectedItem?.roomNumber || '—' },
    { label: 'Количество', value: selectedItem?.quantity || primaryItem?.quantity || 1 },
  ] : [];

  const allowedColumns = useMemo(() => (
    Array.isArray(telegramEmployee?.allowedColumns) ? telegramEmployee.allowedColumns : []
  ), [telegramEmployee?.allowedColumns]);

  const telegramStageOptions = useMemo(() => {
    const secondaryHeaders = orderStageLegendConfig.secondaryHeaders || [];
    return ROLE_COLUMN_ACCESS_OPTIONS
      .filter((column) => allowedColumns.includes(column.key) && column.key !== 'packageName')
      .map((column) => {
        const header = getSecondaryHeaderForPrimaryColumn(
          getPrimaryColumnIndexForManualStageColumn(column.key),
          secondaryHeaders,
        );
        if (!header || !header.legendKey || header.useTableBackground) {
          return null;
        }
        return {
          columnKey: column.key,
          primaryColumnIndex: getPrimaryColumnIndexForManualStageColumn(column.key),
          label: header.label || column.label,
          legendKey: header.legendKey,
          hex: getSecondaryHeaderBackground(header),
          textHex: getSecondaryHeaderTextColor(header),
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.primaryColumnIndex - right.primaryColumnIndex);
  }, [allowedColumns, orderStageLegendConfig.secondaryHeaders]);

  const materialRequestStats = useMemo(() => (
    getMaterialRequestStats(selectedItem?.materialRequestItems, selectedItem?.materialRequests)
  ), [selectedItem?.materialRequestItems, selectedItem?.materialRequests]);

  const canManageMaterialRequests = Boolean(telegramMode && telegramEmployee && selectedItem?.itemId);

  useEffect(() => {
    if (!telegramMode || !telegramEmployee || !selectedItem?.itemId) return;
    const activationKey = `${id}:${selectedItem.itemId}:${telegramEmployee.role}`;
    if (activatedItemKeyRef.current === activationKey) return;

    const activateItem = async () => {
      const sessionToken = getActiveTelegramSessionToken();
      const res = await apiFetch(`/api/orders/${id}/telegram-item-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: telegramInitData,
          unsafeUser: telegramUnsafeUser,
          sessionToken,
          itemId: selectedItem.itemId,
        }),
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, 'Не удалось отметить изделие как взятое в работу.'));
      }
      activatedItemKeyRef.current = activationKey;
      setScanActivationError('');
      await fetchOrder();
    };

    activateItem().catch(error => {
      setScanActivationError(error.message || 'Не удалось отметить изделие как взятое в работу.');
    });
  }, [
    fetchOrder,
    getActiveTelegramSessionToken,
    id,
    selectedItem?.itemId,
    telegramEmployee,
    telegramInitData,
    telegramMode,
    telegramUnsafeUser,
  ]);

  const updateTelegramStageMark = useCallback(async (columnKey, { clear = false } = {}) => {
    if (!telegramMode || !telegramEmployee || !selectedItem?.itemId || !columnKey) return;
    const pendingKey = `stage:${columnKey}:${clear ? 'clear' : 'mark'}`;
    setStageActionKey(pendingKey);
    setStageError('');
    setTelegramActionError('');
    try {
      const sessionToken = getActiveTelegramSessionToken();
      const res = await apiFetch(`/api/orders/${id}/telegram-stage-mark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: telegramInitData,
          unsafeUser: telegramUnsafeUser,
          sessionToken,
          itemId: selectedItem.itemId,
          columnKey,
          clear,
        }),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || (clear ? 'Не удалось отменить принятие этапа.' : 'Не удалось отметить этап.'));
      }
      setOrder(data?.order || null);
      if (data?.employee) {
        setTelegramEmployee(data.employee);
      }
      await fetchOrder();
    } catch (error) {
      setStageError(error.message || (clear ? 'Не удалось отменить принятие этапа.' : 'Не удалось отметить этап.'));
    } finally {
      setStageActionKey('');
    }
  }, [
    fetchOrder,
    getActiveTelegramSessionToken,
    id,
    selectedItem?.itemId,
    telegramEmployee,
    telegramInitData,
    telegramMode,
    telegramUnsafeUser,
  ]);

  const addTelegramMaterialRequestItem = useCallback(async () => {
    const nextName = String(materialRequestDraft || '').trim();
    if (!telegramMode || !telegramEmployee || !selectedItem?.itemId) return;
    if (!nextName) {
      setMaterialRequestError('Введите название заявки на расходники.');
      return;
    }

    setMaterialRequestBusyKey('add');
    setMaterialRequestError('');
    try {
      const sessionToken = getActiveTelegramSessionToken();
      const res = await apiFetch(`/api/orders/${id}/telegram-material-request-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: telegramInitData,
          unsafeUser: telegramUnsafeUser,
          sessionToken,
          itemId: selectedItem.itemId,
          name: nextName,
        }),
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, 'Не удалось добавить заявку на расходники.'));
      }
      const data = await parseJsonSafely(res);
      setOrder(data?.order || null);
      if (data?.employee) {
        setTelegramEmployee(data.employee);
      }
      setMaterialRequestDraft('');
    } catch (error) {
      setMaterialRequestError(getTelegramMaterialRequestErrorMessage(error));
    } finally {
      setMaterialRequestBusyKey('');
    }
  }, [
    getActiveTelegramSessionToken,
    id,
    materialRequestDraft,
    selectedItem?.itemId,
    telegramEmployee,
    telegramInitData,
    telegramMode,
    telegramUnsafeUser,
  ]);

  if (loading) {
    return (
      <div className="card">
        <h2>Загрузка заказа...</h2>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="card">
        <h2>🔍 Заказ не найден</h2>
        <p>Проверьте ссылку или обратитесь к администратору системы</p>
      </div>
    );
  }

  const handleScanAnotherQr = () => {
    setTelegramActionError('');
    openTelegramQrScanner({
      onSuccess: (orderPath) => navigate(buildTelegramOrderPath(orderPath)),
      onError: setTelegramActionError,
    });
  };

  const handleCloseTelegramApp = () => {
    if (!closeTelegramWebApp()) {
      navigate('/telegram-app');
    }
  };

  return (
    <div className={`card order-detail-card${telegramMode ? ' telegram-order-card' : ''}`}>
      <h2>{telegramMode ? `Изделие: ${selectedItem?.name || primaryItem?.name || '—'}` : `📋 Изделие: ${selectedItem?.name || primaryItem?.name || '—'}`}</h2>
      {telegramMode && (
        <p className="telegram-order-subtitle">Общие данные заказа, доступные этапы и заявки на расходники.</p>
      )}

      {telegramMode && (
        <div className="telegram-order-actions">
          <button className="btn btn-primary" onClick={handleScanAnotherQr}>
            Сканировать другой QR-код
          </button>
          <button className="btn" onClick={handleCloseTelegramApp}>
            Закрыть и вернуться в бот
          </button>
        </div>
      )}

      {telegramActionError && (
        <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
          {telegramActionError}
        </div>
      )}

      {telegramMode ? (
        <>
          <div className="telegram-order-summary">
            <div className="telegram-order-summary-label">Статус изделия</div>
            <div className="telegram-order-summary-value">
              <span className={statusMeta.className}>{statusMeta.label}</span>
            </div>
          </div>

          {scanActivationError && (
            <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
              {scanActivationError}
            </div>
          )}

          <div className="telegram-order-grid">
            {detailItems.map((item) => (
              <div key={item.label} className="detail-block">
                <div className="detail-label">{item.label}</div>
                <div className="detail-value">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="telegram-stage-section">
            <div className="telegram-section-title">Этапы</div>

            {sessionLoading && (
              <div className="telegram-empty-box">
                Проверяю доступ сотрудника...
              </div>
            )}

            {!sessionLoading && sessionError && (
              <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
                {sessionError}
              </div>
            )}

            {!sessionLoading && !sessionError && telegramEmployee && telegramStageOptions.length === 0 && (
              <div className="telegram-empty-box">
                Для этого сотрудника не настроены этапы в Telegram Web App.
              </div>
            )}

            {stageError && (
              <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
                {stageError}
              </div>
            )}

            {telegramStageOptions.length > 0 && (
              <div className="telegram-stage-list">
                {telegramStageOptions.map((stage) => {
                  const stageMark = selectedItem?.manualStageMarks?.[stage.columnKey] || null;
                  const stageCleared = Boolean(selectedItem?.manualStageClears?.[stage.columnKey]);
                  const isMarked = Boolean(stageMark && !stageCleared);
                  const isMarkBusy = stageActionKey === `stage:${stage.columnKey}:mark`;
                  const isClearBusy = stageActionKey === `stage:${stage.columnKey}:clear`;
                  const isBusy = isMarkBusy || isClearBusy;
                  return (
                    <div
                      key={stage.columnKey}
                      className={`telegram-stage-card${isMarked ? ' telegram-stage-card-complete' : ''}`}
                      style={{
                        '--telegram-stage-accent': stage.hex,
                        '--telegram-stage-text': stage.textHex,
                      }}
                    >
                      <div className="telegram-stage-card-top">
                        <div className="telegram-stage-card-main">
                          <div className="telegram-stage-card-swatch" aria-hidden="true" />
                          <div className="telegram-stage-card-copy">
                            <div className="telegram-stage-card-title">
                            {stage.label}
                            </div>
                            <div className="telegram-stage-card-subtitle">
                              {isMarked
                                ? `Принято${stageMark?.updatedBy ? ` · ${stageMark.updatedBy}` : ''}${stageMark?.updatedAt ? ` · ${formatDateTimeValue(stageMark.updatedAt)}` : ''}`
                                : 'Ожидает принятия'}
                            </div>
                          </div>
                        </div>
                        <span className={`telegram-stage-pill ${isMarked ? 'telegram-stage-pill-complete' : 'telegram-stage-pill-pending'}`}>
                          {isMarked ? 'Принято' : 'Ожидает'}
                        </span>
                      </div>
                      <div className="telegram-stage-card-actions">
                        <button
                          className={`btn ${isMarked ? 'btn-secondary telegram-stage-reset-btn' : 'btn-primary'}`}
                          onClick={() => updateTelegramStageMark(stage.columnKey, { clear: isMarked })}
                          disabled={isBusy}
                        >
                          {isBusy
                            ? (isMarked ? 'Отменяю...' : 'Сохраняю...')
                            : (isMarked ? 'Отменить принятие' : 'Принять этап')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {(sessionLoading || sessionError || canManageMaterialRequests) && (
            <div className="telegram-package-section telegram-material-request-section">
              <div className="telegram-section-title">Заявки на расходники</div>

              {sessionLoading && (
                <div className="telegram-empty-box">
                  Проверяю доступ к заявкам на расходники...
                </div>
              )}

              {canManageMaterialRequests && (
                <>
                  <div className="telegram-package-meta telegram-material-request-meta">
                    Важные заявки: добавлено {materialRequestStats.total}
                  </div>

                  <div className="telegram-package-input-row">
                    <input
                      type="text"
                      value={materialRequestDraft}
                      onChange={(event) => {
                        setMaterialRequestDraft(event.target.value);
                        setMaterialRequestError('');
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addTelegramMaterialRequestItem();
                        }
                      }}
                      placeholder="Добавить заявку, например сверло"
                      disabled={materialRequestBusyKey === 'add'}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={addTelegramMaterialRequestItem}
                      disabled={materialRequestBusyKey === 'add'}
                    >
                      {materialRequestBusyKey === 'add' ? 'Добавляю...' : 'Добавить'}
                    </button>
                  </div>

                  {materialRequestError && (
                    <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
                      {materialRequestError}
                    </div>
                  )}

                  {materialRequestStats.items.length > 0 ? (
                    <div className="telegram-stage-list telegram-material-request-list">
                      {materialRequestStats.items.map((requestItem) => (
                        <div
                          key={requestItem.id}
                          className="telegram-stage-card telegram-material-request-card"
                          style={{
                            '--telegram-stage-accent': '#FFD27A',
                            '--telegram-stage-text': '#6C2A10',
                          }}
                        >
                          <div className="telegram-stage-card-top">
                            <div className="telegram-stage-card-main">
                              <div className="telegram-stage-card-swatch" aria-hidden="true" />
                              <div className="telegram-stage-card-copy">
                                <div className="telegram-stage-card-title">
                                  {requestItem.name}
                                </div>
                                <div className="telegram-stage-card-subtitle">
                                  Добавлено в заявку на расходники
                                </div>
                              </div>
                            </div>
                            <span className="telegram-stage-pill telegram-material-request-pill">
                              Срочно
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="telegram-empty-box">
                      Заявки на расходники пока не добавлены.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="table-scroll">
          <table>
            <tbody>
              <tr><td><strong>Номер заказа</strong></td><td>{order.orderNumber || '—'}</td></tr>
              <tr><td><strong>Заказчик</strong></td><td>{order.customer || '—'}</td></tr>
              <tr><td><strong>Изделие</strong></td><td>{selectedItem?.name || primaryItem?.name || '—'}</td></tr>
              <tr><td><strong>№ изделия в заказе</strong></td><td>{selectedItem?.itemNumber || '—'}</td></tr>
              <tr><td><strong>Помещение</strong></td><td>{selectedItem?.room || '—'}</td></tr>
              <tr><td><strong>№ помещения</strong></td><td>{selectedItem?.roomNumber || '—'}</td></tr>
              <tr><td><strong>Кол-во изделий</strong></td><td>{selectedItem?.quantity || primaryItem?.quantity || 1}</td></tr>
              <tr><td><strong>Материал</strong></td><td>{selectedItem?.material || primaryItem?.material || '—'}</td></tr>
              <tr><td><strong>Комплектация</strong></td><td>{selectedItem?.packageName || '—'}</td></tr>
              <tr><td><strong>Заявки на расходники</strong></td><td>{materialRequestStats.total > 0 ? `${materialRequestStats.completed}/${materialRequestStats.total}` : '—'}</td></tr>
              <tr><td><strong>Примечания</strong></td><td>{selectedItem?.notes || primaryItem?.notes || '—'}</td></tr>
              <tr><td><strong>Дата заказа</strong></td><td>{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}</td></tr>
              <tr><td><strong>Начало изготовления</strong></td><td>{order.startDate ? new Date(order.startDate).toLocaleDateString() : '—'}</td></tr>
              <tr><td><strong>Окончание изготовления</strong></td><td>{order.endDate ? new Date(order.endDate).toLocaleDateString() : '—'}</td></tr>
              <tr><td><strong>Время изготовления</strong></td><td>{calcDuration(order.startDate, order.endDate)}</td></tr>
              <tr><td><strong>Статус</strong></td><td><span className={statusMeta.className}>{statusMeta.label}</span></td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default OrderDetail;
