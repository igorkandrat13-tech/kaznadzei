import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import { useGlobalErrorEffect } from './globalErrors';
import { buildOrderStageLegendConfig, DEFAULT_ORDER_PRIMARY_HEADERS } from './orderStageLegend';
import { formatDateDisplay } from './dateTime';
import {
  getItemManufacturingMeta,
  getOrderManufacturingMeta,
  getOrderOverallStatus,
  getOrderPrimaryMaterial,
  getOrderPrimaryName,
  getOrderPrimaryQuantity,
  getOrderStages,
  isOrderArchived,
} from './orderSelectors';
import { getOrderStatusMeta, ORDER_STATUS_OPTIONS } from './statusMeta';
import { useRoleConfig } from './RoleConfigContext';
import { Button, cn } from './ui';

const ORDER_PRIMARY_HEADERS = DEFAULT_ORDER_PRIMARY_HEADERS;
const ORDER_CARD_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Карточка заказа');
const ORDER_PACKAGE_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Комплектация заказа');
const ORDER_CARPENTER_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('СТОЛЯР');
const ORDER_PAINT_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Покраска');
const ORDER_ITEM_START_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Начало изготовления изделия');
const ORDER_ITEM_END_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Окончание изготовления изделия');
const ORDER_ITEM_DURATION_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Время изготовления изделий');
const ORDER_DURATION_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Время изготовления заказа');
const ORDER_NUMBER_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Номер заказа');
const ORDER_CUSTOMER_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Заказчик');
const ORDER_ROOM_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Помещение');
const ORDER_ROOM_NUMBER_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('№ помещения');
const ORDER_ITEM_NUMBER_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('№ изделия в заказе');
const ORDER_QUANTITY_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Кол-во изделй');
const ORDER_NAME_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Наименование');
const ORDER_NOTES_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Примечания');
const ORDER_DELIVERY_DATE_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Отгрузка до');
const ORDER_MATERIAL_REQUESTS_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Заявки на расходники');

function getStageLegendKeyForPrimaryColumn(columnIndex = -1, secondaryHeaders = []) {
  if (columnIndex < 0) return '';
  let currentIndex = 0;
  for (const cell of secondaryHeaders) {
    const span = Number(cell.colSpan) || 1;
    if (columnIndex >= currentIndex && columnIndex < currentIndex + span) {
      return cell.legendKey || '';
    }
    currentIndex += span;
  }
  return '';
}
function getSecondaryHeaderForPrimaryColumn(columnIndex = -1, secondaryHeaders = []) {
  if (columnIndex < 0) return null;
  let currentIndex = 0;
  for (const cell of secondaryHeaders) {
    const span = Number(cell.colSpan) || 1;
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
function getPrimaryColumnIndexForManualStageColumn(columnKey = '') {
  switch (String(columnKey || '').trim()) {
    case 'orderNumber':
      return ORDER_NUMBER_COLUMN_INDEX;
    case 'customer':
      return ORDER_CUSTOMER_COLUMN_INDEX;
    case 'room':
      return ORDER_ROOM_COLUMN_INDEX;
    case 'roomNumber':
      return ORDER_ROOM_NUMBER_COLUMN_INDEX;
    case 'itemNumber':
      return ORDER_ITEM_NUMBER_COLUMN_INDEX;
    case 'quantity':
      return ORDER_QUANTITY_COLUMN_INDEX;
    case 'name':
      return ORDER_NAME_COLUMN_INDEX;
    case 'orderCard':
      return ORDER_CARD_COLUMN_INDEX;
    case 'packageName':
      return ORDER_PACKAGE_COLUMN_INDEX;
    case 'notes':
      return ORDER_NOTES_COLUMN_INDEX;
    case 'deliveryDate':
      return ORDER_DELIVERY_DATE_COLUMN_INDEX;
    case 'materialRequests':
      return ORDER_MATERIAL_REQUESTS_COLUMN_INDEX;
    case 'carpenter':
      return ORDER_CARPENTER_COLUMN_INDEX;
    case 'paint':
      return ORDER_PAINT_COLUMN_INDEX;
    case 'itemStartDate':
      return ORDER_ITEM_START_COLUMN_INDEX;
    case 'itemEndDate':
      return ORDER_ITEM_END_COLUMN_INDEX;
    case 'itemDuration':
      return ORDER_ITEM_DURATION_COLUMN_INDEX;
    case 'duration':
      return ORDER_DURATION_COLUMN_INDEX;
    default:
      return -1;
  }
}

function compareNaturalTextAsc(leftValue = '', rightValue = '') {
  const left = String(leftValue || '').trim();
  const right = String(rightValue || '').trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, 'ru', {
    numeric: true,
    sensitivity: 'base',
  });
}

function compareOrderItemsByRoomNumberAsc(leftItem = {}, rightItem = {}) {
  const roomNumberDiff = compareNaturalTextAsc(leftItem?.roomNumber, rightItem?.roomNumber);
  if (roomNumberDiff !== 0) return roomNumberDiff;

  const roomDiff = compareNaturalTextAsc(leftItem?.room, rightItem?.room);
  if (roomDiff !== 0) return roomDiff;

  const itemNumberDiff = compareNaturalTextAsc(leftItem?.itemNumber, rightItem?.itemNumber);
  if (itemNumberDiff !== 0) return itemNumberDiff;

  return compareNaturalTextAsc(leftItem?.name, rightItem?.name);
}

function sortOrderItemsByRoomNumber(items = []) {
  return (Array.isArray(items) ? items : []).slice().sort(compareOrderItemsByRoomNumberAsc);
}

function getManualStageSecondaryHeader(columnKey = '', secondaryHeaders = []) {
  return getSecondaryHeaderForPrimaryColumn(getPrimaryColumnIndexForManualStageColumn(columnKey), secondaryHeaders);
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
    .filter((item) => item.name)
    .map((item) => ({
      id: createPackageItemId(),
      ...item,
    }));
}

function getPackageStats(items = [], legacyPackageName = '') {
  const normalizedItems = normalizePackageItems(items, legacyPackageName);
  const total = normalizedItems.length;
  const completed = normalizedItems.filter((item) => item.isCompleted).length;
  const pending = Math.max(0, total - completed);
  return { total, completed, pending, items: normalizedItems };
}

function getCommentPreview(comments = []) {
  if (!Array.isArray(comments) || comments.length === 0) return '—';
  return comments
    .map(comment => `${comment.role}: ${comment.text}`)
    .join(' | ');
}

function formatManufacturingTime(startDate, endDate) {
  const normalizedStart = String(startDate || '').trim();
  if (!normalizedStart) return '—';

  const start = new Date(normalizedStart);
  if (Number.isNaN(start.getTime())) return '—';

  const normalizedEnd = String(endDate || '').trim() || new Date().toISOString().split('T')[0];
  const end = new Date(normalizedEnd);
  if (Number.isNaN(end.getTime())) return '—';

  const diffDays = Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
  return String(diffDays);
}

function getItemActiveRoleStage(item, role) {
  return (item?.stages || []).find((stage) => stage.role === role && stage.status === 'in_progress') || null;
}

function getItemWorkerAssignment(item, role) {
  if (!item?.workerAssignments || typeof item.workerAssignments !== 'object') return null;
  return item.workerAssignments[role] || null;
}

function getItemActiveStage(item) {
  return (item?.stages || []).find((stage) => stage.status === 'in_progress') || null;
}

function getItemAssignedStage(item) {
  const stages = Array.isArray(item?.stages) ? item.stages : [];
  const stagesWithEmployee = stages.filter((stage) => String(stage.employeeName || '').trim());
  if (stagesWithEmployee.length === 0) return null;

  const inProgressStages = stagesWithEmployee.filter((stage) => stage.status === 'in_progress');
  const candidates = inProgressStages.length > 0 ? inProgressStages : stagesWithEmployee;

  return candidates.reduce((currentStage, stage) => {
    if (!currentStage) return stage;
    const currentTs = Date.parse(currentStage.startedAt || currentStage.completedAt || '') || 0;
    const nextTs = Date.parse(stage.startedAt || stage.completedAt || '') || 0;
    return nextTs >= currentTs ? stage : currentStage;
  }, null);
}

function getItemManualStageMark(item, columnKey) {
  if (!item?.manualStageMarks || typeof item.manualStageMarks !== 'object') return null;
  return item.manualStageMarks[columnKey] || null;
}

function getItemManualStageClear(item, columnKey) {
  if (!item?.manualStageClears || typeof item.manualStageClears !== 'object') return null;
  return item.manualStageClears[columnKey] || null;
}

function getLatestAutoHighlightAt(...timestamps) {
  return timestamps
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort()
    .at(-1) || '';
}

function getOrderIdentity(row) {
  return row.order?._id || row.order?.orderNumber || row.key;
}

function compareOrderNumbersAsc(left = {}, right = {}) {
  return String(left.orderNumber || '').localeCompare(String(right.orderNumber || ''), 'ru', {
    numeric: true,
    sensitivity: 'base',
  });
}

function getItemAttachments(item = {}, scope = '') {
  const fieldName = String(scope || '').trim().toLowerCase() === 'paint' ? 'paintAttachments' : 'attachments';
  return Array.isArray(item?.[fieldName]) ? item[fieldName] : [];
}

function isOrdersHeaderLeftAlignedColumn() {
  return false;
}

function getRoleShortLabel(role, roleTabs = []) {
  return roleTabs.find(tab => tab.key === role)?.plainLabel || role;
}

function getRoleProgressInfo(order, role, roleTabs = []) {
  const stages = getOrderStages(order);
  const roleStages = stages.filter(stage => stage.role === role);
  const total = roleStages.length;
  const roleLabel = getRoleShortLabel(role, roleTabs);

  if (total === 0) {
    return {
      total,
      text: '—',
      title: `${roleLabel}: этапы не настроены`,
      className: 'role-progress-badge',
    };
  }

  const completed = roleStages.filter(stage => stage.status === 'completed').length;
  const activeIndex = roleStages.findIndex(stage => stage.status === 'in_progress');
  const firstPendingIndex = roleStages.findIndex(stage => stage.status !== 'completed');
  const lastCompletedStage = completed > 0 ? roleStages[completed - 1] : null;

  if (completed === total) {
    return {
      total,
      text: `Готово ${total} из ${total}`,
      title: `${roleLabel}: все этапы завершены${lastCompletedStage?.stepName ? `\nПоследний этап: ${lastCompletedStage.stepName}` : ''}`,
      className: 'role-progress-badge role-progress-badge-completed',
    };
  }

  const currentStageIndex = activeIndex !== -1 ? activeIndex : (firstPendingIndex === -1 ? total - 1 : firstPendingIndex);
  const isWaiting = activeIndex === -1 && completed === 0;
  const currentStage = roleStages[currentStageIndex] || null;
  const progressTitle = [
    `${roleLabel}: завершено ${completed} из ${total}`,
    currentStage?.stepName
      ? `${isWaiting ? 'Ближайший этап' : 'Текущий этап'}: ${currentStage.stepName}`
      : '',
  ].filter(Boolean).join('\n');

  if (isWaiting) {
    return {
      total,
      text: 'Ожидание',
      title: progressTitle,
      className: 'role-progress-badge role-progress-badge-pending',
    };
  }

  return {
    total,
    text: `Этап ${currentStageIndex + 1} из ${total}`,
    title: progressTitle,
    className: `role-progress-badge ${isWaiting ? 'role-progress-badge-pending' : 'role-progress-badge-active'}`,
  };
}

function Archive() {
  const { allRoleTabs } = useRoleConfig();
  const [orders, setOrders] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [restoringOrder, setRestoringOrder] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [orderStageLegendConfig, setOrderStageLegendConfig] = useState(() => buildOrderStageLegendConfig());
  const [hoveredOrderId, setHoveredOrderId] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');
  const headerScrollRef = useRef(null);
  const bodyScrollRef = useRef(null);
  const syncingScrollRef = useRef(false);
  useGlobalErrorEffect(error, 'Ошибка в архиве заказов.');

  const fetchOrders = useCallback(() => {
    setError('');
    apiFetch('/api/orders')
      .then(res => parseJsonSafely(res))
      .then(data => {
        setOrders(Array.isArray(data) ? data : []);
        setLastRefreshedAt(new Date().toISOString());
      })
      .catch(() => {
        setOrders([]);
        setError('Не удалось загрузить архив заказов.');
      });
  }, []);

  const fetchOrderStageLegendConfig = useCallback(async () => {
    try {
      const res = await apiFetch('/api/order-stage-legend-config');
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось загрузить конфигурацию этапов.');
      }
      setOrderStageLegendConfig(buildOrderStageLegendConfig(data || {}));
    } catch {
      setOrderStageLegendConfig(buildOrderStageLegendConfig());
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchOrderStageLegendConfig();
  }, [fetchOrderStageLegendConfig, fetchOrders]);

  const stageLegend = useMemo(() => orderStageLegendConfig.stages || [], [orderStageLegendConfig]);
  const primaryHeaderLabels = useMemo(() => orderStageLegendConfig.primaryHeaders || DEFAULT_ORDER_PRIMARY_HEADERS, [orderStageLegendConfig]);
  const secondaryHeaderSchema = useMemo(() => orderStageLegendConfig.secondaryHeaders || [], [orderStageLegendConfig]);
  const columnStageMeta = useMemo(() => {
    const createColumnMeta = (columnIndex) => {
      const header = getSecondaryHeaderForPrimaryColumn(columnIndex, secondaryHeaderSchema);
      const legendKey = getStageLegendKeyForPrimaryColumn(columnIndex, secondaryHeaderSchema);
      return {
        legendKey,
        header,
        hex: getSecondaryHeaderBackground(header),
        textHex: getSecondaryHeaderTextColor(header),
      };
    };

    return {
      carpenter: createColumnMeta(ORDER_CARPENTER_COLUMN_INDEX),
      materialRequests: createColumnMeta(ORDER_MATERIAL_REQUESTS_COLUMN_INDEX),
      itemStart: createColumnMeta(ORDER_ITEM_START_COLUMN_INDEX),
      itemEnd: createColumnMeta(ORDER_ITEM_END_COLUMN_INDEX),
      itemDuration: createColumnMeta(ORDER_ITEM_DURATION_COLUMN_INDEX),
      duration: createColumnMeta(ORDER_DURATION_COLUMN_INDEX),
      card: createColumnMeta(ORDER_CARD_COLUMN_INDEX),
      package: createColumnMeta(ORDER_PACKAGE_COLUMN_INDEX),
      paint: createColumnMeta(ORDER_PAINT_COLUMN_INDEX),
    };
  }, [secondaryHeaderSchema]);

  const legendColorMap = useMemo(() => {
    return stageLegend.reduce((acc, item) => {
      acc[item.key] = item.defaultHex || '#FFFFFF';
      return acc;
    }, {});
  }, [stageLegend]);

  const secondaryHeaderCells = useMemo(() => {
    let startIndex = 0;
    return secondaryHeaderSchema.map((item) => {
      const span = Number(item.colSpan) || 1;
      const cellStartIndex = startIndex;
      const cellEndIndex = cellStartIndex + span - 1;
      startIndex += span;
      return {
        ...item,
        hex: getSecondaryHeaderBackground(item),
        textColor: getSecondaryHeaderTextColor(item),
        startIndex: cellStartIndex,
        endIndex: cellEndIndex,
      };
    });
  }, [secondaryHeaderSchema]);

  const calcDuration = (start, end) => {
    if (!start || !end) return '—';
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff + ' дн.' : '—';
  };

  const filteredOrders = useMemo(() => orders
    .filter(o => isOrderArchived(o))
    .filter(o => {
      if (statusFilter !== 'all' && getOrderOverallStatus(o) !== statusFilter) return false;
      if (roleFilter !== 'all') {
        const stages = getOrderStages(o);
        const activeStage = stages.find(stage => stage.status === 'in_progress')
          || stages.find(stage => stage.status !== 'completed');
        if ((activeStage?.role || '') !== roleFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const match = [
          o.orderNumber,
          getOrderPrimaryName(o),
          o.customer,
          getOrderPrimaryMaterial(o),
        ].join(' ').toLowerCase();
        if (!match.includes(q)) return false;
      }
      if (dateFrom && o.startDate && new Date(o.startDate) < new Date(dateFrom)) return false;
      if (dateTo && o.endDate && new Date(o.endDate) > new Date(dateTo)) return false;
      return true;
    })
    .sort((left, right) => new Date(right.archivedAt || right.updatedAt || 0) - new Date(left.archivedAt || left.updatedAt || 0)), [
    dateFrom,
    dateTo,
    orders,
    roleFilter,
    search,
    statusFilter,
  ]);

  const rows = useMemo(() => {
    const sortedOrders = [...filteredOrders].sort(compareOrderNumbersAsc);
    return sortedOrders.flatMap((order) => {
      const items = Array.isArray(order.items) && order.items.length > 0 ? sortOrderItemsByRoomNumber(order.items) : [];
      const sourceRows = items.length > 0 ? items : [{
        itemId: '',
        itemNumber: '',
        room: '',
        roomNumber: '',
        quantity: '',
        name: '',
        deliveryDate: '',
        material: '',
        packageName: '',
        packageItems: [],
        materialRequests: '',
        notes: '',
        comments: [],
        manualStageMarks: {},
        manualStageClears: {},
        workerAssignments: {},
        stages: [],
        overallStatus: order?.overallStatus || 'pending',
        __placeholder: true,
      }];

      return sourceRows.map((item) => ({
        key: `${order._id}:${item.itemId || '__empty__'}`,
        orderId: order._id || '',
        order,
        item,
        carpenterActiveStage: getItemActiveRoleStage(item, 'carpenter'),
        carpenterAssignment: getItemWorkerAssignment(item, 'carpenter'),
        activeStage: getItemActiveStage(item),
        assignedStage: getItemAssignedStage(item),
        isPlaceholder: item?.__placeholder === true,
      }));
    });
  }, [filteredOrders]);

  const firstOrderRowKeys = useMemo(() => {
    const seenOrders = new Set();
    return rows.reduce((acc, row) => {
      const orderId = getOrderIdentity(row);
      const isFirst = !seenOrders.has(orderId);
      if (isFirst) {
        seenOrders.add(orderId);
      }
      acc[row.key] = isFirst;
      return acc;
    }, {});
  }, [rows]);

  const orderRowSpans = useMemo(() => {
    const counts = rows.reduce((acc, row) => {
      const orderId = getOrderIdentity(row);
      acc[orderId] = (acc[orderId] || 0) + 1;
      return acc;
    }, {});
    return rows.reduce((acc, row) => {
      const orderId = getOrderIdentity(row);
      acc[row.key] = firstOrderRowKeys[row.key] ? counts[orderId] || 1 : 0;
      return acc;
    }, {});
  }, [firstOrderRowKeys, rows]);

  const lastOrderRowKeys = useMemo(() => {
    return rows.reduce((acc, row) => {
      const orderId = getOrderIdentity(row);
      acc[orderId] = row.key;
      return acc;
    }, {});
  }, [rows]);

  const syncHorizontalScroll = useCallback((source, target) => {
    if (!source || !target) return;
    if (syncingScrollRef.current) return;
    syncingScrollRef.current = true;
    target.scrollLeft = source.scrollLeft;
    window.requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  }, []);

  const getReadOnlyCellProps = useCallback((rowKey, item, columnKey, baseClassName, baseStyle) => {
    const manualMark = getItemManualStageMark(item, columnKey);
    const manualClear = getItemManualStageClear(item, columnKey);
    const columnHeader = getManualStageSecondaryHeader(columnKey, secondaryHeaderSchema);
    const style = manualClear
      ? baseStyle
      : manualMark
      ? {
          ...(baseStyle || {}),
          ...(manualMark.legendKey
            ? {
                background: getSecondaryHeaderBackground(columnHeader),
                color: getSecondaryHeaderTextColor(columnHeader),
              }
            : {}),
        }
      : baseStyle;
    const title = manualMark
      ? (manualMark.legendKey || 'Ручная дата')
      : (manualClear ? 'Сброшено' : undefined);

    return {
      className: cn(baseClassName),
      style,
      'data-manual-stage-cell-key': `${rowKey}::${columnKey}`,
      title,
    };
  }, [secondaryHeaderSchema]);

  const renderOrdersColGroup = useCallback(() => (
    <colgroup>
      <col className="col-order-number" />
      <col className="col-customer" />
      <col className="col-room" />
      <col className="col-room-number" />
      <col className="col-item-number" />
      <col className="col-quantity" />
      <col className="col-name" />
      <col className="col-item-actions" />
      <col className="col-package" />
      <col className="col-notes" />
      <col className="col-delivery-date" />
      <col className="col-carpenter" />
      <col className="col-material-requests" />
      <col className="col-paint" />
      <col className="col-item-start-date" />
      <col className="col-item-end-date" />
      <col className="col-item-duration" />
      <col className="col-duration" />
    </colgroup>
  ), []);

  const renderAttachmentCountCell = useCallback((attachments = [], actionStyle = {}, emptyTitle = 'Файлы не прикреплены') => {
    const names = attachments.map((attachment) => attachment.name || 'Без названия').join(', ');
    return (
      <div className="order-card-cell-content">
        <span
          className="order-card-action-btn order-card-count-btn"
          style={actionStyle}
          title={attachments.length > 0 ? names : emptyTitle}
        >
          <span className="order-card-count-btn-icon">⌕</span>
          <span className="order-card-count-btn-value">{attachments.length}</span>
        </span>
      </div>
    );
  }, []);

  const requestRestore = (order) => {
    setError('');
    setConfirmRestore({
      id: order._id,
      orderNumber: order.orderNumber || '',
      name: getOrderPrimaryName(order) || '',
      customer: order.customer || '',
    });
  };

  const handleRestore = async () => {
    if (!confirmRestore?.id || restoringOrder) return;
    setRestoringOrder(true);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${confirmRestore.id}/restore`, { method: 'POST' });
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось вернуть заказ в работу.'));
        return;
      }
      setConfirmRestore(null);
      fetchOrders();
    } finally {
      setRestoringOrder(false);
    }
  };

  const requestDelete = (order) => {
    setError('');
    setConfirmDelete({
      id: order._id,
      orderNumber: order.orderNumber || '',
      name: getOrderPrimaryName(order) || '',
      customer: order.customer || '',
    });
  };

  const handleDelete = async () => {
    if (!confirmDelete?.id || deletingOrder) return;
    setDeletingOrder(true);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось удалить заказ из архива.'));
        return;
      }
      setConfirmDelete(null);
      fetchOrders();
    } finally {
      setDeletingOrder(false);
    }
  };

  const renderArchiveRoleProgress = (order) => {
    const roleProgress = allRoleTabs
      .map(tab => ({ ...tab, progress: getRoleProgressInfo(order, tab.key, allRoleTabs) }))
      .filter(item => item.progress.total > 0);

    if (roleProgress.length === 0) {
      return <span className="empty-inline">—</span>;
    }

    return (
      <div className="order-role-progress-list">
        {roleProgress.map(item => (
          <div key={item.key} className="order-role-progress-row">
            <span className="order-role-progress-label">{getRoleShortLabel(item.key, allRoleTabs)}</span>
            <span className={item.progress.className} title={item.progress.title}>
              {item.progress.text}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="card section-spaced">
        <div className="section-header">
          <div>
            <h2>📦 Архив заказов</h2>
            <p>Здесь отображаются только заказы, которые вручную перенесены в архив после полного завершения.</p>
          </div>
          <div className="section-header-actions">
            <Link to="/orders" className="btn btn-secondary">К заказам</Link>
            <Link to="/settings" className="btn btn-secondary">К настройкам</Link>
          </div>
        </div>
        {error ? (
          <div className="settings-alert settings-alert-error" style={{ marginTop: 12, marginBottom: 0 }}>
            {error}
          </div>
        ) : null}
        <div className="responsive-filters">
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
            <label>Поиск</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Номер, название, заказчик, материал" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Статус</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">Все</option>
              {ORDER_STATUS_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Дата с</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Ответственный</label>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="all">Все</option>
              {allRoleTabs.map(tab => (
                <option key={tab.key} value={tab.key}>{tab.label.replace(/^[^\s]+\s+/, '')}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Дата по</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="filters-summary">Найдено: {filteredOrders.length}</div>
        </div>
      </div>

      <div className="card orders-workspace-table-card archive-orders-table-card">
        <div className="desktop-table-only">
          <div
            ref={headerScrollRef}
            className="table-scroll unified-orders-header-scroll"
            onScroll={() => syncHorizontalScroll(headerScrollRef.current, bodyScrollRef.current)}
          >
            <table className="orders-table unified-orders-table unified-orders-header-table">
              {renderOrdersColGroup()}
              <thead>
                <tr className="xlsx-header-row xlsx-header-row-primary">
                  {primaryHeaderLabels.map((label, index) => (
                    <th
                      key={`archive-primary-header-${index}`}
                      className={cn(
                        'xlsx-header-primary-cell',
                        isOrdersHeaderLeftAlignedColumn(index) ? 'xlsx-header-cell-left' : 'xlsx-header-cell-center',
                      )}
                    >
                      {label || '\u00A0'}
                    </th>
                  ))}
                </tr>
                <tr className="xlsx-header-row xlsx-header-row-secondary">
                  {secondaryHeaderCells.map((cell, index) => (
                    <th
                      key={`archive-secondary-header-${cell.label}-${index}`}
                      colSpan={cell.colSpan || 1}
                      className={cn(
                        'xlsx-header-secondary-cell',
                        (cell.startIndex === 0 || cell.useTableBackground) && 'xlsx-header-secondary-cell-table-bg',
                        cell.legendKey && 'xlsx-header-secondary-cell-colored',
                        (cell.colSpan || 1) > 1 && 'xlsx-header-secondary-cell-merged',
                        cell.noWrap && 'xlsx-header-secondary-cell-nowrap',
                        (isOrdersHeaderLeftAlignedColumn(cell.startIndex) || isOrdersHeaderLeftAlignedColumn(cell.endIndex))
                          ? 'xlsx-header-cell-left'
                          : 'xlsx-header-cell-center',
                      )}
                      style={{
                        background: (cell.startIndex === 0 || cell.useTableBackground)
                          ? 'var(--orders-table-cell-background)'
                          : (cell.hex || undefined),
                        color: cell.textColor || '#000000',
                      }}
                    >
                      {cell.label}
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
          </div>

          <div
            ref={bodyScrollRef}
            className="table-scroll unified-orders-body-scroll"
            onScroll={() => syncHorizontalScroll(bodyScrollRef.current, headerScrollRef.current)}
          >
            <table className="orders-table unified-orders-table unified-orders-body-table">
              {renderOrdersColGroup()}
              <tbody onMouseLeave={() => setHoveredOrderId('')}>
                {rows.map(({ key, order, item, carpenterActiveStage, carpenterAssignment, activeStage, assignedStage, isPlaceholder }) => {
                  const isFirstOrderRow = Boolean(firstOrderRowKeys[key]);
                  const orderId = getOrderIdentity({ key, order });
                  const isLastOrderRow = lastOrderRowKeys[orderId] === key;
                  const orderRowSpan = orderRowSpans[key] || 1;
                  const isHoveredOrder = hoveredOrderId === orderId;
                  const orderGroupClass = `order-group-cell${isFirstOrderRow ? ' order-group-top' : ''}${isLastOrderRow ? ' order-group-bottom' : ''}`.trim();
                  const orderOutlineClass = `${isHoveredOrder ? `order-outline-cell${isFirstOrderRow ? ' order-outline-top' : ''}${isLastOrderRow ? ' order-outline-bottom' : ''}` : ''}`.trim();
                  const regularOrderClass = `order-filled-cell ${orderGroupClass} ${orderOutlineClass}`.trim();
                  const orderManufacturingMeta = getOrderManufacturingMeta(order);
                  const commentPreview = getCommentPreview(item.comments);
                  const itemManufacturingMeta = getItemManufacturingMeta(item);
                  const itemAttachments = getItemAttachments(item, 'order');
                  const paintAttachments = getItemAttachments(item, 'paint');
                  const packageStats = getPackageStats(item.packageItems, item.packageName);
                  const workerStageForText = assignedStage || carpenterActiveStage || activeStage || null;
                  const carpenterManualMark = getItemManualStageMark(item, 'carpenter');
                  const carpenterManualClear = Boolean(getItemManualStageClear(item, 'carpenter'));
                  const latestCarpenterAutoAt = getLatestAutoHighlightAt(
                    carpenterAssignment?.scannedAt,
                    carpenterActiveStage?.startedAt,
                    workerStageForText?.startedAt,
                  );
                  const hasCarpenterAutoHighlight = !carpenterManualClear && Boolean(carpenterAssignment || workerStageForText);
                  const workerCellText = String(
                    !carpenterManualClear && carpenterManualMark?.updatedBy
                      ? carpenterManualMark.updatedBy
                      : ''
                  ).trim() || '—';
                  const workerCellTitle = workerStageForText?.stepName || activeStage?.stepName || '';
                  const carpenterCellStyle = hasCarpenterAutoHighlight
                    ? {
                        background: columnStageMeta.carpenter.hex || '#C37C8E',
                        color: columnStageMeta.carpenter.textHex,
                      }
                    : undefined;
                  const carpenterCellClassName = `${hasCarpenterAutoHighlight ? '' : 'order-filled-cell'} ${orderGroupClass} ${orderOutlineClass}`.trim();
                  const roomCellProps = getReadOnlyCellProps(key, item, 'room', regularOrderClass, undefined);
                  const roomNumberCellPropsBase = getReadOnlyCellProps(key, item, 'roomNumber', regularOrderClass, undefined);
                  const roomNumberCellProps = {
                    ...roomNumberCellPropsBase,
                    className: cn(roomNumberCellPropsBase.className, 'orders-cell-center'),
                  };
                  const itemNumberCellPropsBase = getReadOnlyCellProps(key, item, 'itemNumber', regularOrderClass, undefined);
                  const itemNumberCellProps = {
                    ...itemNumberCellPropsBase,
                    className: cn(itemNumberCellPropsBase.className, 'orders-cell-center'),
                  };
                  const quantityCellPropsBase = getReadOnlyCellProps(key, item, 'quantity', regularOrderClass, undefined);
                  const quantityCellProps = {
                    ...quantityCellPropsBase,
                    className: cn(quantityCellPropsBase.className, 'orders-cell-center'),
                  };
                  const nameCellProps = getReadOnlyCellProps(key, item, 'name', regularOrderClass, undefined);
                  const deliveryDateCellProps = getReadOnlyCellProps(key, item, 'deliveryDate', regularOrderClass, undefined);
                  const itemStartDateManualMark = getItemManualStageMark(item, 'itemStartDate');
                  const itemStartDateManualClear = Boolean(getItemManualStageClear(item, 'itemStartDate'));
                  const hasItemStartStageMark = Boolean(itemStartDateManualMark && !itemStartDateManualClear);
                  const itemStartDateCellStyle = hasItemStartStageMark
                    ? {
                        background: columnStageMeta.itemStart.hex || '#C37C8E',
                        color: columnStageMeta.itemStart.textHex,
                      }
                    : undefined;
                  const itemStartDateCellProps = getReadOnlyCellProps(
                    key,
                    item,
                    'itemStartDate',
                    regularOrderClass,
                    itemStartDateCellStyle,
                  );
                  const itemEndDateCellStyle = undefined;
                  const itemEndDateCellPropsBase = getReadOnlyCellProps(
                    key,
                    item,
                    'itemEndDate',
                    regularOrderClass,
                    itemEndDateCellStyle,
                  );
                  const itemEndDateCellProps = {
                    ...itemEndDateCellPropsBase,
                    className: cn(itemEndDateCellPropsBase.className, 'item-end-date-cell'),
                  };
                  const orderCardActionStyle = {
                    background: columnStageMeta.card.hex || '#A8D7B6',
                    color: columnStageMeta.card.textHex,
                  };
                  const paintActionStyle = {
                    background: columnStageMeta.paint.hex || '#BDA6D5',
                    color: columnStageMeta.paint.textHex,
                  };
                  const packageManualMark = getItemManualStageMark(item, 'packageName');
                  const packageManualClear = Boolean(getItemManualStageClear(item, 'packageName'));
                  const packageStageHeader = getManualStageSecondaryHeader('packageName', secondaryHeaderSchema);
                  const hasPackageStageMark = Boolean(packageManualMark && !packageManualClear);
                  const packageCellStyle = packageStats.total > 0 && packageStats.pending === 0
                    ? {
                        background: columnStageMeta.package.hex || '#99E5FF',
                        color: columnStageMeta.package.textHex,
                      }
                    : undefined;
                  const packageSummaryBadgeStyle = hasPackageStageMark
                    ? {
                        background: getSecondaryHeaderBackground(packageStageHeader),
                        color: getSecondaryHeaderTextColor(packageStageHeader),
                      }
                    : {
                        background: columnStageMeta.package.hex || '#99E5FF',
                        color: columnStageMeta.package.textHex,
                      };
                  const packageCellPropsBase = getReadOnlyCellProps(key, item, 'packageName', regularOrderClass, packageCellStyle);
                  const packageCellProps = {
                    ...packageCellPropsBase,
                    className: cn(packageCellPropsBase.className, 'package-cell'),
                  };
                  const paintCellProps = getReadOnlyCellProps(key, item, 'paint', `order-card-cell ${regularOrderClass}`, undefined);
                  const materialRequestCellProps = getReadOnlyCellProps(key, item, 'materialRequests', `material-requests-cell ${regularOrderClass}`, undefined);
                  const notesCellProps = getReadOnlyCellProps(key, item, 'notes', `notes-cell ${regularOrderClass}`, undefined);
                  const carpenterCellProps = getReadOnlyCellProps(key, item, 'carpenter', carpenterCellClassName, carpenterCellStyle);
                  const orderNumberCellProps = getReadOnlyCellProps(
                    key,
                    item,
                    'orderNumber',
                    `sticky-col sticky-col-1 merged-order-cell merged-order-number-cell order-filled-cell order-group-cell order-group-top order-group-bottom order-group-left${isHoveredOrder ? ' order-outline-cell order-outline-top order-outline-bottom order-outline-left' : ''}`,
                    undefined,
                  );
                  const customerCellProps = getReadOnlyCellProps(
                    key,
                    item,
                    'customer',
                    `sticky-col sticky-col-2 merged-order-cell merged-order-customer-cell order-filled-cell order-group-cell order-group-top order-group-bottom${isHoveredOrder ? ' order-outline-cell order-outline-top order-outline-bottom' : ''}`,
                    undefined,
                  );
                  const orderCardCellProps = getReadOnlyCellProps(
                    key,
                    item,
                    'orderCard',
                    `order-card-cell ${regularOrderClass}`,
                  );
                  const itemDurationValue = itemManufacturingMeta.endDate
                    ? formatManufacturingTime(itemManufacturingMeta.startDate, itemManufacturingMeta.endDate)
                    : '—';
                  const hasItemManufacturingDuration = false;
                  const itemDurationCellStyle = undefined;
                  const itemDurationCellPropsBase = getReadOnlyCellProps(
                    key,
                    item,
                    'itemDuration',
                    regularOrderClass,
                    itemDurationCellStyle,
                  );
                  const itemDurationCellProps = {
                    ...itemDurationCellPropsBase,
                    className: cn(itemDurationCellPropsBase.className, 'item-duration-cell'),
                  };

                  const orderDurationValue = orderManufacturingMeta.endDate
                    ? formatManufacturingTime(orderManufacturingMeta.startDate, orderManufacturingMeta.endDate)
                    : '—';
                  const hasManufacturingDuration = Boolean(orderManufacturingMeta.isCompleted);
                  const durationMetaCellStyle = hasManufacturingDuration
                    ? {
                        background: columnStageMeta.duration.hex || '#F4C2A4',
                        color: columnStageMeta.duration.textHex,
                      }
                    : undefined;
                  const durationMetaCellProps = getReadOnlyCellProps(
                    key,
                    item,
                    'duration',
                    `merged-order-cell merged-order-meta-cell order-filled-cell order-group-cell order-group-top order-group-bottom order-group-right${isHoveredOrder ? ' order-outline-cell order-outline-top order-outline-bottom order-outline-right' : ''}`,
                    durationMetaCellStyle,
                  );

                  return (
                    <tr key={key} onMouseEnter={() => setHoveredOrderId(orderId)}>
                      {isFirstOrderRow ? (
                        <td rowSpan={orderRowSpan} {...orderNumberCellProps}>
                          <div className="merged-order-number-content">
                            <div className="archive-order-number-stack">
                              <div className="merged-order-number-link"><strong>{order.orderNumber || '—'}</strong></div>
                              <Button
                                variant="success"
                                size="sm"
                                className="archive-restore-trigger"
                                onClick={() => requestRestore(order)}
                                disabled={restoringOrder || deletingOrder}
                              >
                                Вернуть
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                className="archive-delete-trigger"
                                onClick={() => requestDelete(order)}
                                disabled={restoringOrder || deletingOrder}
                              >
                                Удалить
                              </Button>
                            </div>
                          </div>
                        </td>
                      ) : null}
                      {isFirstOrderRow ? (
                        <td rowSpan={orderRowSpan} {...customerCellProps}>
                          <div className="merged-order-customer-content">
                            <div className="order-primary-title-button merged-order-customer-button merged-order-customer-text">
                              <span className="order-primary-title-button-text"><strong>{order.customer || '—'}</strong></span>
                            </div>
                          </div>
                        </td>
                      ) : null}
                      <td {...roomCellProps}>
                        <div className="room-cell-content">
                          <div className="room-cell-text">{item.room || (isPlaceholder ? 'Добавьте помещение' : '—')}</div>
                        </div>
                      </td>
                      <td {...roomNumberCellProps}>{item.roomNumber || '—'}</td>
                      <td {...itemNumberCellProps}>{item.itemNumber || '—'}</td>
                      <td {...quantityCellProps}>{isPlaceholder ? '—' : (item.quantity || 1)}</td>
                      <td {...nameCellProps}>
                        <div className="order-primary-title">
                          <strong>{item.name || (isPlaceholder ? 'В заказе пока нет изделий' : '—')}</strong>
                        </div>
                      </td>
                      <td {...orderCardCellProps}>
                        {renderAttachmentCountCell(itemAttachments, orderCardActionStyle, 'Файлы карточки заказа не прикреплены')}
                      </td>
                      <td {...packageCellProps}>
                        <div className="package-cell-content">
                          <span
                            className={cn(
                              'package-cell-summary-badge',
                              packageStats.pending > 0 && !hasPackageStageMark && 'package-cell-summary-badge-attention',
                            )}
                            style={packageSummaryBadgeStyle}
                            title={packageStats.total > 0
                              ? `Комплектация: сделано ${packageStats.completed} из ${packageStats.total}`
                              : 'Комплектация не заполнена'}
                          >
                            <span className="package-cell-summary-badge-value">
                              {packageStats.completed}/{packageStats.total}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td {...notesCellProps}>
                        <>
                          {commentPreview !== '—' ? (
                            <div className="xlsx-order-cell-comment" title={commentPreview}>{commentPreview}</div>
                          ) : null}
                          {item.notes || (commentPreview !== '—' ? null : '—')}
                        </>
                      </td>
                      <td {...deliveryDateCellProps}>{formatDateDisplay(item.deliveryDate)}</td>
                      <td {...carpenterCellProps} title={workerCellTitle}>
                        {isPlaceholder ? '—' : workerCellText}
                      </td>
                      <td {...materialRequestCellProps}>
                        {item.materialRequests || '—'}
                      </td>
                      <td {...paintCellProps}>
                        {renderAttachmentCountCell(paintAttachments, paintActionStyle, 'Файлы покраски не прикреплены')}
                      </td>
                      <td {...itemStartDateCellProps}>{formatDateDisplay(itemManufacturingMeta.startDate)}</td>
                      <td {...itemEndDateCellProps}>{formatDateDisplay(itemManufacturingMeta.endDate)}</td>
                      <td {...itemDurationCellProps}>{itemDurationValue}</td>
                      {isFirstOrderRow ? (
                        <td rowSpan={orderRowSpan} {...durationMetaCellProps}>
                          <div className="merged-order-meta-content merged-order-meta-content-stacked">
                            <span className="merged-order-meta-pill">{formatDateDisplay(orderManufacturingMeta.startDate)}</span>
                            <span className="merged-order-meta-pill">{formatDateDisplay(orderManufacturingMeta.endDate)}</span>
                            <span className="merged-order-meta-pill">{orderDurationValue}</span>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="empty-cell">В архиве пока нет заказов</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mobile-card-list">
          {filteredOrders.map(order => {
            const statusMeta = getOrderStatusMeta(getOrderOverallStatus(order));
            return (
              <div key={order._id} className="mobile-order-card">
                <div className="mobile-order-card-header">
                  <div>
                    <div className="mobile-order-card-title">{getOrderPrimaryName(order) || '—'}</div>
                    <div className="mobile-order-card-subtitle">
                      {order.orderNumber || 'Без номера'} · {order.customer || 'Заказчик не указан'}
                    </div>
                  </div>
                  <span className={statusMeta.className}>{statusMeta.label}</span>
                </div>

                <div className="mobile-order-card-grid">
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Номер заказа</div>
                    <div className="mobile-order-card-value">{order.orderNumber || '—'}</div>
                  </div>
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Количество</div>
                    <div className="mobile-order-card-value">{getOrderPrimaryQuantity(order)}</div>
                  </div>
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Материал</div>
                    <div className="mobile-order-card-value">{getOrderPrimaryMaterial(order) || '—'}</div>
                  </div>
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Дата заказа</div>
                    <div className="mobile-order-card-value">{formatDateDisplay(order.orderDate)}</div>
                  </div>
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Начало</div>
                    <div className="mobile-order-card-value">{formatDateDisplay(order.startDate)}</div>
                  </div>
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Окончание</div>
                    <div className="mobile-order-card-value">{formatDateDisplay(order.endDate)}</div>
                  </div>
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Время</div>
                    <div className="mobile-order-card-value">{calcDuration(order.startDate, order.endDate) || '—'}</div>
                  </div>
                </div>

                <div className="mobile-order-card-note">
                  <div className="mobile-order-card-label">По специалистам</div>
                  <div>{renderArchiveRoleProgress(order)}</div>
                </div>
                <div className="archive-mobile-actions">
                  <Button
                    variant="success"
                    size="sm"
                    className="archive-order-action-btn"
                    onClick={() => requestRestore(order)}
                    disabled={restoringOrder || deletingOrder}
                  >
                    Вернуть в работу
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="archive-order-action-btn"
                    onClick={() => requestDelete(order)}
                    disabled={restoringOrder || deletingOrder}
                  >
                    Удалить из архива
                  </Button>
                </div>
              </div>
            );
          })}
          {filteredOrders.length === 0 && <div className="mobile-empty-state">В архиве пока нет заказов</div>}
        </div>

        <div className="filters-summary" style={{ marginTop: 12 }}>
          Обновлено: {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleTimeString() : '—'}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmRestore)}
        title="Вернуть заказ в работу?"
        message={confirmRestore ? `Заказ № ${confirmRestore.orderNumber || '—'} снова появится в рабочей таблице заказов.\nОсновное изделие: ${confirmRestore.name || '—'}\nЗаказчик: ${confirmRestore.customer || '—'}` : ''}
        confirmLabel="Вернуть в работу"
        onConfirm={handleRestore}
        onCancel={() => !restoringOrder && setConfirmRestore(null)}
        loading={restoringOrder}
        variant="primary"
      />
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Удалить заказ из архива?"
        message={confirmDelete ? `Заказ № ${confirmDelete.orderNumber || '—'} будет удален безвозвратно.\nОсновное изделие: ${confirmDelete.name || '—'}\nЗаказчик: ${confirmDelete.customer || '—'}` : ''}
        confirmLabel="Удалить заказ"
        onConfirm={handleDelete}
        onCancel={() => !deletingOrder && setConfirmDelete(null)}
        loading={deletingOrder}
        variant="danger"
      />
    </div>
  );
}

export default Archive;
