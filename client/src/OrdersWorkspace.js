import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmDialog from './ConfirmDialog';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import { canAccessRole, getAppAuthRole } from './appAuth';
import { buildOrderStageLegendConfig, DEFAULT_ORDER_PRIMARY_HEADERS } from './orderStageLegend';
import { getItemManufacturingMeta, getOrderManufacturingMeta, getOrderPrimaryName } from './orderSelectors';
import { Button, Modal, ModalHeader, cn } from './ui';
import useEscapeKey from './useEscapeKey';

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
const ORDER_DELIVERY_DATE_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Отгрузка до');
const ORDER_PHOTO_LINK_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('');
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
const ORDER_NAME_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Наименование');
const ORDER_NOTES_COLUMN_INDEX = ORDER_PRIMARY_HEADERS.indexOf('Примечания');
const ORDER_CARD_ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.bmp';
const ATTACHMENT_SCOPE_CONFIG = {
  order: {
    field: 'attachments',
    dialogTitle: 'Файлы карточки заказа',
    addButtonTitle: 'Загрузить файл карточки заказа',
    openButtonTitle: 'Открыть файлы карточки заказа',
    emptyTitle: 'Файлы и ссылки карточки заказа не прикреплены',
    deleteMessage: 'Файл будет удален из карточки изделия без возможности восстановления.',
  },
  paint: {
    field: 'paintAttachments',
    dialogTitle: 'Файлы покраски',
    addButtonTitle: 'Загрузить файл покраски',
    openButtonTitle: 'Открыть файлы покраски',
    emptyTitle: 'Файлы и ссылки покраски не прикреплены',
    deleteMessage: 'Файл будет удален из раздела покраски без возможности восстановления.',
  },
};
function getStageTextHex(legendKey = '', secondaryHeaders = []) {
  return secondaryHeaders.find((item) => item.legendKey === legendKey)?.textHex || '#000000';
}

function buildManualStageTextColorMap(secondaryHeaders = []) {
  return secondaryHeaders.reduce((acc, item) => {
    if (item.legendKey && !acc[item.legendKey]) {
      acc[item.legendKey] = item.textHex || '#000000';
    }
    return acc;
  }, {});
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
    case 'photoLink':
      return ORDER_PHOTO_LINK_COLUMN_INDEX;
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

function getLegendKeyForManualStageColumn(columnKey = '', secondaryHeaders = []) {
  const primaryColumnIndex = getPrimaryColumnIndexForManualStageColumn(columnKey);
  return getStageLegendKeyForPrimaryColumn(primaryColumnIndex, secondaryHeaders);
}

function getAttachmentKindLabel(attachment = {}) {
  const type = String(attachment.type || '').toLowerCase();
  if (isLinkAttachment(attachment)) return 'Ссылка';
  if (type.includes('pdf')) return 'PDF';
  if (type.includes('word') || type.includes('document')) return 'Word';
  if (type.includes('excel') || type.includes('spreadsheet') || type.includes('sheet')) return 'Excel';
  if (type.startsWith('image/')) return 'Изображение';
  return 'Файл';
}

function getAttachmentIcon(attachment = {}) {
  const type = String(attachment.type || '').toLowerCase();
  if (isLinkAttachment(attachment)) return 'LINK';
  if (type.includes('pdf')) return 'PDF';
  if (type.includes('word') || type.includes('document')) return 'DOC';
  if (type.includes('excel') || type.includes('spreadsheet') || type.includes('sheet')) return 'XLS';
  if (type.startsWith('image/')) return 'IMG';
  return 'FILE';
}

function getAttachmentExtension(attachment = {}) {
  const fileName = String(attachment.name || '').trim().toLowerCase();
  const match = fileName.match(/(\.[a-z0-9]+)$/i);
  return match ? match[1] : '';
}

function isImageAttachment(attachment = {}) {
  const type = String(attachment.type || '').toLowerCase();
  return type.startsWith('image/');
}

function isPdfAttachment(attachment = {}) {
  const type = String(attachment.type || '').toLowerCase();
  return type.includes('pdf') || getAttachmentExtension(attachment) === '.pdf';
}

function isDocxAttachment(attachment = {}) {
  const type = String(attachment.type || '').toLowerCase();
  const extension = getAttachmentExtension(attachment);
  return type.includes('wordprocessingml') || extension === '.docx';
}

function isSpreadsheetAttachment(attachment = {}) {
  const type = String(attachment.type || '').toLowerCase();
  const extension = getAttachmentExtension(attachment);
  return type.includes('excel')
    || type.includes('spreadsheet')
    || extension === '.xlsx'
    || extension === '.xls';
}

function isLinkAttachment(attachment = {}) {
  const type = String(attachment.type || '').toLowerCase();
  const url = String(attachment.url || '').trim();
  return Boolean(url) || type === 'text/uri-list';
}

function getAttachmentNameKey(fileName = '') {
  return String(fileName || '').trim().toLowerCase();
}

function getAttachmentLinkUrl(attachment = {}) {
  return String(attachment.url || '').trim();
}

function getAttachmentScopeConfig(scope = '') {
  return ATTACHMENT_SCOPE_CONFIG[String(scope || '').trim().toLowerCase()] || ATTACHMENT_SCOPE_CONFIG.order;
}

function getItemAttachments(item = {}, scope = '') {
  const fieldName = getAttachmentScopeConfig(scope).field;
  return Array.isArray(item?.[fieldName]) ? item[fieldName] : [];
}

function getAttachmentTargetKey(orderId = '', itemId = '', scope = '') {
  return `${String(scope || 'order').trim().toLowerCase()}:${String(orderId || '').trim()}:${String(itemId || '').trim()}`;
}

function isOrdersHeaderLeftAlignedColumn(columnIndex = -1) {
  return false;
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

function getPackageSummary(items = []) {
  return normalizePackageItems(items).map((item) => `${item.isCompleted ? '+' : '-'} ${item.name}`).join('; ');
}

function getPackageStats(items = [], legacyPackageName = '') {
  const normalizedItems = normalizePackageItems(items, legacyPackageName);
  const total = normalizedItems.length;
  const completed = normalizedItems.filter((item) => item.isCompleted).length;
  const pending = Math.max(0, total - completed);
  return { total, completed, pending, items: normalizedItems };
}

function getUsedItemNumbers(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item?.itemNumber || '').trim())
    .filter(Boolean);
}

function getNextAvailableItemNumber(usedNumbers = new Set()) {
  let nextNumber = 1;
  while (usedNumbers.has(String(nextNumber))) {
    nextNumber += 1;
  }
  const value = String(nextNumber);
  usedNumbers.add(value);
  return value;
}

function assignAutoItemNumbers(items = [], existingItems = []) {
  const usedNumbers = new Set(getUsedItemNumbers(existingItems));
  for (const item of items) {
    if (item?.itemId) {
      const itemNumber = String(item.itemNumber || '').trim();
      if (itemNumber) {
        usedNumbers.add(itemNumber);
      }
    }
  }

  return (Array.isArray(items) ? items : []).map((item) => {
    const explicitItemNumber = String(item?.itemNumber || '').trim();
    if (item?.itemId && explicitItemNumber) {
      return {
        ...item,
        itemNumber: explicitItemNumber,
      };
    }
    if (explicitItemNumber && !usedNumbers.has(explicitItemNumber)) {
      usedNumbers.add(explicitItemNumber);
      return {
        ...item,
        itemNumber: explicitItemNumber,
      };
    }
    return {
      ...item,
      itemNumber: getNextAvailableItemNumber(usedNumbers),
    };
  });
}

function formatAttachmentSize(size) {
  const numericSize = Number(size) || 0;
  if (numericSize <= 0) return '';
  if (numericSize >= 1024 * 1024) {
    return `${(numericSize / (1024 * 1024)).toFixed(1)} МБ`;
  }
  return `${Math.max(1, Math.round(numericSize / 1024))} КБ`;
}

function getCommentPreview(comments = []) {
  if (!Array.isArray(comments) || comments.length === 0) return '—';
  return comments
    .map(comment => `${comment.role}: ${comment.text}`)
    .join(' | ');
}

function formatDateDisplay(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '—';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? normalized : date.toLocaleDateString();
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
  return stages.find((stage) => stage.status === 'in_progress' && String(stage.employeeName || '').trim())
    || stages.find((stage) => String(stage.employeeName || '').trim())
    || null;
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

function buildManualStageCellKey(rowKey, columnKey) {
  return `${rowKey}::${columnKey}`;
}

function isManualStageSelectableColumn(columnKey) {
  return Boolean(String(columnKey || '').trim());
}

function escapeCsvValue(value) {
  const normalized = String(value ?? '');
  if (normalized.includes('"') || normalized.includes(';') || normalized.includes('\n')) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function createInlineDraft(row) {
  return {
    orderNumber: row.order.orderNumber || '',
    customer: row.order.customer || '',
    room: row.item.room || '',
    roomNumber: row.item.roomNumber || '',
    itemNumber: row.item.itemNumber || '',
    productNumber: row.item.productNumber || '',
    quantity: row.item.quantity || 1,
    name: row.item.name || '',
    deliveryDate: row.item.deliveryDate || '',
    material: row.item.material || '',
    packageName: row.item.packageName || '',
    packageItems: normalizePackageItems(row.item.packageItems, row.item.packageName),
    photoLink: row.item.photoLink || '',
    notes: row.item.notes || '',
  };
}

const EMPTY_ITEM = {
  itemNumber: '',
  productNumber: '',
  room: '',
  roomNumber: '',
  name: '',
  quantity: 1,
  material: '',
  deliveryDate: '',
  packageName: '',
  packageItems: [],
  photoLink: '',
  notes: '',
};

function createRoomEditorItem(index = 0) {
  return {
    ...EMPTY_ITEM,
    itemNumber: '',
    clientKey: `room-item-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

function createRoomEditorState({
  mode = 'room',
  orderId = '',
  sourceGroupKey = '',
  room = '',
  roomNumber = '',
  items = [createRoomEditorItem(0)],
} = {}) {
  return {
    mode,
    orderId,
    sourceGroupKey,
    room,
    roomNumber,
    items,
  };
}

function mapItemToRoomEditorItem(item = {}, index = 0) {
  return {
    itemId: item.itemId || '',
    clientKey: item.itemId || `room-item-edit-${index}`,
    itemNumber: item.itemNumber || '',
    productNumber: item.productNumber || '',
    name: item.name || '',
    quantity: item.quantity || 1,
    material: item.material || '',
    deliveryDate: item.deliveryDate || '',
    packageName: item.packageName || '',
    packageItems: normalizePackageItems(item.packageItems, item.packageName),
    photoLink: item.photoLink || '',
    notes: item.notes || '',
  };
}

function buildRoomGroupKey(room = '', roomNumber = '') {
  return `${String(room || '').trim()}::${String(roomNumber || '').trim()}`;
}

function getOrderLabel(order = {}) {
  const orderNumber = String(order.orderNumber || '').trim();
  const customer = String(order.customer || '').trim();
  if (orderNumber && customer) return `№ ${orderNumber} · ${customer}`;
  if (orderNumber) return `№ ${orderNumber}`;
  if (customer) return customer;
  return 'Заказ без номера';
}

function compareOrderNumbersAsc(leftOrder = {}, rightOrder = {}) {
  const leftNumber = String(leftOrder?.orderNumber || '').trim();
  const rightNumber = String(rightOrder?.orderNumber || '').trim();
  if (!leftNumber && !rightNumber) return 0;
  if (!leftNumber) return 1;
  if (!rightNumber) return -1;

  const naturalCompare = leftNumber.localeCompare(rightNumber, 'ru', {
    numeric: true,
    sensitivity: 'base',
  });
  if (naturalCompare !== 0) return naturalCompare;

  return String(leftOrder?._id || '').localeCompare(String(rightOrder?._id || ''), 'ru', {
    numeric: true,
    sensitivity: 'base',
  });
}

function getOrderRoomOptions(order = {}) {
  const roomMap = new Map();
  for (const item of (order.items || [])) {
    const key = buildRoomGroupKey(item.room, item.roomNumber);
    if (!key || roomMap.has(key)) continue;
    const room = String(item.room || '').trim();
    const roomNumber = String(item.roomNumber || '').trim();
    roomMap.set(key, {
      key,
      room,
      roomNumber,
      label: `${room || 'Без названия'}${roomNumber ? ` · № ${roomNumber}` : ''}`,
    });
  }
  return Array.from(roomMap.values());
}

function getRoomEditorItemsForGroup(order = {}, groupKey = '') {
  const targetKey = String(groupKey || '').trim();
  if (!targetKey) return [createRoomEditorItem(0)];
  const roomItems = (order.items || []).filter((item) => buildRoomGroupKey(item.room, item.roomNumber) === targetKey);
  return roomItems.length > 0
    ? roomItems.map((roomItem, index) => mapItemToRoomEditorItem(roomItem, index))
    : [createRoomEditorItem(0)];
}

function createEditRoomEditorState(order = {}) {
  const roomOptions = getOrderRoomOptions(order);
  const selectedRoom = roomOptions[0] || null;
  return createRoomEditorState({
    mode: 'edit',
    orderId: order?._id || '',
    sourceGroupKey: selectedRoom?.key || '',
    room: selectedRoom?.room || '',
    roomNumber: selectedRoom?.roomNumber || '',
    items: selectedRoom ? getRoomEditorItemsForGroup(order, selectedRoom.key) : [createRoomEditorItem(0)],
  });
}

function buildOrderItemsPayload(items = []) {
  return items.map((item, index) => ({
    ...(item.itemId ? { itemId: item.itemId } : {}),
    itemNumber: String(item.itemNumber || index + 1).trim() || String(index + 1),
    productNumber: String(item.productNumber || '').trim(),
    room: String(item.room || '').trim(),
    roomNumber: String(item.roomNumber || '').trim(),
    name: String(item.name || '').trim(),
    quantity: Number(item.quantity) || 1,
    material: String(item.material || '').trim(),
    deliveryDate: String(item.deliveryDate || '').trim(),
    packageName: getPackageSummary(item.packageItems || []) || String(item.packageName || '').trim(),
    packageItems: normalizePackageItems(item.packageItems, item.packageName),
    photoLink: String(item.photoLink || '').trim(),
    notes: String(item.notes || '').trim(),
  }));
}

function createEmptyCustomerDraft(name = '') {
  return {
    customerId: '',
    fullName: String(name || '').trim(),
    phone: '',
    telegram: '',
    email: '',
    address: '',
    notes: '',
  };
}

function mapCustomerToDraft(customer) {
  return {
    customerId: customer?._id || '',
    fullName: customer?.fullName || '',
    phone: customer?.phone || '',
    telegram: customer?.telegram || '',
    email: customer?.email || '',
    address: customer?.address || '',
    notes: customer?.notes || '',
  };
}

function getCustomerApiMessage({ status = 0, message = '', fallback = 'Не удалось выполнить операцию с карточкой заказчика.' } = {}) {
  const normalizedMessage = String(message || '').trim();
  const loweredMessage = normalizedMessage.toLowerCase();

  if (
    status === 404
    || /cannot\s+(get|post|put|delete)/i.test(normalizedMessage)
    || loweredMessage === 'not found'
    || loweredMessage === 'http 404'
  ) {
    return 'API карточек заказчиков (`/api/customers`) не найден на сервере. Вероятно, тестовая ВМ запущена на старой версии backend. Обновите и перезапустите сервер.';
  }
  if (status === 405) {
    return 'Сервер не поддерживает этот метод для API карточек заказчиков. Вероятно, backend на тестовой ВМ не обновлён.';
  }
  if (status === 401) {
    return 'Сессия истекла или вход не выполнен. Войдите снова и повторите действие с карточкой заказчика.';
  }
  if (status === 403) {
    return 'Недостаточно прав для работы с карточками заказчиков. Требуется роль менеджера или администратора.';
  }
  if (status === 503) {
    return normalizedMessage || 'Сервис карточек заказчиков временно недоступен на сервере.';
  }
  if (/^<!doctype html|^<html[\s>]/i.test(normalizedMessage)) {
    return 'Сервер вернул HTML вместо ответа API карточек заказчиков. Проверьте proxy и backend на тестовой ВМ.';
  }

  return normalizedMessage || fallback;
}

function createEmptyOrderForm() {
  const today = new Date().toISOString().split('T')[0];
  return {
    orderNumber: '',
    customer: '',
    customerId: '',
    orderDate: today,
    startDate: '',
    endDate: '',
    items: [],
  };
}

function mapOrderToForm(order) {
  const items = Array.isArray(order?.items) && order.items.length > 0
    ? order.items.map((item, index) => ({
        itemId: item.itemId || '',
        clientKey: item.itemId || `edit-item-${index}`,
        itemNumber: item.itemNumber || String(index + 1),
        productNumber: item.productNumber || '',
        room: item.room || '',
        roomNumber: item.roomNumber || '',
        name: item.name || '',
        quantity: item.quantity || 1,
        material: item.material || '',
        deliveryDate: item.deliveryDate || '',
        packageName: item.packageName || '',
        packageItems: normalizePackageItems(item.packageItems, item.packageName),
        photoLink: item.photoLink || '',
        notes: item.notes || '',
      }))
    : [];

  return {
    orderNumber: order?.orderNumber || '',
    customer: order?.customer || '',
    customerId: order?.customerId || '',
    orderDate: order?.orderDate || '',
    startDate: order?.startDate || '',
    endDate: order?.endDate || '',
    items,
  };
}

function validateOrderForm(form) {
  const errors = {
    orderNumber: '',
    orderDate: '',
    endDate: '',
    items: [],
  };

  if (!String(form.orderNumber || '').trim()) {
    errors.orderNumber = 'Укажите номер заказа.';
  }
  if (!String(form.orderDate || '').trim()) {
    errors.orderDate = 'Укажите дату заказа.';
  }
  if (form.startDate && form.endDate && new Date(form.endDate) < new Date(form.startDate)) {
    errors.endDate = 'Дата окончания не может быть раньше даты начала.';
  }
  return errors;
}

function hasOrderFormErrors(formErrors) {
  if (formErrors.orderNumber || formErrors.orderDate || formErrors.endDate) return true;
  return false;
}

function getOrderIdentity(row) {
  return row.order?._id || row.order?.orderNumber || row.key;
}

function OrdersWorkspace() {
  const authRole = getAppAuthRole();
  const isAdmin = canAccessRole('admin', authRole);
  const canManageCustomers = canAccessRole('manager', authRole);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customerError, setCustomerError] = useState('');
  const [customerLoadError, setCustomerLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roomFilter, setRoomFilter] = useState('all');
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');
  const [downloadingKey, setDownloadingKey] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState('');
  const [orderForm, setOrderForm] = useState(createEmptyOrderForm);
  const [savingOrder, setSavingOrder] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [inlineDrafts, setInlineDrafts] = useState({});
  const [inlineSavingKey, setInlineSavingKey] = useState('');
  const [manualStageSaving, setManualStageSaving] = useState(false);
  const [selectedStageCellKeys, setSelectedStageCellKeys] = useState([]);
  const [manualStageToolbarPosition, setManualStageToolbarPosition] = useState(null);
  const [manualDateDraft, setManualDateDraft] = useState('');
  const [manualOrderDateDraft, setManualOrderDateDraft] = useState({ startDate: '', endDate: '' });
  const [qrPreview, setQrPreview] = useState(null);
  const [orderPreview, setOrderPreview] = useState(null);
  const [orderActionsOrder, setOrderActionsOrder] = useState(null);
  const [hoveredOrderId, setHoveredOrderId] = useState('');
  const [orderStageLegendConfig, setOrderStageLegendConfig] = useState(() => buildOrderStageLegendConfig());
  const [roomEditor, setRoomEditor] = useState(null);
  const [roomEditorSaving, setRoomEditorSaving] = useState(false);
  const [packageEditor, setPackageEditor] = useState(null);
  const [packageEditorSaving, setPackageEditorSaving] = useState(false);
  const [attachmentUploadingTargetKey, setAttachmentUploadingTargetKey] = useState('');
  const [attachmentDeletingKey, setAttachmentDeletingKey] = useState('');
  const [attachmentOpeningKey, setAttachmentOpeningKey] = useState('');
  const [attachmentsDialog, setAttachmentsDialog] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [confirmAttachmentDelete, setConfirmAttachmentDelete] = useState(null);
  const [confirmAttachmentOverwrite, setConfirmAttachmentOverwrite] = useState(null);
  const [attachmentLinkDraft, setAttachmentLinkDraft] = useState({ name: '', url: '' });
  const [customerEditor, setCustomerEditor] = useState(null);
  const [customerDraft, setCustomerDraft] = useState(createEmptyCustomerDraft);
  const [customerSaving, setCustomerSaving] = useState(false);
  const headerScrollRef = useRef(null);
  const bodyScrollRef = useRef(null);
  const manualStageToolbarRef = useRef(null);
  const manualDatePickerOpenRef = useRef(false);
  const manualDateSelectionSyncRef = useRef('');
  const attachmentInputRefs = useRef({});
  const syncingScrollRef = useRef(false);

  const fetchOrders = useCallback(async ({ showLoader = false } = {}) => {
    if (showLoader) {
      setLoading(true);
    }
    setError('');
    try {
      const res = await apiFetch('/api/orders');
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось загрузить заказы.');
      }
      setOrders(Array.isArray(data) ? data : []);
      setLastRefreshedAt(new Date().toISOString());
    } catch (fetchError) {
      setError(fetchError.message || 'Не удалось загрузить заказы.');
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
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

  const fetchCustomers = useCallback(async () => {
    if (!canManageCustomers) {
      setCustomers([]);
      setCustomerLoadError('');
      return;
    }
    try {
      const res = await apiFetch('/api/customers');
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        setCustomers([]);
        setCustomerLoadError(getCustomerApiMessage({
          status: res.status,
          message: data?.details || data?.message || '',
          fallback: 'Не удалось загрузить список заказчиков.',
        }));
        return;
      }
      setCustomers(Array.isArray(data) ? data : []);
      setCustomerLoadError('');
    } catch (fetchError) {
      setCustomers([]);
      setCustomerLoadError(getCustomerApiMessage({
        message: fetchError?.message || '',
        fallback: 'Не удалось загрузить список заказчиков. Проверьте соединение с сервером.',
      }));
    }
  }, [canManageCustomers]);

  useEffect(() => {
    fetchOrders({ showLoader: true });
    fetchOrderStageLegendConfig();
    fetchCustomers();
  }, [fetchCustomers, fetchOrderStageLegendConfig, fetchOrders]);

  useEffect(() => {
    return () => {
      if (attachmentPreview?.url) {
        window.URL.revokeObjectURL(attachmentPreview.url);
      }
    };
  }, [attachmentPreview]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (showForm) return;
      if (Object.keys(inlineDrafts).length > 0) return;
      if (inlineSavingKey) return;
      if (selectedStageCellKeys.length > 0) return;
      if (manualStageSaving) return;
      fetchOrders();
      fetchOrderStageLegendConfig();
    };

    const intervalId = window.setInterval(refresh, 2000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fetchOrderStageLegendConfig, fetchOrders, inlineDrafts, inlineSavingKey, manualStageSaving, selectedStageCellKeys.length, showForm]);

  const stageLegend = useMemo(() => orderStageLegendConfig.stages || [], [orderStageLegendConfig]);
  const primaryHeaderLabels = useMemo(() => orderStageLegendConfig.primaryHeaders || DEFAULT_ORDER_PRIMARY_HEADERS, [orderStageLegendConfig]);
  const secondaryHeaderSchema = useMemo(() => orderStageLegendConfig.secondaryHeaders || [], [orderStageLegendConfig]);
  const manualStageTextColorMap = useMemo(
    () => buildManualStageTextColorMap(secondaryHeaderSchema),
    [secondaryHeaderSchema],
  );
  const columnStageMeta = useMemo(() => {
    const createColumnMeta = (columnIndex) => {
      const legendKey = getStageLegendKeyForPrimaryColumn(columnIndex, secondaryHeaderSchema);
      return {
        legendKey,
        textHex: getStageTextHex(legendKey, secondaryHeaderSchema),
      };
    };

    return {
      carpenter: createColumnMeta(ORDER_CARPENTER_COLUMN_INDEX),
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
      const hex = item.legendKey ? (legendColorMap[item.legendKey] || '#FFFFFF') : '';
      const span = Number(item.colSpan) || 1;
      const cellStartIndex = startIndex;
      const cellEndIndex = cellStartIndex + span - 1;
      startIndex += span;
      return {
        ...item,
        hex,
        textColor: item.textHex || '#000000',
        startIndex: cellStartIndex,
        endIndex: cellEndIndex,
      };
    });
  }, [legendColorMap, secondaryHeaderSchema]);
  const roomEditorOrderOptions = useMemo(
    () => orders.map((order) => ({ value: order._id || '', label: getOrderLabel(order) })),
    [orders],
  );
  const selectedRoomEditorOrder = useMemo(
    () => orders.find((order) => order._id === roomEditor?.orderId) || null,
    [orders, roomEditor],
  );
  const roomEditorRoomOptions = useMemo(
    () => (selectedRoomEditorOrder ? getOrderRoomOptions(selectedRoomEditorOrder) : []),
    [selectedRoomEditorOrder],
  );

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sortedOrders = [...orders].sort(compareOrderNumbersAsc);
    return sortedOrders.flatMap(order => {
      const items = Array.isArray(order.items) && order.items.length > 0 ? order.items : [];
      const sourceRows = items.length > 0 ? items : [{
        itemId: '',
        itemNumber: '',
        productNumber: '',
        room: '',
        roomNumber: '',
        quantity: '',
        name: '',
        deliveryDate: '',
        material: '',
        packageName: '',
        packageItems: [],
        photoLink: '',
        notes: '',
        comments: [],
        manualStageMarks: {},
        manualStageClears: {},
        workerAssignments: {},
        stages: [],
        overallStatus: order?.overallStatus || 'pending',
        __placeholder: true,
      }];

      return sourceRows
        .map(item => {
          const isPlaceholder = item?.__placeholder === true;
          const overallStatus = item?.overallStatus || order?.overallStatus || 'pending';
          const carpenterActiveStage = getItemActiveRoleStage(item, 'carpenter');
          const carpenterAssignment = getItemWorkerAssignment(item, 'carpenter');
          const activeStage = getItemActiveStage(item);
          const assignedStage = getItemAssignedStage(item);
          const haystack = [
            order.orderNumber,
            order.customer,
            item.itemNumber,
            item.productNumber,
            item.room,
            item.roomNumber,
            item.name,
            item.material,
            item.packageName,
            item.notes,
            carpenterAssignment?.employeeName,
            ...(item.comments || []).map(comment => comment.text),
          ].join(' ').toLowerCase();

          if (statusFilter !== 'all' && overallStatus !== statusFilter) return null;
          if (roomFilter !== 'all' && String(item.room || '').trim() !== roomFilter) return null;
          if (query && !haystack.includes(query)) return null;

          return {
            key: `${order._id}:${item.itemId || '__empty__'}`,
            orderId: order._id || '',
            order,
            item,
            overallStatus,
            activeStage,
            assignedStage,
            carpenterActiveStage,
            carpenterAssignment,
            isPlaceholder,
          };
        })
        .filter(Boolean);
    });
  }, [orders, roomFilter, search, statusFilter]);

  const rowsByKey = useMemo(() => rows.reduce((acc, row) => {
    acc[row.key] = row;
    return acc;
  }, {}), [rows]);
  const selectedStageSelections = useMemo(() => selectedStageCellKeys
    .map((cellKey) => {
      const [rowKey, columnKey] = String(cellKey || '').split('::');
      if (!rowKey || !columnKey || !isManualStageSelectableColumn(columnKey)) return null;
      const row = rowsByKey[rowKey];
      if (!row?.item?.itemId || !row?.orderId) return null;
      const autoLegendKey = getLegendKeyForManualStageColumn(columnKey, secondaryHeaderSchema);
      const itemManufacturingMeta = getItemManufacturingMeta(row.item);
      const orderManufacturingMeta = getOrderManufacturingMeta(row.order);
      return {
        cellKey,
        rowKey,
        columnKey,
        autoLegendKey,
        orderId: row.orderId,
        itemId: row.item.itemId,
        itemName: row.item.name || '',
        orderNumber: row.order.orderNumber || '',
        currentItemStartDate: itemManufacturingMeta.startDate || '',
        currentItemEndDate: itemManufacturingMeta.endDate || '',
        currentOrderStartDate: orderManufacturingMeta.startDate || '',
        currentOrderEndDate: orderManufacturingMeta.endDate || '',
      };
    })
    .filter(Boolean), [rowsByKey, secondaryHeaderSchema, selectedStageCellKeys]);
  const selectedStageSelectionsWithLegend = useMemo(
    () => selectedStageSelections.filter((selection) => selection.autoLegendKey),
    [selectedStageSelections],
  );
  const selectedStageSelectionSkippedCount = selectedStageSelections.length - selectedStageSelectionsWithLegend.length;
  const selectedStageSingleColumnKey = useMemo(() => {
    const uniqueColumnKeys = Array.from(new Set(selectedStageSelections.map((selection) => selection.columnKey)));
    return uniqueColumnKeys.length === 1 ? uniqueColumnKeys[0] : '';
  }, [selectedStageSelections]);
  const selectedStageCellKeysSignature = useMemo(
    () => selectedStageCellKeys.join('|'),
    [selectedStageCellKeys],
  );
  const canEditSelectedDates = selectedStageSingleColumnKey === 'itemStartDate'
    || selectedStageSingleColumnKey === 'itemEndDate'
    || selectedStageSingleColumnKey === 'duration';

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
  const orderDraftKeys = useMemo(() => {
    return Object.keys(inlineDrafts).reduce((acc, rowKey) => {
      const row = rowsByKey[rowKey];
      if (!row) return acc;
      const orderId = getOrderIdentity(row);
      if (!acc[orderId]) {
        acc[orderId] = [];
      }
      acc[orderId].push(rowKey);
      return acc;
    }, {});
  }, [inlineDrafts, rowsByKey]);

  const availableRooms = useMemo(() => {
    return Array.from(new Set(
      orders.flatMap(order => (order.items || []).map(item => String(item.room || '').trim()).filter(Boolean))
    )).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [orders]);
  const currentAttachmentDialogItem = useMemo(() => {
    const order = orders.find((currentOrder) => currentOrder._id === attachmentsDialog?.orderId) || null;
    if (!order) return null;
    return (order.items || []).find((currentItem) => currentItem.itemId === attachmentsDialog?.itemId) || null;
  }, [attachmentsDialog?.itemId, attachmentsDialog?.orderId, orders]);
  const orderPreviewMeta = useMemo(
    () => (orderPreview ? getOrderManufacturingMeta(orderPreview) : null),
    [orderPreview],
  );
  const customersById = useMemo(() => customers.reduce((acc, customer) => {
    acc[customer._id] = customer;
    return acc;
  }, {}), [customers]);
  const linkedOrderPreviewCustomer = orderPreview?.customerId ? (customersById[orderPreview.customerId] || null) : null;
  const currentAttachmentDialogAttachments = useMemo(
    () => getItemAttachments(currentAttachmentDialogItem, attachmentsDialog?.scope),
    [attachmentsDialog?.scope, currentAttachmentDialogItem],
  );

  const clearSelectedStageCells = useCallback(() => {
    setSelectedStageCellKeys([]);
  }, []);

  useEffect(() => {
    const nextSelectionSyncKey = canEditSelectedDates
      ? `${selectedStageSingleColumnKey}::${selectedStageCellKeysSignature}`
      : '';
    if (nextSelectionSyncKey === manualDateSelectionSyncRef.current) {
      return;
    }
    manualDateSelectionSyncRef.current = nextSelectionSyncKey;

    if (!canEditSelectedDates || selectedStageCellKeys.length === 0 || selectedStageSelections.length === 0) {
      setManualDateDraft('');
      setManualOrderDateDraft({ startDate: '', endDate: '' });
      return;
    }

    const firstSelection = selectedStageSelections[0];
    if (selectedStageSingleColumnKey === 'duration') {
      setManualOrderDateDraft({
        startDate: firstSelection?.currentOrderStartDate || '',
        endDate: firstSelection?.currentOrderEndDate || '',
      });
      setManualDateDraft('');
      return;
    }

    setManualDateDraft(
      selectedStageSingleColumnKey === 'itemStartDate'
        ? (firstSelection?.currentItemStartDate || '')
        : (firstSelection?.currentItemEndDate || '')
    );
    setManualOrderDateDraft({ startDate: '', endDate: '' });
  }, [canEditSelectedDates, selectedStageCellKeys.length, selectedStageCellKeysSignature, selectedStageSelections, selectedStageSingleColumnKey]);

  useEffect(() => {
    setSelectedStageCellKeys((current) => current.filter((cellKey) => {
      const [rowKey, columnKey] = String(cellKey || '').split('::');
      return Boolean(rowKey && columnKey && isManualStageSelectableColumn(columnKey) && rowsByKey[rowKey]);
    }));
  }, [rowsByKey]);

  useEffect(() => {
    if (!isAdmin || selectedStageSelections.length === 0) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (manualDatePickerOpenRef.current) return;
      if (target.closest('.manual-stage-toolbar-floating')) return;
      if (target.closest('[data-manual-stage-cell-key]')) return;
      clearSelectedStageCells();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [clearSelectedStageCells, isAdmin, selectedStageSelections.length]);

  useLayoutEffect(() => {
    if (!isAdmin || selectedStageSelections.length === 0) {
      setManualStageToolbarPosition(null);
      return undefined;
    }

    const updateToolbarPosition = () => {
      const selectedKeys = new Set(selectedStageCellKeys);
      const nodes = Array.from(document.querySelectorAll('[data-manual-stage-cell-key]'))
        .filter((node) => selectedKeys.has(node.getAttribute('data-manual-stage-cell-key') || ''));

      if (nodes.length === 0) {
        setManualStageToolbarPosition(null);
        return;
      }

      const rects = nodes.map((node) => node.getBoundingClientRect());
      const bounds = rects.reduce((acc, rect) => ({
        left: Math.min(acc.left, rect.left),
        top: Math.min(acc.top, rect.top),
        right: Math.max(acc.right, rect.right),
        bottom: Math.max(acc.bottom, rect.bottom),
      }), {
        left: rects[0].left,
        top: rects[0].top,
        right: rects[0].right,
        bottom: rects[0].bottom,
      });

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 12;
      const toolbarRect = manualStageToolbarRef.current?.getBoundingClientRect();
      const fallbackToolbarWidth = Math.min(420, Math.max(320, viewportWidth - (margin * 2)));
      const toolbarWidth = toolbarRect?.width || fallbackToolbarWidth;
      const toolbarHeight = toolbarRect?.height || 56;
      const preferredLeft = bounds.left + ((bounds.right - bounds.left) / 2) - (toolbarWidth / 2);
      const clampedLeft = Math.min(
        Math.max(margin, preferredLeft),
        Math.max(margin, viewportWidth - toolbarWidth - margin),
      );
      const fitsBelow = bounds.bottom + margin + toolbarHeight <= viewportHeight - margin;
      const top = fitsBelow
        ? bounds.bottom + margin
        : Math.max(margin, bounds.top - toolbarHeight - margin);

      setManualStageToolbarPosition({
        left: clampedLeft,
        top,
      });
    };

    updateToolbarPosition();

    const bodyNode = bodyScrollRef.current;
    window.addEventListener('resize', updateToolbarPosition);
    window.addEventListener('scroll', updateToolbarPosition, true);
    bodyNode?.addEventListener('scroll', updateToolbarPosition);

    return () => {
      window.removeEventListener('resize', updateToolbarPosition);
      window.removeEventListener('scroll', updateToolbarPosition, true);
      bodyNode?.removeEventListener('scroll', updateToolbarPosition);
    };
  }, [isAdmin, selectedStageSelections.length, selectedStageCellKeys]);

  const syncHorizontalScroll = useCallback((source, target) => {
    if (!source || !target) return;
    if (syncingScrollRef.current) return;
    syncingScrollRef.current = true;
    target.scrollLeft = source.scrollLeft;
    window.requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  }, []);

  const handleManualStageCellClick = useCallback((event, rowKey, columnKey) => {
    if (!isAdmin || manualStageSaving) return;
    if (!isManualStageSelectableColumn(columnKey)) return;
    if (event.target.closest('a, button, input, textarea, select, summary, details, label')) return;

    const cellKey = buildManualStageCellKey(rowKey, columnKey);
    setSelectedStageCellKeys((current) => {
      if (event.ctrlKey || event.metaKey) {
        return current.includes(cellKey)
          ? current.filter((value) => value !== cellKey)
          : [...current, cellKey];
      }
      return [cellKey];
    });
  }, [isAdmin, manualStageSaving]);

  const applyManualStageToSelection = useCallback(async ({ clear = false } = {}) => {
    if (!isAdmin || manualStageSaving || selectedStageSelections.length === 0) return;

    setManualStageSaving(true);
    setError('');
    try {
      const selections = selectedStageSelections.map((selection) => ({
        orderId: selection.orderId,
        itemId: selection.itemId,
        columnKey: selection.columnKey,
        ...(!clear && selection.autoLegendKey ? { legendKey: selection.autoLegendKey } : {}),
      }));
      const payload = {
        legendKey: clear ? '' : undefined,
        selections,
      };
      let res = await apiFetch('/api/orders/manual-stage-marks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Some test/proxy environments do not expose PATCH consistently.
      if (res.status === 404 || res.status === 405) {
        res = await apiFetch('/api/orders/manual-stage-marks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось обновить ручные этапные отметки.'));
        return;
      }
      clearSelectedStageCells();
      await fetchOrders();
    } finally {
      setManualStageSaving(false);
    }
  }, [clearSelectedStageCells, fetchOrders, isAdmin, manualStageSaving, selectedStageSelections]);

  const applyManualDateThroughOrderUpdate = useCallback(async (payload) => {
    const ordersById = new Map(
      (Array.isArray(orders) ? orders : []).map((order) => [String(order?._id || '').trim(), order]),
    );
    const updatesByOrderId = new Map();

    for (const selection of payload.selections || []) {
      const orderId = String(selection?.orderId || '').trim();
      if (!orderId) continue;

      const sourceOrder = ordersById.get(orderId);
      if (!sourceOrder) {
        return { ok: false, message: 'Не удалось найти заказ для обновления даты.' };
      }

      if (!updatesByOrderId.has(orderId)) {
        updatesByOrderId.set(orderId, {
          manualDateOverrides: {
            startDate: String(sourceOrder?.manualDateOverrides?.startDate || '').trim(),
            endDate: String(sourceOrder?.manualDateOverrides?.endDate || '').trim(),
          },
          items: (sourceOrder.items || []).map((item) => ({
            ...item,
            manualStageMarks: { ...(item?.manualStageMarks || {}) },
            manualStageClears: { ...(item?.manualStageClears || {}) },
          })),
        });
      }

      const orderUpdate = updatesByOrderId.get(orderId);
      if (payload.columnKey === 'duration') {
        orderUpdate.manualDateOverrides = {
          startDate: String(payload.startDate || '').trim(),
          endDate: String(payload.endDate || '').trim(),
        };
        continue;
      }
      orderUpdate.manualDateOverrides = { startDate: '', endDate: '' };

      const itemId = String(selection?.itemId || '').trim();
      const itemIndex = orderUpdate.items.findIndex((item) => String(item?.itemId || '').trim() === itemId);
      if (itemIndex === -1) {
        return { ok: false, message: 'Не удалось найти изделие для обновления даты.' };
      }

      const item = orderUpdate.items[itemIndex];
      const columnKey = String(selection?.columnKey || payload.columnKey || '').trim();
      const currentMark = item.manualStageMarks?.[columnKey] || {};
      item.manualStageMarks = {
        ...(item.manualStageMarks || {}),
        [columnKey]: {
          ...currentMark,
          legendKey: String(selection?.legendKey || currentMark.legendKey || '').trim(),
          updatedAt: new Date(`${payload.date}T00:00:00.000Z`).toISOString(),
          updatedBy: 'admin',
        },
      };
      if (item.manualStageClears?.[columnKey]) {
        delete item.manualStageClears[columnKey];
      }
    }

    for (const [orderId, update] of updatesByOrderId.entries()) {
      const res = await apiFetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: update.items,
          manualDateOverrides: update.manualDateOverrides,
        }),
      });

      if (!res.ok) {
        return {
          ok: false,
          message: await getErrorMessage(res, 'Не удалось обновить даты через резервное сохранение заказа.'),
        };
      }
    }

    return { ok: true };
  }, [orders]);

  const applyManualDateToSelection = useCallback(async () => {
    if (!isAdmin || manualStageSaving || selectedStageSelections.length === 0 || !canEditSelectedDates) return;

    if (selectedStageSingleColumnKey === 'duration') {
      if (!manualOrderDateDraft.startDate && !manualOrderDateDraft.endDate) {
        setError('Укажите хотя бы одну дату для последнего столбца.');
        return;
      }
      if (
        manualOrderDateDraft.startDate
        && manualOrderDateDraft.endDate
        && manualOrderDateDraft.endDate < manualOrderDateDraft.startDate
      ) {
        setError('Дата окончания не может быть раньше даты начала.');
        return;
      }
    } else if (!manualDateDraft) {
      setError('Укажите дату для выбранных ячеек.');
      return;
    }

    setManualStageSaving(true);
    setError('');
    try {
      const payload = {
        columnKey: selectedStageSingleColumnKey,
        selections: selectedStageSelections.map((selection) => ({
          orderId: selection.orderId,
          itemId: selection.itemId,
          columnKey: selection.columnKey,
          legendKey: selection.autoLegendKey,
        })),
      };
      if (selectedStageSingleColumnKey === 'duration') {
        payload.startDate = manualOrderDateDraft.startDate || '';
        payload.endDate = manualOrderDateDraft.endDate || '';
      } else {
        payload.date = manualDateDraft;
      }

      let res = await apiFetch('/api/orders/manual-date-overrides', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 404 || res.status === 405) {
        res = await apiFetch('/api/orders/manual-date-overrides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const shouldTryFallback = ![400, 401, 403, 422].includes(res.status);
        const endpointErrorMessage = await getErrorMessage(res, 'Не удалось обновить даты.');
        if (!shouldTryFallback) {
          setError(endpointErrorMessage);
          return;
        }

        const fallbackResult = await applyManualDateThroughOrderUpdate(payload);
        if (!fallbackResult.ok) {
          setError(fallbackResult.message || endpointErrorMessage);
          return;
        }
      }

      clearSelectedStageCells();
      await fetchOrders();
    } finally {
      setManualStageSaving(false);
    }
  }, [
    canEditSelectedDates,
    applyManualDateThroughOrderUpdate,
    clearSelectedStageCells,
    fetchOrders,
    isAdmin,
    manualDateDraft,
    manualOrderDateDraft.endDate,
    manualOrderDateDraft.startDate,
    manualStageSaving,
    selectedStageSelections,
    selectedStageSingleColumnKey,
  ]);

  const getManualStageCellProps = useCallback((rowKey, item, columnKey, baseClassName, baseStyle, { disabled = false } = {}) => {
    const manualMark = getItemManualStageMark(item, columnKey);
    const manualClear = getItemManualStageClear(item, columnKey);
    const isSelected = selectedStageCellKeys.includes(buildManualStageCellKey(rowKey, columnKey));
    const className = cn(
      baseClassName,
      manualMark ? 'manual-stage-cell-marked' : '',
      isAdmin && !disabled ? 'manual-stage-cell-selectable' : '',
      isSelected ? 'manual-stage-cell-selected' : '',
    );
    const style = manualClear
      ? undefined
      : manualMark
      ? {
          ...(baseStyle || {}),
          ...(manualMark.legendKey
            ? {
                background: legendColorMap[manualMark.legendKey] || '#FFFFFF',
                color: manualStageTextColorMap[manualMark.legendKey] || '#000000',
              }
            : {}),
        }
      : baseStyle;
    const title = manualMark
      ? `${manualMark.legendKey || 'Ручная дата'}${manualMark.updatedAt ? ` • ${new Date(manualMark.updatedAt).toLocaleString()}` : ''}`
      : (manualClear
          ? `Сброшено${manualClear.updatedAt ? ` • ${new Date(manualClear.updatedAt).toLocaleString()}` : ''}`
          : undefined);

    return {
      className,
      style,
      onClick: isAdmin && !disabled ? (event) => handleManualStageCellClick(event, rowKey, columnKey) : undefined,
      'data-manual-stage-cell-key': buildManualStageCellKey(rowKey, columnKey),
      title,
    };
  }, [handleManualStageCellClick, isAdmin, legendColorMap, manualStageTextColorMap, selectedStageCellKeys]);

  const bindManualDateInputProps = useCallback((valueSetter) => ({
    onFocus: () => {
      manualDatePickerOpenRef.current = true;
    },
    onBlur: () => {
      window.setTimeout(() => {
        manualDatePickerOpenRef.current = false;
      }, 150);
    },
    onChange: (event) => {
      manualDatePickerOpenRef.current = false;
      valueSetter(event.target.value);
    },
  }), []);

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
      <col className="col-photo" />
      <col className="col-paint" />
      <col className="col-item-start-date" />
      <col className="col-item-end-date" />
      <col className="col-item-duration" />
      <col className="col-duration" />
    </colgroup>
  ), []);

  const formErrors = useMemo(() => validateOrderForm(orderForm), [orderForm]);
  const isFormValid = useMemo(() => !hasOrderFormErrors(formErrors), [formErrors]);
  const handleDownloadQr = async (orderId, itemId, fileNameBase) => {
    const downloadKey = `${orderId}:${itemId}`;
    setDownloadingKey(downloadKey);
    try {
      const res = await apiFetch(`/api/orders/${orderId}/items/${itemId}/qrcode`);
      if (!res.ok) {
        throw new Error('Не удалось скачать QR-код.');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileNameBase || 'item'}-qr.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      window.alert(downloadError.message || 'Не удалось скачать QR-код.');
    } finally {
      setDownloadingKey('');
    }
  };

  const openQrPreview = (order, item) => {
    setQrPreview({
      orderId: order._id,
      itemId: item.itemId,
      orderNumber: order.orderNumber || '',
      itemNumber: item.itemNumber || '',
      itemName: item.name || '',
      fileNameBase: `${order.orderNumber || 'order'}-${item.itemNumber || 'item'}`,
    });
  };

  const handlePrintQr = () => {
    if (!qrPreview?.orderId || !qrPreview?.itemId) return;
    const qrUrl = `${window.location.origin}/api/orders/${qrPreview.orderId}/items/${qrPreview.itemId}/qrcode`;
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900');
    if (!printWindow) return;
    const title = `QR ${qrPreview.orderNumber || ''} ${qrPreview.itemNumber ? `- ${qrPreview.itemNumber}` : ''}`.trim();
    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 24px; text-align: center; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { margin: 0 0 18px; color: #444; }
      img { width: 320px; height: 320px; display: block; margin: 0 auto; }
    </style>
  </head>
  <body>
    <h1>${title || 'QR-код'}</h1>
    <p>${qrPreview.itemName || ''}</p>
    <img src="${qrUrl}" alt="QR code" onload="window.print(); setTimeout(() => window.close(), 150);" />
  </body>
</html>`);
    printWindow.document.close();
  };

  const openCreateForm = () => {
    setError('');
    setEditingOrderId('');
    setOrderForm(createEmptyOrderForm());
    setShowForm(true);
  };

  const openCreateRoomEditor = (order = null) => {
    setError('');
    setRoomEditor(createRoomEditorState({
      mode: 'room',
      orderId: order?._id || '',
    }));
  };

  const openCreateItemEditor = (order = null) => {
    const initialOrderId = order?._id || '';
    const initialRoomOption = order ? (getOrderRoomOptions(order)[0] || null) : null;
    setError('');
    setRoomEditor(createRoomEditorState({
      mode: 'item',
      orderId: initialOrderId,
      sourceGroupKey: initialRoomOption?.key || '',
      room: initialRoomOption?.room || '',
      roomNumber: initialRoomOption?.roomNumber || '',
    }));
  };

  const openEditRoomEditor = (order) => {
    if (!order?._id) return;
    setError('');
    setRoomEditor(createEditRoomEditorState(order));
  };

  const openEditForm = (order) => {
    setError('');
    setEditingOrderId(order._id);
    setOrderForm(mapOrderToForm(order));
    setShowForm(true);
  };

  const resetFormState = () => {
    setShowForm(false);
    setEditingOrderId('');
    setOrderForm(createEmptyOrderForm());
  };

  const setAttachmentPreviewState = useCallback((nextPreview) => {
    setAttachmentPreview((current) => {
      if (current?.url) {
        window.URL.revokeObjectURL(current.url);
      }
      return nextPreview;
    });
  }, []);

  const closeAttachmentPreview = useCallback(() => {
    setAttachmentPreviewState(null);
  }, [setAttachmentPreviewState]);

  const openAttachmentsDialog = useCallback((order, item, scope = 'order') => {
    if (!order?._id || !item?.itemId) return;
    const attachmentScope = String(scope || 'order').trim().toLowerCase();
    setAttachmentsDialog({
      orderId: order._id,
      itemId: item.itemId,
      orderNumber: order.orderNumber || '',
      customer: order.customer || '',
      itemNumber: item.itemNumber || '',
      itemName: item.name || '',
      scope: attachmentScope,
    });
    setAttachmentLinkDraft({ name: '', url: '' });
  }, []);

  const openPackageEditor = useCallback((order, item) => {
    if (!order?._id || !item?.itemId) return;
    setError('');
    setPackageEditor({
      orderId: order._id,
      itemId: item.itemId,
      orderNumber: order.orderNumber || '',
      customer: order.customer || '',
      itemName: item.name || '',
      itemNumber: item.itemNumber || '',
      newItemName: '',
      items: normalizePackageItems(item.packageItems, item.packageName),
    });
  }, []);

  useEscapeKey(() => {
    if (selectedStageCellKeys.length > 0 && !manualStageSaving) {
      clearSelectedStageCells();
      return;
    }
    if (confirmDelete && !deletingOrder) {
      setConfirmDelete(null);
      return;
    }
    if (roomEditor && !roomEditorSaving) {
      setRoomEditor(null);
      return;
    }
    if (packageEditor && !packageEditorSaving) {
      setPackageEditor(null);
      return;
    }
    if (confirmAttachmentDelete && !attachmentDeletingKey) {
      setConfirmAttachmentDelete(null);
      return;
    }
    if (confirmAttachmentOverwrite && !attachmentUploadingTargetKey) {
      setConfirmAttachmentOverwrite(null);
      return;
    }
    if (attachmentPreview) {
      closeAttachmentPreview();
      return;
    }
    if (attachmentsDialog) {
      setAttachmentsDialog(null);
      return;
    }
    if (customerEditor && !customerSaving) {
      setCustomerEditor(null);
      return;
    }
    if (orderPreview) {
      setOrderPreview(null);
      return;
    }
    if (orderActionsOrder) {
      setOrderActionsOrder(null);
      return;
    }
    if (qrPreview && !downloadingKey) {
      setQrPreview(null);
      return;
    }
    if (showForm && !savingOrder) {
      closeForm();
    }
  }, Boolean(selectedStageCellKeys.length > 0 || confirmDelete || roomEditor || packageEditor || confirmAttachmentDelete || confirmAttachmentOverwrite || attachmentPreview || attachmentsDialog || customerEditor || orderPreview || orderActionsOrder || qrPreview || showForm));

  const closeForm = () => {
    if (savingOrder) return;
    resetFormState();
  };

  const handleOrderFieldChange = (field) => (event) => {
    const value = event.target.value;
    setError('');
    setOrderForm(current => ({ ...current, [field]: value }));
  };

  const openCustomerEditor = useCallback((options = {}) => {
    const context = options.context || 'order-form';
    setCustomerError('');
    if (context === 'order-cell') {
      const order = options.order || null;
      if (!order?._id) return;
      const linkedCustomer = order.customerId ? (customersById[order.customerId] || null) : null;
      setCustomerDraft(linkedCustomer ? mapCustomerToDraft(linkedCustomer) : createEmptyCustomerDraft(order.customer || ''));
      setCustomerEditor({
        context,
        orderId: order._id,
        initialName: order.customer || '',
      });
      return;
    }

    const linkedCustomer = orderForm.customerId ? (customersById[orderForm.customerId] || null) : null;
    setCustomerDraft(linkedCustomer ? mapCustomerToDraft(linkedCustomer) : createEmptyCustomerDraft(orderForm.customer || ''));
    setCustomerEditor({
      context: 'order-form',
      orderId: editingOrderId || '',
      initialName: orderForm.customer || '',
    });
  }, [customersById, editingOrderId, orderForm.customer, orderForm.customerId]);

  const handleCustomerDraftFieldChange = useCallback((field) => (event) => {
    const value = event.target.value;
    setCustomerError('');
    setCustomerDraft((current) => ({ ...current, [field]: value }));
  }, []);

  const handleCustomerTemplateSelect = useCallback((event) => {
    const nextCustomerId = event.target.value;
    setCustomerError('');
    if (!nextCustomerId) {
      setCustomerDraft(createEmptyCustomerDraft(customerEditor?.initialName || ''));
      return;
    }
    const existingCustomer = customersById[nextCustomerId] || null;
    if (!existingCustomer) return;
    setCustomerDraft(mapCustomerToDraft(existingCustomer));
  }, [customerEditor?.initialName, customersById]);

  const applyCustomerToOrder = useCallback(async (orderId, customer) => {
    const res = await apiFetch(`/api/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: customer.fullName || '',
        customerId: customer._id || '',
      }),
    });
    if (!res.ok) {
      return await getErrorMessage(res, 'Не удалось привязать заказчика к заказу.');
    }
    return '';
  }, []);

  const saveCustomerFromEditor = useCallback(async () => {
    const payload = {
      fullName: String(customerDraft.fullName || '').trim(),
      phone: String(customerDraft.phone || '').trim(),
      telegram: String(customerDraft.telegram || '').trim(),
      email: String(customerDraft.email || '').trim(),
      address: String(customerDraft.address || '').trim(),
      notes: String(customerDraft.notes || '').trim(),
    };
    if (!payload.fullName) {
      setCustomerError('Укажите ФИО заказчика.');
      return;
    }

    setCustomerSaving(true);
    setCustomerError('');
    try {
      const customerId = String(customerDraft.customerId || '').trim();
      const res = await apiFetch(customerId ? `/api/customers/${customerId}` : '/api/customers', {
        method: customerId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        setCustomerError(getCustomerApiMessage({
          status: res.status,
          message: data?.details || data?.message || '',
          fallback: customerId ? 'Не удалось сохранить изменения в карточке заказчика.' : 'Не удалось создать карточку заказчика.',
        }));
        return;
      }

      const savedCustomer = data || { _id: customerId, ...payload };
      await fetchCustomers();

      if (customerEditor?.context === 'order-cell' && customerEditor?.orderId) {
        const orderLinkError = await applyCustomerToOrder(customerEditor.orderId, savedCustomer);
        if (orderLinkError) {
          setCustomerError(orderLinkError);
          return;
        }
        setOrderPreview((current) => (
          current && current._id === customerEditor.orderId
            ? { ...current, customer: savedCustomer.fullName || '', customerId: savedCustomer._id || '' }
            : current
        ));
        setOrderActionsOrder((current) => (
          current && current._id === customerEditor.orderId
            ? { ...current, customer: savedCustomer.fullName || '', customerId: savedCustomer._id || '' }
            : current
        ));
        await fetchOrders();
      } else {
        setOrderForm((current) => ({
          ...current,
          customer: savedCustomer.fullName || '',
          customerId: savedCustomer._id || '',
        }));
      }

      setCustomerEditor(null);
      setCustomerDraft(createEmptyCustomerDraft());
      setCustomerError('');
    } catch (saveError) {
      setCustomerError(getCustomerApiMessage({
        message: saveError?.message || '',
        fallback: 'Не удалось сохранить карточку заказчика. Проверьте соединение с сервером.',
      }));
    } finally {
      setCustomerSaving(false);
    }
  }, [applyCustomerToOrder, customerDraft, customerEditor, fetchCustomers, fetchOrders]);

  const handleSubmit = async () => {
    if (!isFormValid) {
      setError(formErrors.orderNumber || formErrors.orderDate || formErrors.endDate || 'Проверьте форму заказа.');
      return;
    }
    if (savingOrder) return;

    const preparedItems = buildOrderItemsPayload(orderForm.items || []);
    const firstItem = preparedItems[0] || null;
    const payload = {
      orderNumber: String(orderForm.orderNumber || '').trim(),
      customer: String(orderForm.customer || '').trim(),
      customerId: String(orderForm.customerId || '').trim(),
      orderDate: String(orderForm.orderDate || '').trim(),
      startDate: String(orderForm.startDate || '').trim(),
      endDate: String(orderForm.endDate || '').trim(),
      name: firstItem?.name || '',
      quantity: firstItem?.quantity || 1,
      material: firstItem?.material || '',
      notes: firstItem?.notes || '',
      items: preparedItems,
    };

    setSavingOrder(true);
    setError('');
    try {
      const res = await apiFetch(editingOrderId ? `/api/orders/${editingOrderId}` : '/api/orders', {
        method: editingOrderId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await getErrorMessage(res, editingOrderId ? 'Не удалось сохранить заказ.' : 'Не удалось создать заказ.'));
        return;
      }
      resetFormState();
      await fetchOrders();
    } finally {
      setSavingOrder(false);
    }
  };

  const handleRoomEditorFieldChange = (field) => (event) => {
    const value = event.target.value;
    setError('');
    setRoomEditor((current) => current ? { ...current, [field]: value } : current);
  };

  const handleRoomEditorOrderChange = (event) => {
    const nextOrderId = event.target.value;
    setError('');
    setRoomEditor((current) => {
      if (!current) return current;
      if (current.mode === 'edit') {
        const nextOrder = orders.find((order) => order._id === nextOrderId);
        return nextOrder ? createEditRoomEditorState(nextOrder) : createRoomEditorState({ mode: 'edit', orderId: nextOrderId });
      }
      if (current.mode !== 'item') {
        return { ...current, orderId: nextOrderId };
      }
      const nextOrder = orders.find((order) => order._id === nextOrderId);
      const nextRoomOption = nextOrder ? (getOrderRoomOptions(nextOrder)[0] || null) : null;
      return {
        ...current,
        orderId: nextOrderId,
        sourceGroupKey: nextRoomOption?.key || '',
        room: nextRoomOption?.room || '',
        roomNumber: nextRoomOption?.roomNumber || '',
      };
    });
  };

  const handleRoomEditorRoomSelectChange = (event) => {
    const nextGroupKey = event.target.value;
    setError('');
    setRoomEditor((current) => {
      if (!current) return current;
      const selectedRoom = roomEditorRoomOptions.find((option) => option.key === nextGroupKey) || null;
      return {
        ...current,
        sourceGroupKey: nextGroupKey,
        room: selectedRoom?.room || '',
        roomNumber: selectedRoom?.roomNumber || '',
        items: current.mode === 'edit'
          ? (selectedRoom && selectedRoomEditorOrder ? getRoomEditorItemsForGroup(selectedRoomEditorOrder, nextGroupKey) : [createRoomEditorItem(0)])
          : current.items,
      };
    });
  };

  const handleRoomEditorItemFieldChange = (index, field) => (event) => {
    const value = event.target.value;
    setError('');
    setRoomEditor((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item, itemIndex) => (
          itemIndex === index
            ? { ...item, [field]: value }
            : item
        )),
      };
    });
  };

  const handlePackageEditorDraftChange = (event) => {
    const value = event.target.value;
    setError('');
    setPackageEditor((current) => current ? { ...current, newItemName: value } : current);
  };

  const addPackageEditorItem = () => {
    const nextName = String(packageEditor?.newItemName || '').trim();
    if (!nextName) {
      setError('Укажите позицию комплектации.');
      return;
    }
    setError('');
    setPackageEditor((current) => current ? {
      ...current,
      newItemName: '',
      items: [
        ...(current.items || []),
        {
          id: createPackageItemId(),
          name: nextName,
          isCompleted: false,
          completedAt: null,
        },
      ],
    } : current);
  };

  const togglePackageEditorItem = (packageItemId) => {
    setError('');
    setPackageEditor((current) => current ? {
      ...current,
      items: (current.items || []).map((item) => (
        item.id === packageItemId
          ? {
              ...item,
              isCompleted: !item.isCompleted,
              completedAt: !item.isCompleted ? new Date().toISOString().split('T')[0] : null,
            }
          : item
      )),
    } : current);
  };

  const removePackageEditorItem = (packageItemId) => {
    setError('');
    setPackageEditor((current) => current ? {
      ...current,
      items: (current.items || []).filter((item) => item.id !== packageItemId),
    } : current);
  };

  const savePackageEditor = async () => {
    if (!packageEditor || packageEditorSaving) return;
    const order = orders.find((currentOrder) => currentOrder._id === packageEditor.orderId);
    const targetItem = (order?.items || []).find((item) => item.itemId === packageEditor.itemId) || null;
    if (!order || !targetItem) {
      setError('Изделие для сохранения комплектации не найдено.');
      return;
    }

    const nextPackageItems = normalizePackageItems(packageEditor.items);
    const payload = {
      orderNumber: order.orderNumber || '',
      customer: order.customer || '',
      orderDate: order.orderDate || '',
      items: buildOrderItemsPayload((order.items || []).map((item) => (
        item.itemId === packageEditor.itemId
          ? {
              ...item,
              packageItems: nextPackageItems,
              packageName: getPackageSummary(nextPackageItems),
            }
          : item
      ))),
    };

    setPackageEditorSaving(true);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${order._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось сохранить комплектацию изделия.'));
        return;
      }
      setPackageEditor(null);
      await fetchOrders();
    } finally {
      setPackageEditorSaving(false);
    }
  };

  const addRoomEditorItem = () => {
    setRoomEditor((current) => current ? {
      ...current,
      items: [...current.items, createRoomEditorItem(current.items.length)],
    } : current);
  };

  const removeRoomEditorItem = (index) => {
    setRoomEditor((current) => {
      if (!current || current.items.length <= 1) return current;
      return {
        ...current,
        items: current.items.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  };

  const handleSaveRoomEditor = async () => {
    if (!roomEditor || roomEditorSaving) return;

    if (!roomEditor.orderId) {
      setError('Выберите заказ.');
      return;
    }

    const invalidItem = (roomEditor.items || []).find((item) => !String(item.name || '').trim() || (Number(item.quantity) || 0) < 1);
    if (invalidItem) {
      setError('Для каждого изделия укажите наименование и количество не меньше 1.');
      return;
    }

    const baseOrder = orders.find((order) => order._id === roomEditor.orderId);
    if (!baseOrder) {
      setError('Выбранный заказ не найден.');
      return;
    }

    let roomValue = String(roomEditor.room || '').trim();
    let roomNumberValue = String(roomEditor.roomNumber || '').trim();
    if (roomEditor.mode === 'item') {
      const selectedRoom = getOrderRoomOptions(baseOrder).find((option) => option.key === roomEditor.sourceGroupKey) || null;
      roomValue = selectedRoom?.room || roomValue;
      roomNumberValue = selectedRoom?.roomNumber || roomNumberValue;
      if (!roomEditor.sourceGroupKey || (!roomValue && !roomNumberValue)) {
        setError('Выберите помещение в заказе.');
        return;
      }
    } else if (!roomValue && !roomNumberValue) {
      setError('Укажите помещение или его номер.');
      return;
    }

    const preservedItems = roomEditor.mode === 'edit'
      ? (baseOrder.items || []).filter((item) => buildRoomGroupKey(item.room, item.roomNumber) !== roomEditor.sourceGroupKey)
      : [...(baseOrder.items || [])];
    const preparedRoomItems = assignAutoItemNumbers((roomEditor.items || []).map((item) => ({
      ...item,
      room: roomValue,
      roomNumber: roomNumberValue,
    })), preservedItems);
    const nextRoomItems = buildOrderItemsPayload(preparedRoomItems);
    const nextItems = buildOrderItemsPayload([...preservedItems, ...nextRoomItems]);

    const payload = {
      orderNumber: String(baseOrder.orderNumber || '').trim(),
      customer: String(baseOrder.customer || '').trim(),
      orderDate: String(baseOrder.orderDate || '').trim(),
      items: nextItems,
    };

    setRoomEditorSaving(true);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${baseOrder._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await getErrorMessage(res, roomEditor.mode === 'item' ? 'Не удалось сохранить изделия.' : 'Не удалось сохранить помещение и изделия.'));
        return;
      }
      setRoomEditor(null);
      await fetchOrders();
    } finally {
      setRoomEditorSaving(false);
    }
  };

  const handleUploadOrderAttachment = async (order, item, file, { overwrite = false, scope = 'order' } = {}) => {
    if (!order?._id || !item?.itemId || !file) return;

    const attachmentScope = String(scope || 'order').trim().toLowerCase();
    const scopeConfig = getAttachmentScopeConfig(attachmentScope);
    const targetKey = getAttachmentTargetKey(order._id, item.itemId, attachmentScope);
    setAttachmentUploadingTargetKey(targetKey);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const query = new URLSearchParams();
      if (overwrite) query.set('overwrite', '1');
      if (attachmentScope === 'paint') query.set('scope', 'paint');
      const res = await apiFetch(`/api/orders/${order._id}/items/${item.itemId}/attachments${query.toString() ? `?${query.toString()}` : ''}`, {
        method: 'POST',
        body: formData,
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        if (res.status === 409 && !overwrite) {
          setConfirmAttachmentOverwrite({
            orderId: order._id,
            itemId: item.itemId,
            orderNumber: order.orderNumber || '',
            itemName: item.name || '',
            itemNumber: item.itemNumber || '',
            attachmentName: data?.existingAttachment?.name || file.name || 'Файл',
            file,
            scope: attachmentScope,
          });
          return;
        }
        setError(data?.message || `Не удалось загрузить файл ${scopeConfig.dialogTitle.toLowerCase()}.`);
        return;
      }

      setConfirmAttachmentOverwrite(null);
      await fetchOrders();
    } catch (uploadError) {
      setError(uploadError.message || `Не удалось загрузить файл ${scopeConfig.dialogTitle.toLowerCase()}.`);
    } finally {
      setAttachmentUploadingTargetKey('');
    }
  };

  const handleAttachmentLinkDraftChange = (field) => (event) => {
    const value = event.target.value;
    setError('');
    setAttachmentLinkDraft((current) => ({ ...current, [field]: value }));
  };

  const handleUploadOrderAttachmentLink = async ({ orderId, itemId, name, url, overwrite = false, scope = 'order' }) => {
    if (!orderId || !itemId) return;
    const attachmentScope = String(scope || 'order').trim().toLowerCase();
    const scopeConfig = getAttachmentScopeConfig(attachmentScope);
    const targetKey = getAttachmentTargetKey(orderId, itemId, attachmentScope);
    setAttachmentUploadingTargetKey(targetKey);
    setError('');
    try {
      const query = new URLSearchParams();
      if (overwrite) query.set('overwrite', '1');
      if (attachmentScope === 'paint') query.set('scope', 'paint');
      const res = await apiFetch(`/api/orders/${orderId}/items/${itemId}/attachments/link${query.toString() ? `?${query.toString()}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, scope: attachmentScope }),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        if (res.status === 409 && !overwrite) {
          setConfirmAttachmentOverwrite({
            kind: 'link',
            orderId,
            itemId,
            orderNumber: attachmentsDialog?.orderNumber || '',
            itemName: attachmentsDialog?.itemName || '',
            itemNumber: attachmentsDialog?.itemNumber || '',
            attachmentName: data?.existingAttachment?.name || name || 'Ссылка',
            name,
            url,
            scope: attachmentScope,
          });
          return;
        }
        setError(data?.message || `Не удалось сохранить ссылку для "${scopeConfig.dialogTitle.toLowerCase()}".`);
        return;
      }
      setAttachmentLinkDraft({ name: '', url: '' });
      setConfirmAttachmentOverwrite(null);
      await fetchOrders();
    } catch (uploadError) {
      setError(uploadError.message || `Не удалось сохранить ссылку для "${scopeConfig.dialogTitle.toLowerCase()}".`);
    } finally {
      setAttachmentUploadingTargetKey('');
    }
  };

  const handleOpenAttachment = async (orderId, itemId, attachment, scope = 'order') => {
    if (!orderId || !itemId || !attachment?.attachmentId) return;
    const attachmentScope = String(scope || 'order').trim().toLowerCase();

    if (isLinkAttachment(attachment)) {
      const targetUrl = getAttachmentLinkUrl(attachment);
      if (!targetUrl) {
        setError('Ссылка пустая.');
        return;
      }
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const query = attachmentScope === 'paint' ? '?scope=paint' : '';
    const openKey = `${getAttachmentTargetKey(orderId, itemId, attachmentScope)}:${attachment.attachmentId}`;
    setAttachmentOpeningKey(openKey);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${orderId}/items/${itemId}/attachments/${attachment.attachmentId}/file${query}`);
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось открыть вложение.'));
        return;
      }

      const blob = await res.blob();
      if (isImageAttachment(attachment)) {
        const blobUrl = window.URL.createObjectURL(blob);
        setAttachmentPreviewState({
          orderId,
          itemId,
          attachment,
          mode: 'image',
          name: attachment.name || 'Изображение',
          kindLabel: getAttachmentKindLabel(attachment),
          sizeLabel: formatAttachmentSize(attachment.size),
          url: blobUrl,
          scope: attachmentScope,
        });
        return;
      }

      if (isPdfAttachment(attachment)) {
        const blobUrl = window.URL.createObjectURL(blob);
        setAttachmentPreviewState({
          orderId,
          itemId,
          attachment,
          mode: 'pdf',
          name: attachment.name || 'PDF',
          kindLabel: getAttachmentKindLabel(attachment),
          sizeLabel: formatAttachmentSize(attachment.size),
          url: blobUrl,
          scope: attachmentScope,
        });
        return;
      }

      if (isDocxAttachment(attachment)) {
        const mammothImport = await import('mammoth/mammoth.browser');
        const mammoth = mammothImport.default || mammothImport;
        const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
        setAttachmentPreviewState({
          orderId,
          itemId,
          attachment,
          mode: 'word',
          name: attachment.name || 'Word',
          kindLabel: getAttachmentKindLabel(attachment),
          sizeLabel: formatAttachmentSize(attachment.size),
          html: result.value || '<p>Пустой документ.</p>',
          scope: attachmentScope,
        });
        return;
      }

      if (isSpreadsheetAttachment(attachment)) {
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
        setAttachmentPreviewState({
          orderId,
          itemId,
          attachment,
          mode: 'spreadsheet',
          name: attachment.name || 'Excel',
          kindLabel: getAttachmentKindLabel(attachment),
          sizeLabel: formatAttachmentSize(attachment.size),
          sheets,
          activeSheetIndex: 0,
          scope: attachmentScope,
        });
        return;
      }

      await handleDownloadAttachment(orderId, itemId, attachment, attachmentScope);
    } catch (openError) {
      setError(openError.message || 'Не удалось открыть вложение.');
    } finally {
      setAttachmentOpeningKey('');
    }
  };

  const handleDownloadAttachment = async (orderId, itemId, attachment, scope = 'order') => {
    if (!orderId || !itemId || !attachment?.attachmentId) return;
    const attachmentScope = String(scope || 'order').trim().toLowerCase();

    if (isLinkAttachment(attachment)) {
      const targetUrl = getAttachmentLinkUrl(attachment);
      if (!targetUrl) {
        setError('Ссылка пустая.');
        return;
      }
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const query = attachmentScope === 'paint' ? '?scope=paint' : '';
    const downloadKey = `${getAttachmentTargetKey(orderId, itemId, attachmentScope)}:${attachment.attachmentId}:download`;
    setAttachmentOpeningKey(downloadKey);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${orderId}/items/${itemId}/attachments/${attachment.attachmentId}/file${query}`);
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось скачать вложение.'));
        return;
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = attachment.name || 'attachment';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 5_000);
    } finally {
      setAttachmentOpeningKey('');
    }
  };

  const handleAttachmentInputChange = async (order, item, event, scope = 'order') => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const attachmentScope = String(scope || 'order').trim().toLowerCase();

    const duplicateAttachment = getItemAttachments(item, attachmentScope).find((attachment) => (
      getAttachmentNameKey(attachment.name) === getAttachmentNameKey(file.name)
    ));
    if (duplicateAttachment) {
      setConfirmAttachmentOverwrite({
        orderId: order._id || '',
        itemId: item.itemId || '',
        orderNumber: order.orderNumber || '',
        itemName: item.name || '',
        itemNumber: item.itemNumber || '',
        attachmentName: duplicateAttachment.name || file.name || 'Файл',
        file,
        scope: attachmentScope,
      });
      return;
    }
    await handleUploadOrderAttachment(order, item, file, { scope: attachmentScope });
  };

  const performOverwriteAttachment = async () => {
    const orderId = String(confirmAttachmentOverwrite?.orderId || '').trim();
    const itemId = String(confirmAttachmentOverwrite?.itemId || '').trim();
    const file = confirmAttachmentOverwrite?.file;
    if (!orderId || !itemId) return;

    if (confirmAttachmentOverwrite?.kind === 'link') {
      await handleUploadOrderAttachmentLink({
        orderId,
        itemId,
        name: confirmAttachmentOverwrite?.name || '',
        url: confirmAttachmentOverwrite?.url || '',
        overwrite: true,
        scope: confirmAttachmentOverwrite?.scope || 'order',
      });
      return;
    }

    if (!file) return;

    const order = orders.find((currentOrder) => currentOrder._id === orderId);
    const item = (order?.items || []).find((currentItem) => currentItem.itemId === itemId) || null;
    if (!order || !item) {
      setError('Изделие для перезаписи файла не найдено.');
      return;
    }

    await handleUploadOrderAttachment(order, item, file, {
      overwrite: true,
      scope: confirmAttachmentOverwrite?.scope || 'order',
    });
  };

  const performDeleteAttachment = async (orderId, itemId, attachmentId, scope = 'order') => {
    if (!orderId || !itemId || !attachmentId) return;

    const attachmentScope = String(scope || 'order').trim().toLowerCase();
    const query = attachmentScope === 'paint' ? '?scope=paint' : '';
    const deleteKey = `${getAttachmentTargetKey(orderId, itemId, attachmentScope)}:${attachmentId}`;
    setAttachmentDeletingKey(deleteKey);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${orderId}/items/${itemId}/attachments/${attachmentId}${query}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось удалить вложение.'));
        return;
      }
      setConfirmAttachmentDelete(null);
      await fetchOrders();
    } finally {
      setAttachmentDeletingKey('');
    }
  };

  const requestDeleteAttachment = (orderId, itemId, attachment, scope = 'order') => {
    if (!orderId || !itemId || !attachment?.attachmentId) return;
    setConfirmAttachmentDelete({
      orderId,
      itemId,
      attachmentId: attachment.attachmentId,
      attachmentName: attachment.name || 'Файл',
      scope: String(scope || 'order').trim().toLowerCase(),
    });
  };

  const renderAttachmentCellControls = ({ order, item, scope = 'order', attachments = [], targetKey = '', disabled = false, actionStyle = undefined }) => {
    const scopeConfig = getAttachmentScopeConfig(scope);
    const isUploading = attachmentUploadingTargetKey === targetKey;
    return (
      <div className="order-card-cell-content">
        <input
          ref={(node) => {
            if (node) {
              attachmentInputRefs.current[targetKey] = node;
            } else {
              delete attachmentInputRefs.current[targetKey];
            }
          }}
          type="file"
          className="order-card-file-input"
          accept={ORDER_CARD_ATTACHMENT_ACCEPT}
          onChange={(event) => handleAttachmentInputChange(order, item, event, scope)}
        />
        <Button
          variant="secondary"
          size="sm"
          className="order-card-action-btn order-card-icon-btn"
          style={actionStyle}
          onClick={() => attachmentInputRefs.current[targetKey]?.click()}
          disabled={disabled || isUploading}
          title={scopeConfig.addButtonTitle}
          aria-label={scopeConfig.addButtonTitle}
        >
          {isUploading ? '...' : '+'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="order-card-action-btn order-card-count-btn"
          style={actionStyle}
          onClick={() => openAttachmentsDialog(order, item, scope)}
          disabled={disabled}
          title={attachments.length > 0 ? scopeConfig.openButtonTitle : scopeConfig.emptyTitle}
          aria-label={scopeConfig.openButtonTitle}
        >
          <span className="order-card-count-btn-icon">⌕</span>
          <span className="order-card-count-btn-value">{attachments.length}</span>
        </Button>
      </div>
    );
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

  const openInlineEdit = (row) => {
    setError('');
    setInlineDrafts(current => ({
      ...current,
      [row.key]: current[row.key] || createInlineDraft(row),
    }));
  };

  const cancelInlineEdit = (rowKey) => {
    setInlineDrafts(current => {
      const next = { ...current };
      delete next[rowKey];
      return next;
    });
  };

  const handleInlineChange = (rowKey, field) => (event) => {
    const value = event.target.value;
    setError('');
    setInlineDrafts(current => ({
      ...current,
      [rowKey]: {
        ...current[rowKey],
        [field]: value,
      },
    }));
  };

  const saveInlineRow = async (rowKey) => {
    const row = rowsByKey[rowKey];
    const draft = inlineDrafts[rowKey];
    if (!row || !draft) return false;

    const orderNumber = String(draft.orderNumber || '').trim();
    const productName = String(draft.name || '').trim();
    const quantity = Number(draft.quantity) || 0;
    const isPlaceholder = Boolean(row.isPlaceholder);

    if (!orderNumber) {
      setError('Для быстрого редактирования укажите номер заказа.');
      return false;
    }
    if (!isPlaceholder && !productName) {
      setError('Для быстрого редактирования укажите наименование изделия.');
      return false;
    }
    if (!isPlaceholder && quantity < 1) {
      setError('Количество изделия должно быть не меньше 1.');
      return false;
    }

    const baseOrder = orders.find(order => order._id === row.order._id);
    if (!baseOrder) {
      setError('Заказ для быстрого редактирования не найден.');
      return false;
    }

    const nextItems = (baseOrder.items || []).map(item => (
      item.itemId === row.item.itemId
        ? {
            ...item,
            room: String(draft.room || '').trim(),
            roomNumber: String(draft.roomNumber || '').trim(),
            itemNumber: String(draft.itemNumber || '').trim(),
            productNumber: String(draft.productNumber || '').trim(),
            quantity,
            name: productName,
            deliveryDate: String(draft.deliveryDate || '').trim(),
            material: String(draft.material || '').trim(),
            packageName: String(draft.packageName || '').trim(),
            packageItems: normalizePackageItems(draft.packageItems, draft.packageName),
            photoLink: String(draft.photoLink || '').trim(),
            notes: String(draft.notes || '').trim(),
          }
        : item
    ));
    const payload = {
      orderNumber,
      customer: String(draft.customer || '').trim(),
      customerId: String(draft.customer || '').trim() === String(baseOrder.customer || '').trim()
        ? String(baseOrder.customerId || '').trim()
        : '',
      orderDate: baseOrder.orderDate || '',
      items: nextItems.map(item => ({
        itemId: item.itemId,
        itemNumber: item.itemNumber || '',
        productNumber: item.productNumber || '',
        room: item.room || '',
        roomNumber: item.roomNumber || '',
        name: item.name || '',
        quantity: Number(item.quantity) || 1,
        deliveryDate: item.deliveryDate || '',
        material: item.material || '',
        packageName: item.packageName || '',
        packageItems: normalizePackageItems(item.packageItems, item.packageName),
        photoLink: item.photoLink || '',
        notes: item.notes || '',
      })),
    };

    setInlineSavingKey(rowKey);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${baseOrder._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось сохранить строку.'));
        return false;
      }
      cancelInlineEdit(rowKey);
      await fetchOrders();
      return true;
    } finally {
      setInlineSavingKey('');
    }
  };

  const saveAllInlineRows = async () => {
    const draftKeys = Object.keys(inlineDrafts);
    if (draftKeys.length === 0) return;
    for (const rowKey of draftKeys) {
      const saved = await saveInlineRow(rowKey);
      if (!saved) {
        break;
      }
    }
  };

  const cancelOrderInlineEdits = (orderId) => {
    const keys = orderDraftKeys[orderId] || [];
    if (keys.length === 0) return;
    setInlineDrafts(current => {
      const next = { ...current };
      keys.forEach((rowKey) => {
        delete next[rowKey];
      });
      return next;
    });
  };

  const exportRowsToCsv = () => {
    const headers = [
      'Номер заказа',
      'Заказчик',
      'Помещение',
      '№ помещения',
      '№ изделия в заказе',
      'Кол-во изделй',
      'Наименование',
      'Карточка заказа',
      'Комплектация заказа',
      'Примечания',
      'Отгрузка до',
      'СТОЛЯР',
      '',
      'Покраска',
      'Начало изготовления изделия',
      'Окончание изготовления изделия',
      'Время изготовления изделий',
      'Время изготовления заказа',
    ];

    const csvLines = [
      headers.map(escapeCsvValue).join(';'),
      ...rows.map(({ order, item, carpenterAssignment, carpenterActiveStage, activeStage, assignedStage }) => {
        const manufacturingMeta = getOrderManufacturingMeta(order);
        const itemManufacturingMeta = getItemManufacturingMeta(item);
        const workerStageForText = assignedStage || carpenterActiveStage || activeStage || null;
        const packageStats = getPackageStats(item.packageItems, item.packageName);
        const cells = [
          order.orderNumber || '',
          order.customer || '',
          item.room || '',
          item.roomNumber || '',
          item.itemNumber || '',
          item.quantity || '',
          item.name || '',
          getItemAttachments(item, 'order').map((attachment) => attachment.name).join(', '),
          `${packageStats.pending}/${packageStats.total}`,
          item.notes || '',
          item.deliveryDate || '',
          String(carpenterAssignment?.employeeName || workerStageForText?.employeeName || '').trim() || '',
          item.photoLink || '',
          getItemAttachments(item, 'paint').map((attachment) => attachment.name).join(', '),
          itemManufacturingMeta.startDate || '',
          itemManufacturingMeta.endDate || '',
          formatManufacturingTime(itemManufacturingMeta.startDate, itemManufacturingMeta.endDate),
          formatManufacturingTime(manufacturingMeta.startDate, manufacturingMeta.endDate),
        ];
        return cells.map(escapeCsvValue).join(';');
      }),
    ];

    const blob = new Blob([`\uFEFF${csvLines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!confirmDelete?.id || deletingOrder) return;
    setDeletingOrder(true);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось удалить заказ.'));
        return;
      }
      if (editingOrderId === confirmDelete.id) {
        closeForm();
      }
      setConfirmDelete(null);
      await fetchOrders();
    } finally {
      setDeletingOrder(false);
    }
  };

  const headerPrimaryActionsTarget = typeof document !== 'undefined'
    ? document.getElementById('orders-header-primary-actions')
    : null;

  const headerPrimaryActions = headerPrimaryActionsTarget ? createPortal(
    <div className="orders-header-primary-actions">
      <Button
        variant="primary"
        className="section-toolbar-btn orders-header-toolbar-btn"
        onClick={() => {
          openCreateForm();
        }}
      >
        Новый заказ
      </Button>
      <Button
        variant="primary"
        className="section-toolbar-btn orders-header-toolbar-btn"
        onClick={() => {
          openCreateRoomEditor();
        }}
      >
        Новое помещение
      </Button>
      <Button
        variant="primary"
        className="section-toolbar-btn orders-header-toolbar-btn"
        onClick={() => {
          openCreateItemEditor();
        }}
      >
        Новое изделие
      </Button>
    </div>,
    headerPrimaryActionsTarget,
  ) : null;

  return (
    <div>
      {headerPrimaryActions}

      <div className="card orders-workspace-table-card">
        {Object.keys(inlineDrafts).length > 0 ? (
          <div className="excel-bulk-toolbar">
            <div className="filters-summary">Изменено строк: {Object.keys(inlineDrafts).length}</div>
            <div className="table-action-group">
              <button className="btn btn-success" onClick={saveAllInlineRows} disabled={Boolean(inlineSavingKey)}>
                {inlineSavingKey ? 'Сохранение...' : 'Сохранить все'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setInlineDrafts({})}
                disabled={Boolean(inlineSavingKey)}
              >
                Отменить все
              </button>
            </div>
          </div>
        ) : null}

        {error && (
          <div className="settings-alert settings-alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="mobile-empty-state">Загрузка таблицы...</div>
        ) : (
          <>
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
                        key={`primary-header-${index}`}
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
                        key={`${cell.label}-${index}`}
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
                    const inlineDraft = inlineDrafts[key] || null;
                    const isInlineEditing = Boolean(inlineDraft);
                    const isFirstOrderRow = Boolean(firstOrderRowKeys[key]);
                    const orderId = getOrderIdentity({ key, order });
                    const isLastOrderRow = lastOrderRowKeys[orderId] === key;
                    const orderRowSpan = orderRowSpans[key] || 1;
                    const isHoveredOrder = hoveredOrderId === orderId;
                    const orderGroupClass = `order-group-cell${isFirstOrderRow ? ' order-group-top' : ''}${isLastOrderRow ? ' order-group-bottom' : ''}`.trim();
                    const orderOutlineClass = `${isHoveredOrder ? `order-outline-cell${isFirstOrderRow ? ' order-outline-top' : ''}${isLastOrderRow ? ' order-outline-bottom' : ''}` : ''}`.trim();
                    const regularOrderClass = `order-filled-cell ${orderGroupClass} ${orderOutlineClass}`.trim();
                    const currentOrderDraftKeys = orderDraftKeys[orderId] || [];
                    const orderInlineDraft = currentOrderDraftKeys.length > 0 ? inlineDrafts[currentOrderDraftKeys[0]] : null;
                    const isOrderInlineEditing = Boolean(orderInlineDraft);
                    const hasOrderDrafts = currentOrderDraftKeys.length > 0;
                    const orderManufacturingMeta = getOrderManufacturingMeta(order);
                    const commentPreview = getCommentPreview(item.comments);
                    const itemManufacturingMeta = getItemManufacturingMeta(item);
                    const itemAttachments = getItemAttachments(item, 'order');
                    const paintAttachments = getItemAttachments(item, 'paint');
                    const packageStats = getPackageStats(item.packageItems, item.packageName);
                    const orderAttachmentTargetKey = getAttachmentTargetKey(order._id, item.itemId, 'order');
                    const paintAttachmentTargetKey = getAttachmentTargetKey(order._id, item.itemId, 'paint');
                    const workerStageForText = assignedStage || carpenterActiveStage || activeStage || null;
                    const latestCarpenterAutoAt = getLatestAutoHighlightAt(
                      carpenterAssignment?.scannedAt,
                      carpenterActiveStage?.startedAt,
                      workerStageForText?.startedAt,
                    );
                    const hasCarpenterAutoHighlight = Boolean(carpenterAssignment || workerStageForText);
                    const workerCellText = String(carpenterAssignment?.employeeName || workerStageForText?.employeeName || '').trim() || '—';
                    const workerCellTitle = carpenterAssignment?.employeeName
                      ? 'Сотрудник взял изделие в работу по QR'
                      : (workerStageForText?.stepName || activeStage?.stepName || '');
                    const carpenterCellStyle = hasCarpenterAutoHighlight
                      ? {
                          background: legendColorMap[columnStageMeta.carpenter.legendKey] || '#C37C8E',
                          color: columnStageMeta.carpenter.textHex,
                        }
                      : undefined;
                    const carpenterCellClassName = `${hasCarpenterAutoHighlight ? '' : 'order-filled-cell'} ${orderGroupClass} ${orderOutlineClass}`.trim();
                    const roomCellProps = getManualStageCellProps(key, item, 'room', regularOrderClass, undefined, { disabled: isInlineEditing });
                    const roomNumberCellPropsBase = getManualStageCellProps(key, item, 'roomNumber', regularOrderClass, undefined, { disabled: isInlineEditing });
                    const roomNumberCellProps = {
                      ...roomNumberCellPropsBase,
                      className: cn(roomNumberCellPropsBase.className, 'orders-cell-center'),
                    };
                    const itemNumberCellPropsBase = getManualStageCellProps(key, item, 'itemNumber', regularOrderClass, undefined, { disabled: isInlineEditing });
                    const itemNumberCellProps = {
                      ...itemNumberCellPropsBase,
                      className: cn(itemNumberCellPropsBase.className, 'orders-cell-center'),
                    };
                    const quantityCellPropsBase = getManualStageCellProps(key, item, 'quantity', regularOrderClass, undefined, { disabled: isInlineEditing });
                    const quantityCellProps = {
                      ...quantityCellPropsBase,
                      className: cn(quantityCellPropsBase.className, 'orders-cell-center'),
                    };
                    const nameCellProps = getManualStageCellProps(key, item, 'name', regularOrderClass, undefined, { disabled: isInlineEditing });
                    const deliveryDateCellProps = getManualStageCellProps(key, item, 'deliveryDate', regularOrderClass, undefined, { disabled: isInlineEditing });
                    const hasItemManufacturingStart = Boolean(itemManufacturingMeta.startDate);
                    const itemStartDateCellStyle = hasItemManufacturingStart
                      ? {
                          background: legendColorMap[columnStageMeta.itemStart.legendKey] || '#C37C8E',
                          color: columnStageMeta.itemStart.textHex,
                        }
                      : undefined;
                    const itemStartDateCellProps = getManualStageCellProps(
                      key,
                      item,
                      'itemStartDate',
                      regularOrderClass,
                      itemStartDateCellStyle,
                      { disabled: isInlineEditing },
                    );
                    const itemEndDateCellStyle = itemManufacturingMeta.endDate
                      ? {
                          background: legendColorMap[columnStageMeta.itemEnd.legendKey] || '#C37C8E',
                          color: columnStageMeta.itemEnd.textHex,
                        }
                      : undefined;
                    const itemEndDateCellPropsBase = getManualStageCellProps(
                      key,
                      item,
                      'itemEndDate',
                      regularOrderClass,
                      itemEndDateCellStyle,
                      { disabled: isInlineEditing },
                    );
                    const itemEndDateCellProps = {
                      ...itemEndDateCellPropsBase,
                      className: cn(itemEndDateCellPropsBase.className, 'item-end-date-cell'),
                    };
                    const orderCardActionStyle = {
                      background: legendColorMap[columnStageMeta.card.legendKey] || '#A8D7B6',
                      color: columnStageMeta.card.textHex,
                    };
                    const packageActionStyle = {
                      background: legendColorMap[columnStageMeta.package.legendKey] || '#99E5FF',
                      color: columnStageMeta.package.textHex,
                    };
                    const paintActionStyle = {
                      background: legendColorMap[columnStageMeta.paint.legendKey] || '#BDA6D5',
                      color: columnStageMeta.paint.textHex,
                    };
                    const packageCellStyle = packageStats.total > 0 && packageStats.pending === 0
                      ? {
                          background: legendColorMap[columnStageMeta.package.legendKey] || '#99E5FF',
                          color: columnStageMeta.package.textHex,
                        }
                      : undefined;
                    const packageSummaryBadgeStyle = {
                      background: legendColorMap[columnStageMeta.package.legendKey] || '#99E5FF',
                      color: columnStageMeta.package.textHex,
                    };
                    const packageCellPropsBase = getManualStageCellProps(key, item, 'packageName', regularOrderClass, packageCellStyle, { disabled: isInlineEditing });
                    const packageCellProps = {
                      ...packageCellPropsBase,
                      className: cn(packageCellPropsBase.className, 'package-cell'),
                    };
                    const paintCellProps = getManualStageCellProps(key, item, 'paint', `order-card-cell ${regularOrderClass}`, undefined, { disabled: isInlineEditing });
                    const photoCellProps = getManualStageCellProps(key, item, 'photoLink', `photo-cell ${regularOrderClass}`, undefined, { disabled: isInlineEditing });
                    const notesCellProps = getManualStageCellProps(key, item, 'notes', `notes-cell ${regularOrderClass}`, undefined, { disabled: isInlineEditing });
                    const carpenterCellProps = getManualStageCellProps(key, item, 'carpenter', carpenterCellClassName, carpenterCellStyle, { disabled: isInlineEditing });
                    const orderNumberCellProps = getManualStageCellProps(
                      key,
                      item,
                      'orderNumber',
                      `sticky-col sticky-col-1 merged-order-cell merged-order-number-cell order-filled-cell order-group-cell order-group-top order-group-bottom order-group-left${isHoveredOrder ? ' order-outline-cell order-outline-top order-outline-bottom order-outline-left' : ''}`,
                      undefined,
                      { disabled: isOrderInlineEditing },
                    );
                    const customerCellProps = getManualStageCellProps(
                      key,
                      item,
                      'customer',
                      `sticky-col sticky-col-2 merged-order-cell merged-order-customer-cell order-filled-cell order-group-cell order-group-top order-group-bottom${isHoveredOrder ? ' order-outline-cell order-outline-top order-outline-bottom' : ''}`,
                      undefined,
                      { disabled: isOrderInlineEditing },
                    );
                    const orderCardCellProps = getManualStageCellProps(
                      key,
                      item,
                      'orderCard',
                      `order-card-cell ${regularOrderClass}`,
                    );
                    const itemDurationValue = itemManufacturingMeta.endDate
                      ? formatManufacturingTime(itemManufacturingMeta.startDate, itemManufacturingMeta.endDate)
                      : '—';
                    const hasItemManufacturingDuration = itemDurationValue !== '—';
                    const itemDurationCellStyle = hasItemManufacturingDuration
                      ? {
                          background: legendColorMap[columnStageMeta.itemDuration.legendKey] || '#C37C8E',
                          color: columnStageMeta.itemDuration.textHex,
                        }
                      : undefined;
                    const itemDurationCellPropsBase = getManualStageCellProps(
                      key,
                      item,
                      'itemDuration',
                      regularOrderClass,
                      itemDurationCellStyle,
                      { disabled: isInlineEditing },
                    );
                    const itemDurationCellProps = {
                      ...itemDurationCellPropsBase,
                      className: cn(itemDurationCellPropsBase.className, 'item-duration-cell'),
                    };

                    const orderDurationValue = orderManufacturingMeta.endDate
                      ? formatManufacturingTime(orderManufacturingMeta.startDate, orderManufacturingMeta.endDate)
                      : '—';
                    const hasManufacturingDuration = Boolean(orderManufacturingMeta.startDate || orderManufacturingMeta.endDate || orderDurationValue !== '—');
                    const durationMetaCellStyle = hasManufacturingDuration
                      ? {
                          background: legendColorMap[columnStageMeta.duration.legendKey] || '#F4C2A4',
                          color: columnStageMeta.duration.textHex,
                        }
                      : undefined;
                    const durationMetaCellProps = getManualStageCellProps(
                      key,
                      item,
                      'duration',
                      `merged-order-cell merged-order-meta-cell order-filled-cell order-group-cell order-group-top order-group-bottom order-group-right${isHoveredOrder ? ' order-outline-cell order-outline-top order-outline-bottom order-outline-right' : ''}`,
                      durationMetaCellStyle,
                    );
                    return (
                      <tr
                        key={key}
                        className={isInlineEditing ? 'unified-orders-row-editing' : ''}
                        onMouseEnter={() => setHoveredOrderId(orderId)}
                      >
                        {isFirstOrderRow ? (
                          <td
                            rowSpan={orderRowSpan}
                            {...orderNumberCellProps}
                          >
                            <div className="merged-order-number-content">
                              <div className="xlsx-order-cell">
                              {order?._id ? (
                                <button
                                  type="button"
                                  className="order-link-button merged-order-number-link"
                                  onClick={() => setOrderPreview(order)}
                                  title="Открыть заказ в режиме чтения"
                                  aria-label={`Открыть заказ ${order.orderNumber || ''} в режиме чтения`}
                                >
                                  {(isOrderInlineEditing ? orderInlineDraft?.orderNumber : order.orderNumber) || '—'}
                                </button>
                              ) : (
                                <div className="merged-order-number-link">{(isOrderInlineEditing ? orderInlineDraft?.orderNumber : order.orderNumber) || '—'}</div>
                              )}
                              <button
                                className={`btn btn-secondary btn-small order-actions-trigger ${hasOrderDrafts ? 'order-actions-trigger-attention' : ''}`}
                                type="button"
                                aria-label={`Действия над заказом ${order.orderNumber || ''}`}
                                title={hasOrderDrafts ? 'Действия над заказом: есть быстрые правки' : 'Действия над заказом'}
                                onClick={() => setOrderActionsOrder(order)}
                              >
                                &#8942;
                              </button>
                              </div>
                            </div>
                          </td>
                        ) : null}
                        {isFirstOrderRow ? (
                          <td
                            rowSpan={orderRowSpan}
                            {...customerCellProps}
                          >
                            <div className="merged-order-customer-content">
                              {isOrderInlineEditing ? (
                                <input className="table-inline-input merged-order-customer-input" value={orderInlineDraft.customer} onChange={handleInlineChange(currentOrderDraftKeys[0], 'customer')} />
                              ) : canManageCustomers && (order.customer || order.customerId) ? (
                                <button
                                  type="button"
                                  className="order-link-button merged-order-customer-button"
                                  onClick={() => openCustomerEditor({ context: 'order-cell', order })}
                                  title="Открыть карточку заказчика"
                                >
                                  {order.customer || 'Открыть карточку'}
                                </button>
                              ) : (
                                <div className="merged-order-customer-text">{order.customer || '—'}</div>
                              )}
                            </div>
                          </td>
                        ) : null}
                        <td {...roomCellProps}>
                          {isInlineEditing ? (
                            <input className="table-inline-input" value={inlineDraft.room} onChange={handleInlineChange(key, 'room')} />
                          ) : (
                            <div className="room-cell-content">
                              <div className="room-cell-text">{item.room || (isPlaceholder ? 'Добавьте помещение' : '—')}</div>
                            </div>
                          )}
                        </td>
                        <td {...roomNumberCellProps}>{isInlineEditing ? <input className="table-inline-input table-inline-input-narrow" value={inlineDraft.roomNumber} onChange={handleInlineChange(key, 'roomNumber')} /> : (item.roomNumber || '—')}</td>
                        <td {...itemNumberCellProps}>{isInlineEditing ? <input className="table-inline-input table-inline-input-narrow" value={inlineDraft.itemNumber} onChange={handleInlineChange(key, 'itemNumber')} /> : (item.itemNumber || '—')}</td>
                        <td {...quantityCellProps}>{isInlineEditing ? <input type="number" min="1" className="table-inline-input table-inline-input-narrow" value={inlineDraft.quantity} onChange={handleInlineChange(key, 'quantity')} /> : (isPlaceholder ? '—' : (item.quantity || 1))}</td>
                        <td {...nameCellProps}>
                          {isInlineEditing ? (
                            <input className="table-inline-input" value={inlineDraft.name} onChange={handleInlineChange(key, 'name')} />
                          ) : (
                            <div className="order-primary-title">
                              {item.itemId && !isPlaceholder ? (
                                <button
                                  type="button"
                                  className="order-primary-title-button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openQrPreview(order, item);
                                  }}
                                  title="Открыть QR-код изделия"
                                  aria-label="Открыть QR-код изделия"
                                >
                                  <span className="order-primary-title-button-text"><strong>{item.name || '—'}</strong></span>
                                  <span className="order-primary-title-button-badge" aria-hidden="true" />
                                </button>
                              ) : (
                                <strong>{item.name || (isPlaceholder ? 'В заказе пока нет изделий' : '—')}</strong>
                              )}
                            </div>
                          )}
                        </td>
                        <td {...orderCardCellProps}>
                          {renderAttachmentCellControls({
                            order,
                            item,
                            scope: 'order',
                            attachments: itemAttachments,
                            targetKey: orderAttachmentTargetKey,
                            disabled: isPlaceholder,
                            actionStyle: orderCardActionStyle,
                          })}
                        </td>
                        <td {...packageCellProps}>
                          <div className="package-cell-content">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="order-card-action-btn order-card-icon-btn"
                              style={packageActionStyle}
                              onClick={(event) => {
                                event.stopPropagation();
                                openPackageEditor(order, item);
                              }}
                              disabled={isPlaceholder}
                              title="Редактировать комплектацию"
                              aria-label="Редактировать комплектацию"
                            >
                              ✎
                            </Button>
                            <span
                              className={cn('package-cell-summary-badge', packageStats.pending > 0 && 'package-cell-summary-badge-attention')}
                              style={packageSummaryBadgeStyle}
                              title={packageStats.total > 0 ? `Не исполнено: ${packageStats.pending} из ${packageStats.total}` : 'Позиции комплектации не добавлены'}
                            >
                              {packageStats.pending}/{packageStats.total}
                            </span>
                          </div>
                        </td>
                        <td {...notesCellProps}>
                          {isInlineEditing ? (
                            <textarea className="table-inline-textarea" rows={3} value={inlineDraft.notes} onChange={handleInlineChange(key, 'notes')} />
                          ) : (
                            <>
                              {commentPreview !== '—' ? (
                                <div className="xlsx-order-cell-comment" title={commentPreview}>{commentPreview}</div>
                              ) : null}
                              {item.notes || (commentPreview !== '—' ? null : '—')}
                            </>
                          )}
                        </td>
                        <td {...deliveryDateCellProps}>{isInlineEditing ? <input type="date" className="table-inline-input" value={inlineDraft.deliveryDate} onChange={handleInlineChange(key, 'deliveryDate')} /> : formatDateDisplay(item.deliveryDate)}</td>
                        <td {...carpenterCellProps} title={workerCellTitle}>
                          {isPlaceholder ? '—' : workerCellText}
                        </td>
                        <td {...photoCellProps}>
                          {isInlineEditing ? (
                            <input className="table-inline-input" value={inlineDraft.photoLink} onChange={handleInlineChange(key, 'photoLink')} placeholder="https://..." />
                          ) : item.photoLink ? (
                            <a className="table-inline-link" href={item.photoLink} target="_blank" rel="noreferrer">Открыть</a>
                          ) : '—'}
                        </td>
                        <td {...paintCellProps}>
                          {renderAttachmentCellControls({
                            order,
                            item,
                            scope: 'paint',
                            attachments: paintAttachments,
                            targetKey: paintAttachmentTargetKey,
                            disabled: isPlaceholder,
                            actionStyle: paintActionStyle,
                          })}
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
                      <td colSpan={18} className="empty-cell">Нет изделий по выбранным фильтрам</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="filters-summary" style={{ marginTop: 12 }}>
          Обновлено: {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleTimeString() : '—'}
        </div>
      </div>

      {isAdmin && selectedStageSelections.length > 0 ? (
        <div
          ref={manualStageToolbarRef}
          className="manual-stage-toolbar manual-stage-toolbar-floating"
          style={{
            left: manualStageToolbarPosition?.left ?? -9999,
            top: manualStageToolbarPosition?.top ?? -9999,
            visibility: manualStageToolbarPosition ? 'visible' : 'hidden',
          }}
        >
          <div className="manual-stage-toolbar-summary">
            Выбрано: <strong>{selectedStageSelections.length}</strong>
            {selectedStageSelectionsWithLegend.length > 0 ? (
              <> • будет закрашено: <strong>{selectedStageSelectionsWithLegend.length}</strong></>
            ) : null}
            {selectedStageSelectionSkippedCount > 0 ? (
              <> • без этапа: <strong>{selectedStageSelectionSkippedCount}</strong></>
            ) : null}
          </div>
          {canEditSelectedDates ? (
            <div className="manual-stage-toolbar-date-editor">
              {selectedStageSingleColumnKey === 'duration' ? (
                <>
                  <label className="manual-stage-toolbar-date-field">
                    <span>Начало заказа</span>
                    <input
                      type="date"
                      value={manualOrderDateDraft.startDate}
                      {...bindManualDateInputProps((value) => setManualOrderDateDraft((current) => ({ ...current, startDate: value })))}
                      disabled={manualStageSaving}
                    />
                  </label>
                  <label className="manual-stage-toolbar-date-field">
                    <span>Окончание заказа</span>
                    <input
                      type="date"
                      value={manualOrderDateDraft.endDate}
                      {...bindManualDateInputProps((value) => setManualOrderDateDraft((current) => ({ ...current, endDate: value })))}
                      disabled={manualStageSaving}
                    />
                  </label>
                </>
              ) : (
                <label className="manual-stage-toolbar-date-field">
                  <span>{selectedStageSingleColumnKey === 'itemStartDate' ? 'Дата начала' : 'Дата окончания'}</span>
                  <input
                    type="date"
                    value={manualDateDraft}
                    {...bindManualDateInputProps(setManualDateDraft)}
                    disabled={manualStageSaving}
                  />
                </label>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="manual-stage-toolbar-btn"
                onClick={applyManualDateToSelection}
                disabled={manualStageSaving}
              >
                Применить дату
              </Button>
            </div>
          ) : null}
          <div className="manual-stage-toolbar-actions">
            <Button
              variant="secondary"
              size="sm"
              className="manual-stage-toolbar-btn manual-stage-toolbar-btn-accent"
              onClick={() => applyManualStageToSelection()}
              disabled={manualStageSaving || selectedStageSelections.length === 0}
              title="Закрасит выбранные ячейки цветом этапов их колонок."
            >
              Закрасить
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="manual-stage-toolbar-btn"
              onClick={() => applyManualStageToSelection({ clear: true })}
              disabled={manualStageSaving}
            >
              Сбросить
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="manual-stage-toolbar-btn"
              onClick={clearSelectedStageCells}
              disabled={manualStageSaving}
            >
              Закрыть
            </Button>
          </div>
        </div>
      ) : null}

      {showForm ? (
        <Modal open={showForm} onClose={closeForm} closeDisabled={savingOrder} size="lg" className="order-form-modal">
          <ModalHeader
            title={editingOrderId ? 'Редактирование заказа' : 'Новый заказ'}
            subtitle="Заказ создается без изделий. Помещения и изделия добавляются позже кнопками сверху таблицы."
            onClose={closeForm}
            closeDisabled={savingOrder}
          />

            <div className="responsive-form-grid">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Номер заказа *</label>
                <input
                  value={orderForm.orderNumber}
                  onChange={handleOrderFieldChange('orderNumber')}
                  className={formErrors.orderNumber ? 'input-invalid' : ''}
                  placeholder="Например: 2026-015"
                />
                {formErrors.orderNumber ? <div className="field-error">{formErrors.orderNumber}</div> : null}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Заказчик</label>
                <div className="customer-picker-field">
                  <button
                    type="button"
                    className="order-link-button customer-picker-trigger"
                    onClick={() => openCustomerEditor({ context: 'order-form' })}
                    disabled={!canManageCustomers || savingOrder}
                    title={canManageCustomers ? 'Открыть карточку заказчика' : 'Недостаточно прав для редактирования заказчиков'}
                  >
                    {orderForm.customer || 'Создать или выбрать заказчика'}
                  </button>
                  {orderForm.customer ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setOrderForm((current) => ({ ...current, customer: '', customerId: '' }))}
                      disabled={savingOrder}
                    >
                      Очистить
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Дата заказа *</label>
                <input
                  type="date"
                  value={orderForm.orderDate}
                  onChange={handleOrderFieldChange('orderDate')}
                  className={formErrors.orderDate ? 'input-invalid' : ''}
                />
                {formErrors.orderDate ? <div className="field-error">{formErrors.orderDate}</div> : null}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Изготовление заказа</label>
                <div className="modal-inline-note">
                  Даты начала и окончания, а также время изготовления рассчитываются автоматически по закрашенным этапам.
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <Button onClick={closeForm} disabled={savingOrder}>Отмена</Button>
              <Button variant="success" onClick={handleSubmit} disabled={!isFormValid || savingOrder}>
                {savingOrder ? (editingOrderId ? 'Сохранение...' : 'Создание...') : (editingOrderId ? 'Сохранить заказ' : 'Создать заказ')}
              </Button>
            </div>
        </Modal>
      ) : null}

      {customerEditor ? (
        <Modal open={Boolean(customerEditor)} onClose={() => !customerSaving && setCustomerEditor(null)} closeDisabled={customerSaving} size="lg" className="order-form-modal">
          <ModalHeader
            title={customerEditor.context === 'order-cell' ? 'Карточка заказчика' : 'Выбор и создание заказчика'}
            subtitle={customerEditor.context === 'order-cell'
              ? 'Просмотр, редактирование и привязка заказчика к текущему заказу.'
              : 'Создайте новую карточку заказчика или выберите существующую для заказа.'}
            onClose={() => !customerSaving && setCustomerEditor(null)}
            closeDisabled={customerSaving}
          />

          {customerError ? (
            <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
              {customerError}
            </div>
          ) : null}

          {customerLoadError && customerEditor.context === 'order-form' ? (
            <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
              {customerLoadError}
            </div>
          ) : null}

          <div className="responsive-form-grid">
            {customerEditor.context === 'order-form' ? (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Существующий заказчик</label>
                <select value={customerDraft.customerId} onChange={handleCustomerTemplateSelect} disabled={customerSaving || Boolean(customerLoadError)}>
                  <option value="">{customers.length > 0 ? 'Новая карточка заказчика' : 'Заказчики пока не добавлены'}</option>
                  {customers.map((customer) => (
                    <option key={customer._id} value={customer._id}>{customer.fullName}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>ФИО *</label>
              <input
                value={customerDraft.fullName}
                onChange={handleCustomerDraftFieldChange('fullName')}
                placeholder="Фамилия Имя Отчество"
                disabled={customerSaving}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Телефон</label>
              <input
                value={customerDraft.phone}
                onChange={handleCustomerDraftFieldChange('phone')}
                placeholder="+7 (900) 000-00-00"
                disabled={customerSaving}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Telegram</label>
              <input
                value={customerDraft.telegram}
                onChange={handleCustomerDraftFieldChange('telegram')}
                placeholder="@username"
                disabled={customerSaving}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Email</label>
              <input
                value={customerDraft.email}
                onChange={handleCustomerDraftFieldChange('email')}
                placeholder="mail@example.com"
                disabled={customerSaving}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Адрес</label>
              <input
                value={customerDraft.address}
                onChange={handleCustomerDraftFieldChange('address')}
                placeholder="Адрес объекта или доставки"
                disabled={customerSaving}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
            <label>Дополнительные контакты и примечания</label>
            <textarea
              className="table-inline-textarea"
              rows={4}
              value={customerDraft.notes}
              onChange={handleCustomerDraftFieldChange('notes')}
              placeholder="Удобное время связи, дополнительные телефоны, комментарии по коммуникации"
              disabled={customerSaving}
            />
          </div>

          <div className="modal-actions">
            <Button onClick={() => !customerSaving && setCustomerEditor(null)} disabled={customerSaving}>Отмена</Button>
            <Button variant="success" onClick={saveCustomerFromEditor} disabled={customerSaving}>
              {customerSaving ? 'Сохранение...' : (customerEditor.context === 'order-cell' ? 'Сохранить карточку' : 'Сохранить и выбрать')}
            </Button>
          </div>
        </Modal>
      ) : null}

      {roomEditor ? (
        <Modal open={Boolean(roomEditor)} onClose={() => !roomEditorSaving && setRoomEditor(null)} closeDisabled={roomEditorSaving} size="lg" className="order-form-modal">
          <ModalHeader
            title={roomEditor.mode === 'item' ? 'Новое изделие' : (roomEditor.mode === 'edit' ? 'Редактирование помещений и изделий' : 'Новое помещение')}
            subtitle={roomEditor.mode === 'item'
              ? 'Выберите заказ и помещение, затем добавьте одно или несколько изделий.'
              : (roomEditor.mode === 'edit'
                ? 'Выберите заказ и помещение, затем измените помещение и его изделия.'
                : 'Выберите заказ, затем создайте помещение и при необходимости сразу несколько изделий.')}
            onClose={() => !roomEditorSaving && setRoomEditor(null)}
            closeDisabled={roomEditorSaving}
          />

          <div className="responsive-form-grid">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Заказ</label>
              <select value={roomEditor.orderId} onChange={handleRoomEditorOrderChange}>
                <option value="">Выберите заказ</option>
                {roomEditorOrderOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            {roomEditor.mode === 'item' || roomEditor.mode === 'edit' ? (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Помещение</label>
                <select
                  value={roomEditor.sourceGroupKey}
                  onChange={handleRoomEditorRoomSelectChange}
                  disabled={!roomEditor.orderId || roomEditorRoomOptions.length === 0}
                >
                  <option value="">{roomEditor.orderId ? 'Выберите помещение' : 'Сначала выберите заказ'}</option>
                  {roomEditorRoomOptions.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </div>
            ) : null}
            {roomEditor.mode !== 'item' ? (
              <>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Помещение</label>
                  <input
                    value={roomEditor.room}
                    onChange={handleRoomEditorFieldChange('room')}
                    placeholder="Кухня, спальня, гардероб"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>№ помещения</label>
                  <input
                    value={roomEditor.roomNumber}
                    onChange={handleRoomEditorFieldChange('roomNumber')}
                    placeholder="Например: 12"
                  />
                </div>
              </>
            ) : null}
          </div>

          {(roomEditor.mode === 'item' || roomEditor.mode === 'edit') && roomEditor.orderId && roomEditorRoomOptions.length === 0 ? (
            <div className="settings-hint" style={{ marginTop: 12 }}>
              {roomEditor.mode === 'edit'
                ? 'В выбранном заказе пока нет помещений для редактирования.'
                : 'В выбранном заказе пока нет помещений. Сначала создайте помещение.'}
            </div>
          ) : null}

          <div className="order-items-editor">
            <div className="order-items-editor-header">
              <div className="modal-title" style={{ fontSize: 16 }}>
                {roomEditor.mode === 'item' ? 'Новые изделия в помещении' : 'Изделия в помещении'}
              </div>
              <Button variant="secondary" size="sm" onClick={addRoomEditorItem} disabled={roomEditorSaving}>Добавить изделие</Button>
            </div>

            {(roomEditor.items || []).map((item, index) => (
              <div key={item.clientKey || item.itemId || index} className="order-item-editor-card">
                <div className="order-item-editor-card-header">
                  <div>
                    <div className="order-item-editor-title">Изделие {index + 1}</div>
                    <div className="order-item-editor-subtitle">Можно сохранить сразу несколько изделий одним действием.</div>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => removeRoomEditorItem(index)}
                    disabled={roomEditorSaving || (roomEditor.items || []).length <= 1}
                  >
                    Удалить
                  </Button>
                </div>

                <div className="responsive-form-grid">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>№ изделия в заказе</label>
                    <input value={item.itemNumber || 'Автоматически при сохранении'} readOnly />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>№ изделия</label>
                    <input value={item.productNumber} onChange={handleRoomEditorItemFieldChange(index, 'productNumber')} placeholder="Артикул или код" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Наименование *</label>
                    <input value={item.name} onChange={handleRoomEditorItemFieldChange(index, 'name')} placeholder="Например: Шкаф, стол, тумба" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Кол-во *</label>
                    <input type="number" min="1" value={item.quantity} onChange={handleRoomEditorItemFieldChange(index, 'quantity')} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Материал</label>
                    <input value={item.material} onChange={handleRoomEditorItemFieldChange(index, 'material')} placeholder="ЛДСП, массив, МДФ" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Отгрузка до</label>
                    <input type="date" value={item.deliveryDate} onChange={handleRoomEditorItemFieldChange(index, 'deliveryDate')} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                    <label>Примечания</label>
                    <textarea
                      value={item.notes}
                      onChange={handleRoomEditorItemFieldChange(index, 'notes')}
                      placeholder="ТЗ, пожелания, особенности по изделию"
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="modal-actions">
            <Button onClick={() => setRoomEditor(null)} disabled={roomEditorSaving}>Отмена</Button>
            <Button variant="success" onClick={handleSaveRoomEditor} disabled={roomEditorSaving}>
              {roomEditorSaving ? 'Сохранение...' : (roomEditor.mode === 'item' ? 'Сохранить изделия' : (roomEditor.mode === 'edit' ? 'Сохранить изменения' : 'Сохранить помещение'))}
            </Button>
          </div>
        </Modal>
      ) : null}

      {packageEditor ? (
        <Modal open={Boolean(packageEditor)} onClose={() => !packageEditorSaving && setPackageEditor(null)} closeDisabled={packageEditorSaving} size="lg" className="order-form-modal">
          <ModalHeader
            title="Комплектация изделия"
            subtitle={`${packageEditor.orderNumber ? `Заказ № ${packageEditor.orderNumber}` : 'Без номера'}${packageEditor.customer ? ` · ${packageEditor.customer}` : ''}${packageEditor.itemName ? ` · ${packageEditor.itemName}` : ''}${packageEditor.itemNumber ? ` · позиция ${packageEditor.itemNumber}` : ''}`}
            onClose={() => !packageEditorSaving && setPackageEditor(null)}
            closeDisabled={packageEditorSaving}
          />

          <div className="package-editor-toolbar">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Новая позиция</label>
              <input
                value={packageEditor.newItemName}
                onChange={handlePackageEditorDraftChange}
                placeholder="Например: стекло, шпон, ручки"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addPackageEditorItem();
                  }
                }}
              />
            </div>
            <div className="package-editor-toolbar-actions">
              <Button variant="secondary" onClick={addPackageEditorItem} disabled={packageEditorSaving}>Добавить позицию</Button>
            </div>
          </div>

          <div className="package-editor-summary">
            Не исполнено: {getPackageStats(packageEditor.items).pending} из {getPackageStats(packageEditor.items).total}
          </div>

          <div className="package-editor-list">
            {(packageEditor.items || []).length > 0 ? (
              packageEditor.items.map((packageItem) => (
                <label key={packageItem.id} className={cn('package-editor-item', packageItem.isCompleted && 'package-editor-item-completed')}>
                  <div className="package-editor-item-main">
                    <input
                      type="checkbox"
                      checked={Boolean(packageItem.isCompleted)}
                      onChange={() => togglePackageEditorItem(packageItem.id)}
                      disabled={packageEditorSaving}
                    />
                    <div className="package-editor-item-text">
                      <span className="package-editor-item-name">{packageItem.name}</span>
                      <span className="package-editor-item-meta">
                        {packageItem.isCompleted
                          ? `Готово${packageItem.completedAt ? ` · ${formatDateDisplay(packageItem.completedAt)}` : ''}`
                          : 'В работе'}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={(event) => {
                      event.preventDefault();
                      removePackageEditorItem(packageItem.id);
                    }}
                    disabled={packageEditorSaving}
                  >
                    Удалить
                  </Button>
                </label>
              ))
            ) : (
              <div className="order-card-empty">Позиции комплектации пока не добавлены.</div>
            )}
          </div>

          <div className="modal-actions">
            <Button onClick={() => setPackageEditor(null)} disabled={packageEditorSaving}>Отмена</Button>
            <Button variant="success" onClick={savePackageEditor} disabled={packageEditorSaving}>
              {packageEditorSaving ? 'Сохранение...' : 'Сохранить комплектацию'}
            </Button>
          </div>
        </Modal>
      ) : null}

      {attachmentsDialog ? (
        <Modal open={Boolean(attachmentsDialog)} onClose={() => setAttachmentsDialog(null)} size="lg" className="order-form-modal">
          <ModalHeader
            title={getAttachmentScopeConfig(attachmentsDialog.scope).dialogTitle}
            subtitle={`${attachmentsDialog.orderNumber ? `Заказ № ${attachmentsDialog.orderNumber}` : 'Без номера'}${attachmentsDialog.customer ? ` · ${attachmentsDialog.customer}` : ''}${attachmentsDialog.itemName ? ` · ${attachmentsDialog.itemName}` : ''}${attachmentsDialog.itemNumber ? ` · позиция ${attachmentsDialog.itemNumber}` : ''}`}
            onClose={() => setAttachmentsDialog(null)}
          />

          <div className="order-card-dialog-toolbar">
            <div className="order-card-link-form">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Название ссылки</label>
                <input
                  value={attachmentLinkDraft.name}
                  onChange={handleAttachmentLinkDraftChange('name')}
                  placeholder="Например: папка проекта"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Ссылка</label>
                <input
                  value={attachmentLinkDraft.url}
                  onChange={handleAttachmentLinkDraftChange('url')}
                  placeholder="https://..."
                />
              </div>
              <div className="order-card-link-form-actions">
                <Button
                  variant="secondary"
                  onClick={() => handleUploadOrderAttachmentLink({
                    orderId: attachmentsDialog.orderId,
                    itemId: attachmentsDialog.itemId,
                    name: attachmentLinkDraft.name,
                    url: attachmentLinkDraft.url,
                    scope: attachmentsDialog.scope || 'order',
                  })}
                  disabled={attachmentUploadingTargetKey === getAttachmentTargetKey(attachmentsDialog.orderId, attachmentsDialog.itemId, attachmentsDialog.scope || 'order')}
                >
                  {attachmentUploadingTargetKey === getAttachmentTargetKey(attachmentsDialog.orderId, attachmentsDialog.itemId, attachmentsDialog.scope || 'order') ? 'Сохранение...' : 'Добавить ссылку'}
                </Button>
              </div>
            </div>
          </div>

          <div className="order-card-dialog-list">
            {currentAttachmentDialogAttachments.length > 0 ? (
              currentAttachmentDialogAttachments.map((attachment) => {
                const fileKey = `${getAttachmentTargetKey(attachmentsDialog.orderId, attachmentsDialog.itemId, attachmentsDialog.scope || 'order')}:${attachment.attachmentId}`;
                const isOpening = attachmentOpeningKey === fileKey;
                const isDownloading = attachmentOpeningKey === `${fileKey}:download`;
                const isDeleting = attachmentDeletingKey === fileKey;
                return (
                  <div key={attachment.attachmentId} className="order-card-dialog-item">
                    <div className="order-card-dialog-icon">{getAttachmentIcon(attachment)}</div>
                    <div className="order-card-dialog-main">
                      <button
                        type="button"
                        className="order-card-dialog-open"
                        onClick={() => handleOpenAttachment(attachmentsDialog.orderId, attachmentsDialog.itemId, attachment, attachmentsDialog.scope || 'order')}
                        disabled={isOpening || isDownloading}
                        title={isImageAttachment(attachment) ? 'Просмотр' : 'Открыть'}
                        aria-label={isImageAttachment(attachment) ? 'Просмотр файла' : 'Открыть файл'}
                      >
                        <span className="order-card-dialog-name">{isOpening ? 'Открытие...' : attachment.name}</span>
                      </button>
                      <div className="order-card-dialog-meta">
                        {getAttachmentKindLabel(attachment)}
                        {isLinkAttachment(attachment) && getAttachmentLinkUrl(attachment) ? ` · ${getAttachmentLinkUrl(attachment)}` : ''}
                        {formatAttachmentSize(attachment.size) ? ` · ${formatAttachmentSize(attachment.size)}` : ''}
                      </div>
                    </div>
                    <div className="order-card-dialog-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDownloadAttachment(attachmentsDialog.orderId, attachmentsDialog.itemId, attachment, attachmentsDialog.scope || 'order')}
                        disabled={isOpening || isDownloading}
                      >
                        {isLinkAttachment(attachment) ? 'Перейти' : (isDownloading ? 'Скачивание...' : 'Скачать')}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => requestDeleteAttachment(attachmentsDialog.orderId, attachmentsDialog.itemId, attachment, attachmentsDialog.scope || 'order')}
                        disabled={isDeleting}
                      >
                        {isDeleting ? 'Удаление...' : 'Удалить'}
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="order-card-empty">{getAttachmentScopeConfig(attachmentsDialog.scope).emptyTitle}</div>
            )}
          </div>
        </Modal>
      ) : null}

      {orderPreview ? (
        <Modal open={Boolean(orderPreview)} onClose={() => setOrderPreview(null)} size="xl" className="order-form-modal">
          <ModalHeader
            title={orderPreview.orderNumber ? `Заказ № ${orderPreview.orderNumber}` : 'Просмотр заказа'}
            subtitle={`${orderPreview.customer ? `${orderPreview.customer} · ` : ''}Режим чтения`}
            onClose={() => setOrderPreview(null)}
          />

          <div className="panel-info">
            <div className="panel-info-title">Данные заказа</div>
            <div className="panel-info-grid">
              <div className="detail-block">
                <div className="detail-label">Номер заказа</div>
                <div className="detail-value">{orderPreview.orderNumber || '—'}</div>
              </div>
              <div className="detail-block">
                <div className="detail-label">Заказчик</div>
                <div className="detail-value">{orderPreview.customer || '—'}</div>
              </div>
              <div className="detail-block">
                <div className="detail-label">Дата заказа</div>
                <div className="detail-value">{formatDateDisplay(orderPreview.orderDate)}</div>
              </div>
              <div className="detail-block">
                <div className="detail-label">Начало изготовления</div>
                <div className="detail-value">{formatDateDisplay(orderPreviewMeta?.startDate)}</div>
              </div>
              <div className="detail-block">
                <div className="detail-label">Окончание изготовления</div>
                <div className="detail-value">{formatDateDisplay(orderPreviewMeta?.endDate)}</div>
              </div>
              <div className="detail-block">
                <div className="detail-label">Время изготовления</div>
                <div className="detail-value">{formatManufacturingTime(orderPreviewMeta?.startDate, orderPreviewMeta?.endDate)}</div>
              </div>
            </div>
            {linkedOrderPreviewCustomer ? (
              <div className="panel-info-text">
                Контакты: {[
                  linkedOrderPreviewCustomer.phone,
                  linkedOrderPreviewCustomer.telegram,
                  linkedOrderPreviewCustomer.email,
                ].filter(Boolean).join(' · ') || '—'}
              </div>
            ) : null}
          </div>

          <div className="order-items-editor">
            <div className="order-items-editor-header">
              <div className="modal-title" style={{ fontSize: 16 }}>Изделия заказа</div>
            </div>

            {(Array.isArray(orderPreview.items) && orderPreview.items.length > 0) ? orderPreview.items.map((item, index) => {
              const orderAttachments = getItemAttachments(item, 'order');
              const paintAttachments = getItemAttachments(item, 'paint');
              const packageItems = normalizePackageItems(item.packageItems, item.packageName);
              return (
                <div key={item.itemId || `order-preview-item-${index}`} className="order-item-editor-card">
                  <div className="order-item-editor-card-header">
                    <div>
                      <div className="order-item-editor-title">
                        {item.name || `Изделие ${index + 1}`}
                      </div>
                      <div className="order-item-editor-subtitle">
                        {item.itemNumber ? `№ изделия: ${item.itemNumber}` : `Изделие ${index + 1}`}
                        {item.room ? ` · ${item.room}` : ''}
                        {item.roomNumber ? ` · помещение ${item.roomNumber}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="panel-info-grid">
                    <div className="detail-block">
                      <div className="detail-label">Наименование</div>
                      <div className="detail-value detail-value-multiline">{item.name || '—'}</div>
                    </div>
                    <div className="detail-block">
                      <div className="detail-label">Кол-во</div>
                      <div className="detail-value">{item.quantity || '—'}</div>
                    </div>
                    <div className="detail-block">
                      <div className="detail-label">Помещение</div>
                      <div className="detail-value">{item.room || '—'}</div>
                    </div>
                    <div className="detail-block">
                      <div className="detail-label">№ помещения</div>
                      <div className="detail-value">{item.roomNumber || '—'}</div>
                    </div>
                    <div className="detail-block">
                      <div className="detail-label">Материал</div>
                      <div className="detail-value detail-value-multiline">{item.material || '—'}</div>
                    </div>
                    <div className="detail-block">
                      <div className="detail-label">Отгрузка до</div>
                      <div className="detail-value">{formatDateDisplay(item.deliveryDate)}</div>
                    </div>
                    <div className="detail-block detail-block-wide">
                      <div className="detail-label">Ссылка / фото</div>
                      <div className="detail-value detail-value-multiline">
                        {item.photoLink ? <a className="table-inline-link" href={item.photoLink} target="_blank" rel="noreferrer">{item.photoLink}</a> : '—'}
                      </div>
                    </div>
                    <div className="detail-block detail-block-wide">
                      <div className="detail-label">Примечания</div>
                      <div className="detail-value detail-value-multiline">{item.notes || '—'}</div>
                    </div>
                    <div className="detail-block detail-block-wide">
                      <div className="detail-label">Комплектация</div>
                      <div className="detail-value detail-value-multiline">
                        {packageItems.length > 0
                          ? packageItems.map((packageItem) => `${packageItem.completed ? '[x]' : '[ ]'} ${packageItem.name}`).join('\n')
                          : (item.packageName || '—')}
                      </div>
                    </div>
                    <div className="detail-block detail-block-wide">
                      <div className="detail-label">Файлы карточки заказа</div>
                      <div className="detail-value detail-value-multiline">
                        {orderAttachments.length > 0 ? orderAttachments.map((attachment) => attachment.name || 'Без названия').join('\n') : '—'}
                      </div>
                    </div>
                    <div className="detail-block detail-block-wide">
                      <div className="detail-label">Файлы покраски</div>
                      <div className="detail-value detail-value-multiline">
                        {paintAttachments.length > 0 ? paintAttachments.map((attachment) => attachment.name || 'Без названия').join('\n') : '—'}
                      </div>
                    </div>
                    <div className="detail-block detail-block-wide">
                      <div className="detail-label">Комментарии</div>
                      <div className="detail-value detail-value-multiline">
                        {Array.isArray(item.comments) && item.comments.length > 0
                          ? item.comments.map((comment) => `${comment.role || 'comment'}: ${comment.text || ''}`).join('\n')
                          : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="mobile-empty-state">В заказе пока нет изделий.</div>
            )}
          </div>

          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setOrderPreview(null)}>Закрыть</Button>
          </div>
        </Modal>
      ) : null}

      {attachmentPreview ? (
        <Modal open={Boolean(attachmentPreview)} onClose={closeAttachmentPreview} size="xl" className="order-form-modal">
          <ModalHeader
            title={attachmentPreview.name || 'Просмотр файла'}
            subtitle={attachmentPreview.kindLabel || 'Изображение'}
            onClose={closeAttachmentPreview}
          />
          <div className="attachment-preview-panel">
            <div className="attachment-preview-toolbar">
              <div className="attachment-preview-toolbar-meta">
                <span className="attachment-preview-toolbar-kind">{attachmentPreview.kindLabel || 'Файл'}</span>
                {attachmentPreview.sizeLabel ? (
                  <span className="attachment-preview-toolbar-size">{attachmentPreview.sizeLabel}</span>
                ) : null}
              </div>
              {attachmentPreview.orderId && attachmentPreview.attachment ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleDownloadAttachment(attachmentPreview.orderId, attachmentPreview.itemId, attachmentPreview.attachment, attachmentPreview.scope || 'order')}
                  disabled={attachmentOpeningKey === `${getAttachmentTargetKey(attachmentPreview.orderId, attachmentPreview.itemId, attachmentPreview.scope || 'order')}:${attachmentPreview.attachment.attachmentId}:download`}
                >
                  {attachmentOpeningKey === `${getAttachmentTargetKey(attachmentPreview.orderId, attachmentPreview.itemId, attachmentPreview.scope || 'order')}:${attachmentPreview.attachment.attachmentId}:download` ? 'Скачивание...' : 'Скачать'}
                </Button>
              ) : null}
            </div>
            <div
              className={cn(
                'attachment-preview-wrap',
                attachmentPreview.mode === 'image' && 'attachment-preview-wrap-image',
                attachmentPreview.mode === 'pdf' && 'attachment-preview-wrap-pdf',
                attachmentPreview.mode === 'word' && 'attachment-preview-wrap-document',
                attachmentPreview.mode === 'spreadsheet' && 'attachment-preview-wrap-sheet',
              )}
            >
              {attachmentPreview.mode === 'image' ? (
                <img src={attachmentPreview.url} alt={attachmentPreview.name || 'Изображение'} className="attachment-preview-image" />
              ) : null}
              {attachmentPreview.mode === 'pdf' ? (
                <iframe
                  title={attachmentPreview.name || 'PDF'}
                  src={attachmentPreview.url}
                  className="attachment-preview-frame"
                />
              ) : null}
              {attachmentPreview.mode === 'word' ? (
                <div
                  className="attachment-preview-document"
                  dangerouslySetInnerHTML={{ __html: attachmentPreview.html || '<p>Пустой документ.</p>' }}
                />
              ) : null}
              {attachmentPreview.mode === 'spreadsheet' ? (
                <div className="attachment-preview-sheet-view">
                  <div className="attachment-preview-sheet-tabs">
                    {(attachmentPreview.sheets || []).map((sheet, index) => (
                      <button
                        key={`${sheet.name}-${index}`}
                        type="button"
                        className={cn(
                          'attachment-preview-sheet-tab',
                          index === (attachmentPreview.activeSheetIndex || 0) && 'attachment-preview-sheet-tab-active',
                        )}
                        onClick={() => setAttachmentPreview((current) => current ? {
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
                      const activeSheet = (attachmentPreview.sheets || [])[attachmentPreview.activeSheetIndex || 0];
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
                        {(((attachmentPreview.sheets || [])[attachmentPreview.activeSheetIndex || 0]?.rows) || []).map((row, rowIndex) => (
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
              ) : null}
            </div>
          </div>
        </Modal>
      ) : null}

      {qrPreview ? (
        <Modal open={Boolean(qrPreview)} onClose={() => setQrPreview(null)} closeDisabled={Boolean(downloadingKey)} size="sm" className="qr-preview-modal">
          <div className="modal-title mb-16">QR-код заказа {qrPreview.orderNumber ? `№ ${qrPreview.orderNumber}` : ''}</div>
          <div className="modal-subtitle mb-16">
            {qrPreview.itemName || 'Изделие'}{qrPreview.itemNumber ? ` · позиция ${qrPreview.itemNumber}` : ''}
          </div>
            <img
              src={`/api/orders/${qrPreview.orderId}/items/${qrPreview.itemId}/qrcode`}
              alt="QR Code"
              className="qr-image"
            />
            <div className="modal-actions modal-actions-between">
              <Button variant="secondary" onClick={() => setQrPreview(null)} disabled={Boolean(downloadingKey)}>
                Закрыть
              </Button>
              <div className="modal-actions-group">
                <Button
                  variant="primary"
                  onClick={() => handleDownloadQr(qrPreview.orderId, qrPreview.itemId, qrPreview.fileNameBase)}
                  disabled={downloadingKey === `${qrPreview.orderId}:${qrPreview.itemId}`}
                >
                  {downloadingKey === `${qrPreview.orderId}:${qrPreview.itemId}` ? 'Скачивание...' : 'Скачать'}
                </Button>
                <Button variant="secondary" onClick={handlePrintQr}>
                  Печать
                </Button>
              </div>
            </div>
        </Modal>
      ) : null}

      {orderActionsOrder ? (
        <Modal open={Boolean(orderActionsOrder)} onClose={() => setOrderActionsOrder(null)} size="sm">
          <ModalHeader
            title="Действия над заказом"
            subtitle={
              <>
                {orderActionsOrder.orderNumber ? `Заказ № ${orderActionsOrder.orderNumber}` : 'Без номера'}
                {orderActionsOrder.customer ? ` · ${orderActionsOrder.customer}` : ''}
              </>
            }
            onClose={() => setOrderActionsOrder(null)}
          />

            <div className="order-actions-modal-list">
              <Button
                variant="primary"
                className="order-actions-modal-btn"
                onClick={() => {
                  setOrderActionsOrder(null);
                  openEditForm(orderActionsOrder);
                }}
              >
                Редактировать весь заказ
              </Button>
              <Button
                variant="secondary"
                className="order-actions-modal-btn"
                onClick={() => {
                  setOrderActionsOrder(null);
                  openEditRoomEditor(orderActionsOrder);
                }}
                disabled={!Array.isArray(orderActionsOrder.items) || orderActionsOrder.items.length === 0}
              >
                Редактировать помещения и изделия
              </Button>
              {(orderDraftKeys[orderActionsOrder._id || orderActionsOrder.orderNumber || ''] || []).length > 0 ? (
                <Button
                  variant="secondary"
                  className="order-actions-modal-btn"
                  onClick={() => {
                    cancelOrderInlineEdits(orderActionsOrder._id || orderActionsOrder.orderNumber || '');
                    setOrderActionsOrder(null);
                  }}
                >
                  Отменить быстрые правки по заказу
                </Button>
              ) : null}
              <Button
                variant="danger"
                className="order-actions-modal-btn"
                onClick={() => {
                  requestDelete(orderActionsOrder);
                  setOrderActionsOrder(null);
                }}
              >
                Удалить заказ
              </Button>
            </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Удалить заказ?"
        message={confirmDelete ? `Заказ № ${confirmDelete.orderNumber || '—'} будет удален без возможности восстановления.\nОсновное изделие: ${confirmDelete.name || '—'}\nЗаказчик: ${confirmDelete.customer || '—'}` : ''}
        confirmLabel="Удалить заказ"
        onConfirm={handleDelete}
        onCancel={() => !deletingOrder && setConfirmDelete(null)}
        loading={deletingOrder}
      />

      <ConfirmDialog
        open={Boolean(confirmAttachmentDelete)}
        title="Удалить файл?"
        message={confirmAttachmentDelete ? `Файл "${confirmAttachmentDelete.attachmentName}" ${getAttachmentScopeConfig(confirmAttachmentDelete.scope).deleteMessage}` : ''}
        confirmLabel="Удалить файл"
        onConfirm={() => performDeleteAttachment(confirmAttachmentDelete?.orderId || '', confirmAttachmentDelete?.itemId || '', confirmAttachmentDelete?.attachmentId || '', confirmAttachmentDelete?.scope || 'order')}
        onCancel={() => !attachmentDeletingKey && setConfirmAttachmentDelete(null)}
        loading={Boolean(confirmAttachmentDelete && attachmentDeletingKey === `${getAttachmentTargetKey(confirmAttachmentDelete.orderId, confirmAttachmentDelete.itemId, confirmAttachmentDelete.scope || 'order')}:${confirmAttachmentDelete.attachmentId}`)}
      />

      <ConfirmDialog
        open={Boolean(confirmAttachmentOverwrite)}
        title="Перезаписать файл?"
        message={confirmAttachmentOverwrite ? `${confirmAttachmentOverwrite.kind === 'link' ? 'Ссылка' : 'Файл'} "${confirmAttachmentOverwrite.attachmentName}" уже загружен${confirmAttachmentOverwrite.orderNumber ? ` в заказ № ${confirmAttachmentOverwrite.orderNumber}` : ''}${confirmAttachmentOverwrite.itemName ? ` · ${confirmAttachmentOverwrite.itemName}` : ''}${confirmAttachmentOverwrite.itemNumber ? ` · позиция ${confirmAttachmentOverwrite.itemNumber}` : ''}.\nСтарая версия будет заменена новой.` : ''}
        confirmLabel={confirmAttachmentOverwrite?.kind === 'link' ? 'Перезаписать ссылку' : 'Перезаписать файл'}
        onConfirm={performOverwriteAttachment}
        onCancel={() => !attachmentUploadingTargetKey && setConfirmAttachmentOverwrite(null)}
        loading={Boolean(confirmAttachmentOverwrite && attachmentUploadingTargetKey === getAttachmentTargetKey(confirmAttachmentOverwrite.orderId, confirmAttachmentOverwrite.itemId, confirmAttachmentOverwrite.scope || 'order'))}
      />
    </div>
  );
}

export default OrdersWorkspace;
