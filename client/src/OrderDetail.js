import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiFetch, getErrorMessage, parseJsonSafely, toUserErrorMessage } from './api';
import { useGlobalErrorEffect } from './globalErrors';
import { buildOrderStageLegendConfig } from './orderStageLegend';
import { formatDateDisplay, formatDateTimeDisplay } from './dateTime';
import { getOrderOverallStatus, getOrderPrimaryItem } from './orderSelectors';
import { ROLE_COLUMN_ACCESS_OPTIONS } from './roleColumnAccess';
import { getOrderStatusMeta } from './statusMeta';
import {
  getTelegramEmployeeSessionToken,
  getTelegramInitData,
  getTelegramUnsafeUser,
  getTelegramWebApp,
  isTelegramEmployeeSessionTokenExpired,
  isTelegramWebApp,
  markTelegramWebAppSession,
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

function normalizeItemAttachments(attachments = []) {
  const sourceAttachments = Array.isArray(attachments) ? attachments : [];
  return sourceAttachments.reduce((acc, attachment) => {
    if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return acc;
    const attachmentId = String(attachment.attachmentId || '').trim();
    const name = String(attachment.name || '').trim();
    if (!attachmentId || !name) return acc;
    acc.push({
      attachmentId,
      name,
      type: String(attachment.type || '').trim(),
      size: Number(attachment.size) || 0,
      uploadedAt: String(attachment.uploadedAt || '').trim(),
      url: String(attachment.url || '').trim(),
    });
    return acc;
  }, []);
}

function normalizeMaterialRequestItems(items = [], legacyRequests = '') {
  const sourceItems = Array.isArray(items) ? items : [];
  const normalizedItems = sourceItems.reduce((acc, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return acc;
    const name = String(item.name || '').trim();
    if (!name) return acc;
    acc.push({
      id: String(item.id || createPackageItemId()).trim(),
      name,
      kind: String(item.kind || (Array.isArray(item.attachments) && item.attachments.length > 0 ? 'photo' : 'text')).trim() || 'text',
      comment: String(item.comment || '').trim(),
      isCompleted: Boolean(item.isCompleted),
      completedAt: item.isCompleted ? (String(item.completedAt || '').trim() || new Date().toISOString().split('T')[0]) : null,
      attachments: normalizeItemAttachments(item.attachments),
    });
    return acc;
  }, []);
  if (normalizedItems.length > 0) return normalizedItems;

  return String(legacyRequests || '')
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
        kind: 'text',
        comment: '',
        isCompleted,
        completedAt: isCompleted ? new Date().toISOString().split('T')[0] : null,
        attachments: [],
      };
    })
    .filter((item) => item.name);
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

function getMaterialRequestItemDisplayName(item = {}) {
  const normalizedName = String(item.name || '').trim();
  if (normalizedName && normalizedName.toLowerCase() !== 'фото') return normalizedName;
  const legacyComment = String(item.comment || '').trim();
  if (legacyComment) return legacyComment;
  const firstAttachmentName = String(item.attachments?.[0]?.name || '').trim();
  if (firstAttachmentName) return firstAttachmentName;
  return normalizedName || 'Фото';
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

function isLinkAttachment(attachment = {}) {
  const type = String(attachment?.type || '').toLowerCase();
  const url = String(attachment?.url || '').trim();
  return Boolean(url) || type.includes('link');
}

function getAttachmentExtension(attachment = {}) {
  const fileName = String(attachment?.name || '').trim().toLowerCase();
  const match = fileName.match(/(\.[a-z0-9]+)$/i);
  return match ? match[1] : '';
}

function isImageAttachment(attachment = {}) {
  const type = String(attachment?.type || '').toLowerCase();
  const extension = getAttachmentExtension(attachment);
  return type.startsWith('image/')
    || extension === '.png'
    || extension === '.jpg'
    || extension === '.jpeg'
    || extension === '.gif'
    || extension === '.webp'
    || extension === '.bmp';
}

function isPdfAttachment(attachment = {}) {
  const type = String(attachment?.type || '').toLowerCase();
  return type.includes('pdf') || getAttachmentExtension(attachment) === '.pdf';
}

function isDocxAttachment(attachment = {}) {
  const type = String(attachment?.type || '').toLowerCase();
  const extension = getAttachmentExtension(attachment);
  return type.includes('wordprocessingml') || extension === '.docx';
}

function isLegacyWordAttachment(attachment = {}) {
  const type = String(attachment?.type || '').toLowerCase();
  return type.includes('msword') || getAttachmentExtension(attachment) === '.doc';
}

function isSpreadsheetAttachment(attachment = {}) {
  const type = String(attachment?.type || '').toLowerCase();
  const extension = getAttachmentExtension(attachment);
  return type.includes('excel')
    || type.includes('spreadsheet')
    || extension === '.xlsx'
    || extension === '.xls';
}

function getAttachmentKindLabel(attachment = {}) {
  if (isLinkAttachment(attachment)) return 'Ссылка';
  if (isPdfAttachment(attachment)) return 'PDF';
  if (isDocxAttachment(attachment) || isLegacyWordAttachment(attachment)) return 'Word';
  if (isSpreadsheetAttachment(attachment)) return 'Excel';
  if (isImageAttachment(attachment)) return 'Изображение';
  return 'Файл';
}

function formatAttachmentSize(size) {
  const numericSize = Number(size) || 0;
  if (numericSize <= 0) return '';
  if (numericSize >= 1024 * 1024) {
    return `${(numericSize / (1024 * 1024)).toFixed(1)} МБ`;
  }
  return `${Math.max(1, Math.round(numericSize / 1024))} КБ`;
}

function getAttachmentLinkUrl(attachment = {}) {
  return String(attachment?.url || '').trim();
}

function getTelegramReadOnlySection(item, sectionKey) {
  if (!item || !sectionKey) return null;

  if (sectionKey === 'orderCard') {
    return {
      key: 'orderCard',
      title: 'Карточка заказа',
      emptyText: 'Файлы карточки заказа не прикреплены.',
      text: '',
      attachments: Array.isArray(item.attachments) ? item.attachments : [],
    };
  }

  if (sectionKey === 'paint') {
    return {
      key: 'paint',
      title: 'Покраска',
      emptyText: 'Данные по покраске не добавлены.',
      text: String(item.paint || '').trim(),
      attachments: Array.isArray(item.paintAttachments) ? item.paintAttachments : [],
    };
  }

  return null;
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
  const [packageDraft, setPackageDraft] = useState('');
  const [packageError, setPackageError] = useState('');
  const [packageBusyKey, setPackageBusyKey] = useState('');
  const [materialRequestDraft, setMaterialRequestDraft] = useState('');
  const [materialRequestError, setMaterialRequestError] = useState('');
  const [materialRequestBusyKey, setMaterialRequestBusyKey] = useState('');
  const [materialRequestNameDrafts, setMaterialRequestNameDrafts] = useState({});
  const [telegramAuth, setTelegramAuth] = useState({ initData: '', unsafeUser: null });
  const [telegramAuthResolved, setTelegramAuthResolved] = useState(false);
  const [telegramSessionBootstrapKey, setTelegramSessionBootstrapKey] = useState(0);
  const [telegramReadOnlySectionKey, setTelegramReadOnlySectionKey] = useState('');
  const [telegramAttachmentOpeningKey, setTelegramAttachmentOpeningKey] = useState('');
  const [telegramSpreadsheetPreview, setTelegramSpreadsheetPreview] = useState(null);
  const [telegramAttachmentPreview, setTelegramAttachmentPreview] = useState(null);
  const telegramSessionTokenRef = useRef(getTelegramEmployeeSessionToken());
  const activatedItemKeyRef = useRef('');
  const materialRequestInputRef = useRef(null);
  useGlobalErrorEffect(sessionError, 'Ошибка определения профиля в Telegram.');
  useGlobalErrorEffect(scanActivationError, 'Ошибка принятия изделия в работу.');
  useGlobalErrorEffect(stageError, 'Ошибка отметки этапа.');
  useGlobalErrorEffect(packageError, 'Ошибка комплектации.');
  useGlobalErrorEffect(materialRequestError, 'Ошибка заявок на расходники.');
  useGlobalErrorEffect(telegramActionError, 'Ошибка действия в Telegram.');

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

  const keepMaterialRequestInputVisible = useCallback(({ behavior = 'smooth' } = {}) => {
    const input = materialRequestInputRef.current;
    if (!input || document.activeElement !== input) return;

    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const topPadding = 16;
    const bottomPadding = 20;
    const rect = input.getBoundingClientRect();

    if (rect.top >= topPadding && rect.bottom <= viewportHeight - bottomPadding) {
      return;
    }

    input.scrollIntoView({
      behavior,
      block: 'nearest',
      inline: 'nearest',
    });
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
        setSessionError(toUserErrorMessage(error, 'Не удалось определить ваш профиль.'));
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

  useEffect(() => {
    const input = materialRequestInputRef.current;
    const visualViewport = window.visualViewport || null;
    if (!input || !visualViewport) return undefined;

    let focusTimeoutId = 0;
    let settleTimeoutId = 0;

    const handleFocus = () => {
      window.clearTimeout(focusTimeoutId);
      window.clearTimeout(settleTimeoutId);
      focusTimeoutId = window.setTimeout(() => {
        keepMaterialRequestInputVisible({ behavior: 'auto' });
      }, 60);
      settleTimeoutId = window.setTimeout(() => {
        keepMaterialRequestInputVisible();
      }, 280);
    };

    const handleViewportChange = () => {
      keepMaterialRequestInputVisible({ behavior: 'auto' });
    };

    input.addEventListener('focus', handleFocus);
    visualViewport.addEventListener('resize', handleViewportChange);
    visualViewport.addEventListener('scroll', handleViewportChange);

    return () => {
      window.clearTimeout(focusTimeoutId);
      window.clearTimeout(settleTimeoutId);
      input.removeEventListener('focus', handleFocus);
      visualViewport.removeEventListener('resize', handleViewportChange);
      visualViewport.removeEventListener('scroll', handleViewportChange);
    };
  }, [keepMaterialRequestInputVisible]);

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
    { label: 'Количество', value: selectedItem?.quantity || primaryItem?.quantity || 1 },
  ] : [];

  const allowedColumns = useMemo(() => (
    Array.isArray(telegramEmployee?.allowedColumns) ? telegramEmployee.allowedColumns : []
  ), [telegramEmployee?.allowedColumns]);

  const telegramStageOptions = useMemo(() => {
    const secondaryHeaders = orderStageLegendConfig.secondaryHeaders || [];
    const options = ROLE_COLUMN_ACCESS_OPTIONS
      .filter((column) => allowedColumns.includes(column.key))
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

    const groupedOptions = new Map();
    options.forEach((option) => {
      const groupKey = `${option.label}::${option.legendKey}`;
      const current = groupedOptions.get(groupKey);
      if (!current) {
        groupedOptions.set(groupKey, {
          ...option,
          columnKeys: [option.columnKey],
          actionKey: option.columnKey,
        });
        return;
      }
      current.columnKeys = Array.from(new Set([...(current.columnKeys || []), option.columnKey]));
      current.actionKey = current.columnKeys.join('|');
    });
    return Array.from(groupedOptions.values());
  }, [allowedColumns, orderStageLegendConfig.secondaryHeaders]);

  const packageStats = useMemo(() => (
    getPackageStats(selectedItem?.packageItems, selectedItem?.packageName)
  ), [selectedItem?.packageItems, selectedItem?.packageName]);

  const materialRequestStats = useMemo(() => (
    getMaterialRequestStats(selectedItem?.materialRequestItems, selectedItem?.materialRequests)
  ), [selectedItem?.materialRequestItems, selectedItem?.materialRequests]);

  const canManagePackage = Boolean(
    telegramMode
      && telegramEmployee
      && selectedItem?.itemId
      && allowedColumns.includes('packageName')
  );

  const canManageMaterialRequests = Boolean(
    telegramMode
      && telegramEmployee
      && selectedItem?.itemId
      && allowedColumns.includes('materialRequests')
  );

  const canViewOrderCard = Boolean(telegramMode && selectedItem?.itemId);
  const canViewPaint = Boolean(telegramMode && selectedItem?.itemId);
  const telegramReadOnlySection = useMemo(
    () => getTelegramReadOnlySection(selectedItem, telegramReadOnlySectionKey),
    [selectedItem, telegramReadOnlySectionKey],
  );

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
      setScanActivationError(toUserErrorMessage(error, 'Не удалось отметить изделие как взятое в работу.'));
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

  const updateTelegramStageMark = useCallback(async (columnKeys, { clear = false } = {}) => {
    const normalizedColumnKeys = Array.isArray(columnKeys)
      ? columnKeys.map((columnKey) => normalizeOrderColumnKey(columnKey)).filter(Boolean)
      : [normalizeOrderColumnKey(columnKeys)].filter(Boolean);
    if (!telegramMode || !telegramEmployee || !selectedItem?.itemId || normalizedColumnKeys.length === 0) return;
    const pendingKey = `stage:${normalizedColumnKeys.join('|')}:${clear ? 'clear' : 'mark'}`;
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
          columnKey: normalizedColumnKeys[0],
          columnKeys: normalizedColumnKeys,
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
      setStageError(toUserErrorMessage(error, clear ? 'Не удалось отменить принятие этапа.' : 'Не удалось отметить этап.'));
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

  const openTelegramFileUrl = useCallback((targetUrl, fileName = 'attachment') => {
    const normalizedUrl = String(targetUrl || '').trim();
    if (!normalizedUrl) return false;
    const openedWindow = window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
    if (openedWindow) return true;
    const link = document.createElement('a');
    link.href = normalizedUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }, []);

  const revokeTelegramAttachmentPreviewUrl = useCallback((preview) => {
    if (!preview?.url || !preview?.revokeUrl) return;
    const previewUrl = String(preview.url || '').trim();
    if (!previewUrl.startsWith('blob:')) return;
    window.URL.revokeObjectURL(previewUrl);
  }, []);

  const setTelegramAttachmentPreviewState = useCallback((nextPreview) => {
    setTelegramAttachmentPreview((current) => {
      revokeTelegramAttachmentPreviewUrl(current);
      return nextPreview;
    });
  }, [revokeTelegramAttachmentPreviewUrl]);

  const closeTelegramAttachmentPreview = useCallback(() => {
    setTelegramAttachmentPreviewState(null);
  }, [setTelegramAttachmentPreviewState]);

  const closeTelegramSpreadsheetPreview = useCallback(() => {
    setTelegramSpreadsheetPreview(null);
  }, []);

  useEffect(() => {
    return () => {
      revokeTelegramAttachmentPreviewUrl(telegramAttachmentPreview);
    };
  }, [revokeTelegramAttachmentPreviewUrl, telegramAttachmentPreview]);

  useEffect(() => {
    closeTelegramSpreadsheetPreview();
    closeTelegramAttachmentPreview();
    setTelegramReadOnlySectionKey('');
    setMaterialRequestNameDrafts({});
  }, [closeTelegramAttachmentPreview, closeTelegramSpreadsheetPreview, selectedItem?.itemId]);

  const closeTelegramReadOnlySection = useCallback(() => {
    closeTelegramSpreadsheetPreview();
    closeTelegramAttachmentPreview();
    setTelegramReadOnlySectionKey('');
  }, [closeTelegramAttachmentPreview, closeTelegramSpreadsheetPreview]);

  const openTelegramReadOnlySection = useCallback((sectionKey, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const normalizedSectionKey = String(sectionKey || '').trim();
    if (!normalizedSectionKey) return;
    closeTelegramSpreadsheetPreview();
    closeTelegramAttachmentPreview();
    setTelegramReadOnlySectionKey(normalizedSectionKey);
  }, [closeTelegramAttachmentPreview, closeTelegramSpreadsheetPreview]);

  const handleOpenTelegramReadOnlyAttachment = useCallback(async (attachment, scope = 'order') => {
    if (!order?._id || !selectedItem?.itemId || !attachment?.attachmentId) return;

    if (isLinkAttachment(attachment)) {
      const targetUrl = getAttachmentLinkUrl(attachment);
      if (!targetUrl) {
        setTelegramActionError('Ссылка пустая.');
        return;
      }
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const sessionToken = getActiveTelegramSessionToken();
    if (!sessionToken) {
      setTelegramActionError('Не удалось подтвердить Telegram-сессию для открытия файла.');
      return;
    }

    const attachmentScope = String(scope || 'order').trim().toLowerCase();
    const openKey = `${attachmentScope}:${attachment.attachmentId}`;
    const query = new URLSearchParams({ sessionToken });
    if (attachmentScope === 'paint') query.set('scope', 'paint');
    const fileUrl = `/api/orders/${order._id}/items/${selectedItem.itemId}/attachments/${attachment.attachmentId}/telegram-file?${query.toString()}`;

    setTelegramAttachmentOpeningKey(openKey);
    setTelegramActionError('');

    try {
      const previewMeta = {
        attachment,
        kindLabel: getAttachmentKindLabel(attachment),
        name: attachment.name || 'Файл',
        sizeLabel: formatAttachmentSize(attachment.size),
        sourceUrl: fileUrl,
      };

      if (isSpreadsheetAttachment(attachment)) {
        closeTelegramAttachmentPreview();
        const res = await apiFetch(fileUrl);
        if (!res.ok) {
          setTelegramActionError(await getErrorMessage(res, 'Не удалось открыть Excel-файл.'));
          return;
        }
        const blob = await res.blob();
        const xlsxImport = await import('xlsx');
        const XLSX = xlsxImport.default || xlsxImport;
        const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
        const sheets = workbook.SheetNames.map((sheetName) => {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
            header: 1,
            raw: false,
            blankrows: false,
          });
          return {
            name: sheetName,
            rows: rows.slice(0, 100),
            totalRows: rows.length,
          };
        });
        setTelegramSpreadsheetPreview({
          ...previewMeta,
          sheets,
          activeSheetIndex: 0,
        });
        return;
      }

      closeTelegramSpreadsheetPreview();

      if (isImageAttachment(attachment)) {
        setTelegramAttachmentPreviewState({
          ...previewMeta,
          mode: 'image',
          url: fileUrl,
          revokeUrl: false,
        });
        return;
      }

      if (isPdfAttachment(attachment)) {
        setTelegramAttachmentPreviewState({
          ...previewMeta,
          mode: 'pdf',
          url: fileUrl,
          revokeUrl: false,
        });
        return;
      }

      if (isLegacyWordAttachment(attachment)) {
        setTelegramAttachmentPreviewState({
          ...previewMeta,
          mode: 'word-legacy',
          url: fileUrl,
          revokeUrl: false,
        });
        return;
      }

      if (isDocxAttachment(attachment)) {
        const res = await apiFetch(fileUrl);
        if (!res.ok) {
          setTelegramActionError(await getErrorMessage(res, 'Не удалось открыть Word-файл.'));
          return;
        }
        const blob = await res.blob();
        const mammothImport = await import('mammoth/mammoth.browser');
        const mammoth = mammothImport.default || mammothImport;
        const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
        setTelegramAttachmentPreviewState({
          ...previewMeta,
          mode: 'word',
          url: fileUrl,
          revokeUrl: false,
          html: result.value || '<p>Пустой документ.</p>',
        });
        return;
      }

      const opened = openTelegramFileUrl(fileUrl, attachment.name || 'attachment');
      if (!opened) {
        setTelegramActionError('Браузер заблокировал открытие файла. Разрешите открытие новой вкладки.');
      }
    } catch (openError) {
      setTelegramActionError(toUserErrorMessage(openError, 'Не удалось открыть вложение.'));
    } finally {
      setTelegramAttachmentOpeningKey('');
    }
  }, [
    closeTelegramAttachmentPreview,
    closeTelegramSpreadsheetPreview,
    getActiveTelegramSessionToken,
    openTelegramFileUrl,
    order?._id,
    selectedItem?.itemId,
    setTelegramAttachmentPreviewState,
  ]);

  const getTelegramMaterialRequestAttachmentUrl = useCallback((materialRequestItemId, attachmentId) => {
    const requestItemId = String(materialRequestItemId || '').trim();
    const normalizedAttachmentId = String(attachmentId || '').trim();
    const sessionToken = getActiveTelegramSessionToken();
    if (!order?._id || !selectedItem?.itemId || !requestItemId || !normalizedAttachmentId || !sessionToken) {
      return '';
    }
    const query = new URLSearchParams({ sessionToken });
    return `/api/orders/${order._id}/items/${selectedItem.itemId}/material-request-items/${requestItemId}/attachments/${normalizedAttachmentId}/telegram-file?${query.toString()}`;
  }, [getActiveTelegramSessionToken, order?._id, selectedItem?.itemId]);

  const addTelegramMaterialRequestPhotoItem = useCallback(async (file, source = 'gallery') => {
    if (!order?._id || !selectedItem?.itemId || !file) return;

    const sessionToken = getActiveTelegramSessionToken();
    if (!sessionToken) {
      setMaterialRequestError('Не удалось подтвердить Telegram-сессию для загрузки фото.');
      return;
    }

    const busyKey = `add-photo:${source}`;
    setMaterialRequestBusyKey(busyKey);
    setMaterialRequestError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('itemId', selectedItem.itemId);
      formData.append('sessionToken', sessionToken);
      const res = await apiFetch(`/api/orders/${order._id}/telegram-material-request-photo-items`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, 'Не удалось добавить фото в заявки на расходники.'));
      }
      const data = await parseJsonSafely(res);
      setOrder(data?.order || null);
      if (data?.employee) {
        setTelegramEmployee(data.employee);
      }
    } catch (error) {
      setMaterialRequestError(getTelegramMaterialRequestErrorMessage(error, 'Не удалось добавить фото в заявки на расходники.'));
    } finally {
      setMaterialRequestBusyKey('');
    }
  }, [getActiveTelegramSessionToken, order?._id, selectedItem?.itemId]);

  const handleTelegramMaterialRequestPhotoInputChange = useCallback((source = 'gallery') => async (event) => {
    const file = event.target?.files?.[0] || null;
    if (event.target) {
      event.target.value = '';
    }
    if (!file) return;
    await addTelegramMaterialRequestPhotoItem(file, source);
  }, [addTelegramMaterialRequestPhotoItem]);

  const handleOpenTelegramMaterialRequestAttachment = useCallback(async (materialRequestItem, attachment) => {
    const requestItemId = String(materialRequestItem?.id || '').trim();
    if (!order?._id || !selectedItem?.itemId || !requestItemId || !attachment?.attachmentId) return;

    const openKey = `material-request:${requestItemId}:${attachment.attachmentId}`;
    const fileUrl = getTelegramMaterialRequestAttachmentUrl(requestItemId, attachment.attachmentId);
    if (!fileUrl) {
      setMaterialRequestError('Не удалось подготовить ссылку для открытия фото.');
      return;
    }

    setTelegramAttachmentOpeningKey(openKey);
    setMaterialRequestError('');
    try {
      const previewMeta = {
        attachment,
        kindLabel: getAttachmentKindLabel(attachment),
        name: getMaterialRequestItemDisplayName(materialRequestItem),
        sizeLabel: formatAttachmentSize(attachment.size),
        sourceUrl: fileUrl,
      };

      closeTelegramSpreadsheetPreview();
      if (isImageAttachment(attachment)) {
        setTelegramAttachmentPreviewState({
          ...previewMeta,
          mode: 'image',
          url: fileUrl,
          revokeUrl: false,
        });
        return;
      }

      const opened = openTelegramFileUrl(fileUrl, attachment.name || 'attachment');
      if (!opened) {
        setMaterialRequestError('Браузер заблокировал открытие файла. Разрешите открытие новой вкладки.');
      }
    } catch (error) {
      setMaterialRequestError(getTelegramMaterialRequestErrorMessage(error, 'Не удалось открыть фото заявки на расходники.'));
    } finally {
      setTelegramAttachmentOpeningKey('');
    }
  }, [
    closeTelegramSpreadsheetPreview,
    getTelegramMaterialRequestAttachmentUrl,
    openTelegramFileUrl,
    setTelegramAttachmentPreviewState,
  ]);

  const saveTelegramMaterialRequestName = useCallback(async (materialRequestItem) => {
    const requestItemId = String(materialRequestItem?.id || '').trim();
    if (!order?._id || !selectedItem?.itemId || !requestItemId) return;

    const sessionToken = getActiveTelegramSessionToken();
    if (!sessionToken) {
      setMaterialRequestError('Не удалось подтвердить Telegram-сессию для сохранения названия фото.');
      return;
    }

    const name = String(
      Object.prototype.hasOwnProperty.call(materialRequestNameDrafts, requestItemId)
        ? materialRequestNameDrafts[requestItemId]
        : (materialRequestItem?.name || ''),
    ).trim();

    setMaterialRequestBusyKey(`name:${requestItemId}`);
    setMaterialRequestError('');
    try {
      const res = await apiFetch(`/api/orders/${id}/telegram-material-request-items/${encodeURIComponent(requestItemId)}/name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: selectedItem.itemId,
          sessionToken,
          name,
        }),
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, 'Не удалось сохранить название фото.'));
      }
      const data = await parseJsonSafely(res);
      setOrder(data?.order || null);
      if (data?.employee) {
        setTelegramEmployee(data.employee);
      }
      setMaterialRequestNameDrafts((current) => {
        const next = { ...current };
        delete next[requestItemId];
        return next;
      });
    } catch (error) {
      setMaterialRequestError(getTelegramMaterialRequestErrorMessage(error, 'Не удалось сохранить название фото.'));
    } finally {
      setMaterialRequestBusyKey('');
    }
  }, [
    getActiveTelegramSessionToken,
    id,
    materialRequestNameDrafts,
    order?._id,
    selectedItem?.itemId,
  ]);

  const addTelegramPackageItem = useCallback(async () => {
    const nextName = String(packageDraft || '').trim();
    if (!telegramMode || !telegramEmployee || !selectedItem?.itemId) return;
    if (!nextName) {
      setPackageError('Введите название позиции комплектации.');
      return;
    }

    setPackageBusyKey('add');
    setPackageError('');
    try {
      const sessionToken = getActiveTelegramSessionToken();
      const res = await apiFetch(`/api/orders/${id}/telegram-package-items`, {
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
        throw new Error(await getErrorMessage(res, 'Не удалось добавить позицию комплектации.'));
      }
      const data = await parseJsonSafely(res);
      setOrder(data?.order || null);
      if (data?.employee) {
        setTelegramEmployee(data.employee);
      }
      setPackageDraft('');
    } catch (error) {
      setPackageError(getTelegramMaterialRequestErrorMessage(error, 'Не удалось добавить позицию комплектации.'));
    } finally {
      setPackageBusyKey('');
    }
  }, [
    getActiveTelegramSessionToken,
    id,
    packageDraft,
    selectedItem?.itemId,
    telegramEmployee,
    telegramInitData,
    telegramMode,
    telegramUnsafeUser,
  ]);

  const toggleTelegramPackageItem = useCallback(async (packageItemId) => {
    const normalizedPackageItemId = String(packageItemId || '').trim();
    if (!telegramMode || !telegramEmployee || !selectedItem?.itemId || !normalizedPackageItemId) return;

    setPackageBusyKey(`toggle:${normalizedPackageItemId}`);
    setPackageError('');
    try {
      const sessionToken = getActiveTelegramSessionToken();
      const res = await apiFetch(`/api/orders/${id}/telegram-package-items/${encodeURIComponent(normalizedPackageItemId)}/toggle`, {
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
        throw new Error(await getErrorMessage(res, 'Не удалось изменить позицию комплектации.'));
      }
      const data = await parseJsonSafely(res);
      setOrder(data?.order || null);
      if (data?.employee) {
        setTelegramEmployee(data.employee);
      }
    } catch (error) {
      setPackageError(getTelegramMaterialRequestErrorMessage(error, 'Не удалось изменить позицию комплектации.'));
    } finally {
      setPackageBusyKey('');
    }
  }, [
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

  return (
    <div className={`card order-detail-card${telegramMode ? ' telegram-order-card' : ''}`}>
      <h2>{telegramMode ? `Изделие: ${selectedItem?.name || primaryItem?.name || '—'}` : `📋 Изделие: ${selectedItem?.name || primaryItem?.name || '—'}`}</h2>

      {telegramActionError && (
        <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
          {telegramActionError}
        </div>
      )}

      {telegramMode ? (
        <>
          <div className="telegram-order-summary">
            <div className="telegram-order-summary-actions">
              <button
                type="button"
                className={`btn ${telegramReadOnlySection?.key === 'orderCard' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={(event) => openTelegramReadOnlySection('orderCard', event)}
                disabled={!canViewOrderCard}
              >
                Карточка заказа
              </button>
              <button
                type="button"
                className={`btn ${telegramReadOnlySection?.key === 'paint' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={(event) => openTelegramReadOnlySection('paint', event)}
                disabled={!canViewPaint}
              >
                Покраска
              </button>
            </div>
          </div>

          {telegramReadOnlySection ? (
            <div className="telegram-readonly-panel">
              <div className="telegram-readonly-panel-header">
                <div className="telegram-readonly-title">{telegramReadOnlySection.title}</div>
                <button type="button" className="telegram-readonly-close-btn" onClick={closeTelegramReadOnlySection}>
                  Закрыть
                </button>
              </div>

              {telegramReadOnlySection.text ? (
                <div className="telegram-readonly-text">{telegramReadOnlySection.text}</div>
              ) : null}

              {telegramReadOnlySection.attachments.length > 0 ? (
                <div className="telegram-readonly-files">
                  {telegramReadOnlySection.attachments.map((attachment) => {
                    const attachmentName = String(attachment?.name || '').trim() || 'Без названия';
                    const attachmentMeta = [
                      isLinkAttachment(attachment) ? 'Ссылка' : 'Файл',
                      attachment?.uploadedAt ? formatDateTimeDisplay(attachment.uploadedAt) : '',
                    ].filter(Boolean).join(' · ');

                    return (
                      <div key={String(attachment?.attachmentId || attachmentName)} className="telegram-readonly-file">
                        <button
                          type="button"
                          className="telegram-readonly-open-btn"
                          onClick={() => handleOpenTelegramReadOnlyAttachment(
                            attachment,
                            telegramReadOnlySection.key === 'paint' ? 'paint' : 'order',
                          )}
                          disabled={telegramAttachmentOpeningKey === `${telegramReadOnlySection.key === 'paint' ? 'paint' : 'order'}:${attachment.attachmentId}`}
                        >
                          {telegramAttachmentOpeningKey === `${telegramReadOnlySection.key === 'paint' ? 'paint' : 'order'}:${attachment.attachmentId}`
                            ? 'Открываю...'
                            : attachmentName}
                        </button>
                        {attachmentMeta ? (
                          <div className="telegram-readonly-file-meta">{attachmentMeta}</div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {!telegramReadOnlySection.text && telegramReadOnlySection.attachments.length === 0 ? (
                <div className="telegram-empty-box">
                  {telegramReadOnlySection.emptyText}
                </div>
              ) : null}

              {telegramSpreadsheetPreview ? (
                <div className="attachment-preview-panel telegram-inline-attachment-preview">
                  <div className="attachment-preview-toolbar">
                    <div className="attachment-preview-toolbar-meta">
                      <span className="attachment-preview-toolbar-kind">{telegramSpreadsheetPreview.kindLabel || 'Excel'}</span>
                      <span className="attachment-preview-toolbar-size">
                        {telegramSpreadsheetPreview.sizeLabel
                          ? `${telegramSpreadsheetPreview.name || 'Файл'} · ${telegramSpreadsheetPreview.sizeLabel}`
                          : (telegramSpreadsheetPreview.name || 'Файл')}
                      </span>
                    </div>
                    <div className="telegram-readonly-panel-toolbar-actions">
                      {telegramSpreadsheetPreview.sourceUrl ? (
                        <button
                          type="button"
                          className="telegram-readonly-close-btn"
                          onClick={() => openTelegramFileUrl(
                            telegramSpreadsheetPreview.sourceUrl,
                            telegramSpreadsheetPreview.name || 'attachment',
                          )}
                        >
                          Открыть отдельно
                        </button>
                      ) : null}
                      <button type="button" className="telegram-readonly-close-btn" onClick={closeTelegramSpreadsheetPreview}>
                        Закрыть файл
                      </button>
                    </div>
                  </div>
                  <div className="attachment-preview-sheet-view">
                    <div className="attachment-preview-sheet-tabs">
                      {(telegramSpreadsheetPreview.sheets || []).map((sheet, index) => (
                        <button
                          key={`${sheet.name}-${index}`}
                          type="button"
                          className={[
                            'attachment-preview-sheet-tab',
                            index === (telegramSpreadsheetPreview.activeSheetIndex || 0) ? 'attachment-preview-sheet-tab-active' : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => setTelegramSpreadsheetPreview((current) => current ? {
                            ...current,
                            activeSheetIndex: index,
                          } : current)}
                        >
                          {sheet.name}
                        </button>
                      ))}
                    </div>
                    <div className="attachment-preview-sheet-meta">
                      {(() => {
                        const activeSheet = (telegramSpreadsheetPreview.sheets || [])[telegramSpreadsheetPreview.activeSheetIndex || 0];
                        const shownRows = Math.min((activeSheet?.rows || []).length, 100);
                        const totalRows = Number(activeSheet?.totalRows) || 0;
                        return totalRows > shownRows
                          ? `Показаны первые ${shownRows} из ${totalRows} строк`
                          : `Показано строк: ${shownRows}`;
                      })()}
                    </div>
                    <div className="attachment-preview-table-wrap">
                      <table className="attachment-preview-table">
                        <tbody>
                          {(((telegramSpreadsheetPreview.sheets || [])[telegramSpreadsheetPreview.activeSheetIndex || 0]?.rows) || []).map((row, rowIndex) => (
                            <tr key={`sheet-row-${rowIndex}`}>
                              {(Array.isArray(row) ? row : [row]).map((cell, cellIndex) => (
                                <td key={`sheet-cell-${rowIndex}-${cellIndex}`}>{String(cell ?? '') || ' '}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}

              {telegramAttachmentPreview ? (
                <div className="attachment-preview-panel telegram-inline-attachment-preview">
                  <div className="attachment-preview-toolbar">
                    <div className="attachment-preview-toolbar-meta">
                      <span className="attachment-preview-toolbar-kind">{telegramAttachmentPreview.kindLabel || 'Файл'}</span>
                      <span className="attachment-preview-toolbar-size">
                        {telegramAttachmentPreview.sizeLabel
                          ? `${telegramAttachmentPreview.name || 'Файл'} · ${telegramAttachmentPreview.sizeLabel}`
                          : (telegramAttachmentPreview.name || 'Файл')}
                      </span>
                    </div>
                    <div className="telegram-readonly-panel-toolbar-actions">
                      {telegramAttachmentPreview.sourceUrl ? (
                        <button
                          type="button"
                          className="telegram-readonly-close-btn"
                          onClick={() => openTelegramFileUrl(
                            telegramAttachmentPreview.sourceUrl,
                            telegramAttachmentPreview.name || 'attachment',
                          )}
                        >
                          Открыть отдельно
                        </button>
                      ) : null}
                      <button type="button" className="telegram-readonly-close-btn" onClick={closeTelegramAttachmentPreview}>
                        Закрыть файл
                      </button>
                    </div>
                  </div>
                  <div
                    className={[
                      'attachment-preview-wrap',
                      telegramAttachmentPreview.mode === 'image' ? 'attachment-preview-wrap-image' : '',
                      telegramAttachmentPreview.mode === 'pdf' ? 'attachment-preview-wrap-pdf' : '',
                      telegramAttachmentPreview.mode === 'word' || telegramAttachmentPreview.mode === 'word-legacy'
                        ? 'attachment-preview-wrap-document'
                        : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {telegramAttachmentPreview.mode === 'image' ? (
                      <img
                        src={telegramAttachmentPreview.url}
                        alt={telegramAttachmentPreview.name || 'Изображение'}
                        className="attachment-preview-image"
                      />
                    ) : null}
                    {telegramAttachmentPreview.mode === 'pdf' ? (
                      <iframe
                        title={telegramAttachmentPreview.name || 'PDF'}
                        src={telegramAttachmentPreview.url}
                        className="attachment-preview-frame"
                      />
                    ) : null}
                    {telegramAttachmentPreview.mode === 'word' ? (
                      <div
                        className="attachment-preview-document"
                        dangerouslySetInnerHTML={{ __html: telegramAttachmentPreview.html || '<p>Пустой документ.</p>' }}
                      />
                    ) : null}
                    {telegramAttachmentPreview.mode === 'word-legacy' ? (
                      <div className="attachment-preview-document">
                        <p>Формат `.doc` не всегда стабильно рендерится внутри Telegram Web App.</p>
                        <p>Файл доступен по кнопке «Открыть отдельно» без выхода из карточки изделия.</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

            </div>
          ) : null}

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
                  const stageColumnKeys = Array.isArray(stage.columnKeys) && stage.columnKeys.length > 0
                    ? stage.columnKeys
                    : [stage.columnKey];
                  const stageMarks = stageColumnKeys
                    .map((columnKey) => selectedItem?.manualStageMarks?.[columnKey] || null)
                    .filter(Boolean);
                  const stageMark = stageMarks
                    .sort((left, right) => (
                      Date.parse(String(right?.updatedAt || '')) || 0
                    ) - (
                      Date.parse(String(left?.updatedAt || '')) || 0
                    ))[0] || null;
                  const isMarked = stageColumnKeys.every((columnKey) => {
                    const nextMark = selectedItem?.manualStageMarks?.[columnKey] || null;
                    const nextClear = Boolean(selectedItem?.manualStageClears?.[columnKey]);
                    return Boolean(nextMark && !nextClear);
                  });
                  const stageBusyKey = stage.actionKey || stageColumnKeys.join('|');
                  const isMarkBusy = stageActionKey === `stage:${stageBusyKey}:mark`;
                  const isClearBusy = stageActionKey === `stage:${stageBusyKey}:clear`;
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
                                ? `Принято${stageMark?.updatedBy ? ` · ${stageMark.updatedBy}` : ''}${stageMark?.updatedAt ? ` · ${formatDateTimeDisplay(stageMark.updatedAt)}` : ''}`
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
                          onClick={() => updateTelegramStageMark(stageColumnKeys, { clear: isMarked })}
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

          {(sessionLoading || sessionError || canManagePackage) && (
            <div className="telegram-package-section">
              <div className="telegram-section-title">Укомплектовано</div>

              {sessionLoading && (
                <div className="telegram-empty-box">
                  Проверяю доступ к комплектации...
                </div>
              )}

              {canManagePackage && (
                <>
                  <div className="telegram-package-meta">
                    Комплектация: {packageStats.completed}/{packageStats.total || 0}
                  </div>

                  <div className="telegram-package-input-row">
                    <input
                      type="text"
                      value={packageDraft}
                      onChange={(event) => {
                        setPackageDraft(event.target.value);
                        setPackageError('');
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addTelegramPackageItem();
                        }
                      }}
                      placeholder="Добавить позицию комплектации"
                      disabled={packageBusyKey === 'add'}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={addTelegramPackageItem}
                      disabled={packageBusyKey === 'add'}
                    >
                      {packageBusyKey === 'add' ? 'Добавляю...' : 'Добавить'}
                    </button>
                  </div>

                  {packageError && (
                    <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
                      {packageError}
                    </div>
                  )}

                  {packageStats.items.length > 0 ? (
                    <div className="telegram-stage-list">
                      {packageStats.items.map((packageItem) => {
                        const isBusy = packageBusyKey === `toggle:${packageItem.id}`;
                        return (
                          <div
                            key={packageItem.id}
                            className={`telegram-stage-card${packageItem.isCompleted ? ' telegram-stage-card-complete' : ''}`}
                            style={{
                              '--telegram-stage-accent': '#A8D7B6',
                              '--telegram-stage-text': '#1F1F1F',
                            }}
                          >
                            <div className="telegram-stage-card-top">
                              <div className="telegram-stage-card-main">
                                <div className="telegram-stage-card-swatch" aria-hidden="true" />
                                <div className="telegram-stage-card-copy">
                                  <div className="telegram-stage-card-title">
                                    {packageItem.name}
                                  </div>
                                  <div className="telegram-stage-card-subtitle">
                                    {packageItem.isCompleted
                                      ? `Укомплектовано${packageItem.completedAt ? ` · ${formatDateDisplay(packageItem.completedAt)}` : ''}`
                                      : 'Ожидает комплектации'}
                                  </div>
                                </div>
                              </div>
                              <span className={`telegram-stage-pill ${packageItem.isCompleted ? 'telegram-stage-pill-complete' : 'telegram-stage-pill-pending'}`}>
                                {packageItem.isCompleted ? 'Готово' : 'Ожидает'}
                              </span>
                            </div>
                            <div className="telegram-stage-card-actions">
                              <button
                                className={`btn ${packageItem.isCompleted ? 'btn-secondary telegram-stage-reset-btn' : 'btn-primary'}`}
                                onClick={() => toggleTelegramPackageItem(packageItem.id)}
                                disabled={isBusy}
                              >
                                {isBusy
                                  ? 'Сохраняю...'
                                  : (packageItem.isCompleted ? 'Снять отметку' : 'Отметить')}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="telegram-empty-box">
                      Позиции комплектации пока не добавлены.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

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

                  <div className="telegram-package-input-row telegram-material-request-input-row">
                    <input
                      ref={materialRequestInputRef}
                      type="text"
                      value={materialRequestDraft}
                      onChange={(event) => {
                        setMaterialRequestDraft(event.target.value);
                        setMaterialRequestError('');
                      }}
                      onFocus={() => keepMaterialRequestInputVisible({ behavior: 'auto' })}
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

                  <div className="telegram-material-request-add-photo-row">
                    <label className="btn btn-primary telegram-material-request-upload-label">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleTelegramMaterialRequestPhotoInputChange('gallery')}
                        disabled={Boolean(materialRequestBusyKey)}
                      />
                      <span>
                        {materialRequestBusyKey === 'add-photo:gallery' ? 'Загружаю...' : 'Добавить из галереи'}
                      </span>
                    </label>
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
                          {String(requestItem.kind || 'text') === 'photo' && Array.isArray(requestItem.attachments) && requestItem.attachments.length > 0 ? (
                            <>
                              {(() => {
                                const attachment = requestItem.attachments[0];
                                const photoUrl = getTelegramMaterialRequestAttachmentUrl(requestItem.id, attachment?.attachmentId);
                                const photoDisplayName = getMaterialRequestItemDisplayName(requestItem);
                                const photoNameValue = Object.prototype.hasOwnProperty.call(materialRequestNameDrafts, requestItem.id)
                                  ? materialRequestNameDrafts[requestItem.id]
                                  : photoDisplayName;
                                const isNameBusy = materialRequestBusyKey === `name:${requestItem.id}`;
                                const attachmentOpenKey = `material-request:${requestItem.id}:${attachment?.attachmentId || ''}`;
                                return (
                                  <>
                                    <div className="telegram-stage-card-top">
                                      <div className="telegram-stage-card-main">
                                        <div className="telegram-stage-card-swatch" aria-hidden="true" />
                                        <div className="telegram-stage-card-copy">
                                          <div className="telegram-stage-card-title">
                                            {photoDisplayName}
                                          </div>
                                          <div className="telegram-stage-card-subtitle">
                                            {attachment?.uploadedAt ? `Добавлено · ${formatDateTimeDisplay(attachment.uploadedAt)}` : 'Добавлено в заявки на расходники'}
                                          </div>
                                        </div>
                                      </div>
                                      <span className="telegram-stage-pill telegram-material-request-pill">
                                        Фото
                                      </span>
                                    </div>
                                    {photoUrl ? (
                                      <button
                                        type="button"
                                        className="telegram-material-request-photo-preview"
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          handleOpenTelegramMaterialRequestAttachment(requestItem, attachment);
                                        }}
                                        disabled={telegramAttachmentOpeningKey === attachmentOpenKey}
                                      >
                                        <img
                                          src={photoUrl}
                                          alt={attachment?.name || 'Фото расходника'}
                                          className="telegram-material-request-photo-image"
                                        />
                                      </button>
                                    ) : null}
                                    <input
                                      type="text"
                                      className="telegram-material-request-name-input"
                                      value={photoNameValue}
                                      onChange={(event) => {
                                        const nextValue = event.target.value;
                                        setMaterialRequestNameDrafts((current) => ({
                                          ...current,
                                          [requestItem.id]: nextValue,
                                        }));
                                        setMaterialRequestError('');
                                      }}
                                      placeholder="Название фото"
                                      disabled={isNameBusy}
                                    />
                                    <div className="telegram-material-request-comment-actions">
                                      <button
                                        type="button"
                                        className="btn btn-primary telegram-material-request-comment-save-btn"
                                        onClick={() => saveTelegramMaterialRequestName(requestItem)}
                                        disabled={isNameBusy}
                                      >
                                        {isNameBusy ? 'Сохраняю...' : 'Сохранить название'}
                                      </button>
                                    </div>
                                  </>
                                );
                              })()}
                            </>
                          ) : (
                            <>
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
                            </>
                          )}
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
              <tr><td><strong>Дата заказа</strong></td><td>{formatDateDisplay(order.orderDate)}</td></tr>
              <tr><td><strong>Начало изготовления</strong></td><td>{formatDateDisplay(order.startDate)}</td></tr>
              <tr><td><strong>Окончание изготовления</strong></td><td>{formatDateDisplay(order.endDate)}</td></tr>
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
