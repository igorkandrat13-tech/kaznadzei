const crypto = require('crypto');
const QRCode = require('qrcode');
const SettingsStore = require('../stores/settingsStore');
const OrderStore = require('../stores/orderStore');
const CustomerStore = require('../stores/customerStore');
const CustomerTelegramAccessStore = require('../stores/customerTelegramAccessStore');
const CustomerTelegramLogStore = require('../stores/customerTelegramLogStore');
const { getBotInfo, sendMessage } = require('./telegramService');
const { addTelegramDiagnosticLog } = require('./telegramDiagnostics');

const CUSTOMER_START_PREFIX = 'customer_';
const CUSTOMER_FULL_ORDER_BUTTON_TEXT = '📋 Весь заказ';
const CUSTOMER_BACK_TO_ITEMS_BUTTON_PREFIX = '⬅️ Назад к изделиям';
const CUSTOMER_CALLBACK_PREFIX = 'customer';
const CUSTOMER_CALLBACK_ACTION_ORDER = 'order';
const CUSTOMER_CALLBACK_ACTION_ITEM = 'item';
const customerChatOrderContext = new Map();
const ORDER_PRIMARY_HEADERS = [
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
  'Заявки на расходники',
  'Покраска',
  'Начало изготовления изделия',
  'Окончание изготовления изделия',
  'Время изготовления изделий',
  'Время изготовления заказа',
];
const ORDER_COLUMN_KEY_TO_PRIMARY_INDEX = {
  orderNumber: ORDER_PRIMARY_HEADERS.indexOf('Номер заказа'),
  customer: ORDER_PRIMARY_HEADERS.indexOf('Заказчик'),
  room: ORDER_PRIMARY_HEADERS.indexOf('Помещение'),
  roomNumber: ORDER_PRIMARY_HEADERS.indexOf('№ помещения'),
  itemNumber: ORDER_PRIMARY_HEADERS.indexOf('№ изделия в заказе'),
  quantity: ORDER_PRIMARY_HEADERS.indexOf('Кол-во изделй'),
  name: ORDER_PRIMARY_HEADERS.indexOf('Наименование'),
  orderCard: ORDER_PRIMARY_HEADERS.indexOf('Карточка заказа'),
  packageName: ORDER_PRIMARY_HEADERS.indexOf('Комплектация заказа'),
  notes: ORDER_PRIMARY_HEADERS.indexOf('Примечания'),
  deliveryDate: ORDER_PRIMARY_HEADERS.indexOf('Отгрузка до'),
  carpenter: ORDER_PRIMARY_HEADERS.indexOf('СТОЛЯР'),
  materialRequests: ORDER_PRIMARY_HEADERS.indexOf('Заявки на расходники'),
  paint: ORDER_PRIMARY_HEADERS.indexOf('Покраска'),
  itemStartDate: ORDER_PRIMARY_HEADERS.indexOf('Начало изготовления изделия'),
  itemEndDate: ORDER_PRIMARY_HEADERS.indexOf('Окончание изготовления изделия'),
  itemDuration: ORDER_PRIMARY_HEADERS.indexOf('Время изготовления изделий'),
  duration: ORDER_PRIMARY_HEADERS.indexOf('Время изготовления заказа'),
};
const PRIMARY_INDEX_TO_ORDER_COLUMN_KEY = Object.entries(ORDER_COLUMN_KEY_TO_PRIMARY_INDEX).reduce((acc, [columnKey, index]) => {
  if (Number.isInteger(index)) {
    acc[index] = columnKey;
  }
  return acc;
}, {});
const ORDER_MANUFACTURING_REQUIRED_COLUMN_KEYS = [
  'room',
  'roomNumber',
  'itemNumber',
  'quantity',
  'name',
  'orderCard',
  'packageName',
  'notes',
  'deliveryDate',
  'carpenter',
  'materialRequests',
  'paint',
];
const ORDER_TRACKED_PRIMARY_START_INDEX = ORDER_COLUMN_KEY_TO_PRIMARY_INDEX.room;
const ORDER_TRACKED_PRIMARY_END_INDEX = ORDER_COLUMN_KEY_TO_PRIMARY_INDEX.duration;

function getConfiguredBotToken() {
  return String(SettingsStore.get().telegramBotToken || '').trim();
}

function createAccessToken() {
  return crypto.randomBytes(16).toString('hex');
}

function getLatestTimestamp(...timestamps) {
  return timestamps
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort()
    .at(-1) || '';
}

function getEarliestTimestamp(...timestamps) {
  return timestamps
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort()
    .at(0) || '';
}

function formatDateLabel(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return 'не указана';
  const plainDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plainDateMatch) {
    return `${plainDateMatch[3]}.${plainDateMatch[2]}.${plainDateMatch[1]}`;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleDateString('ru-RU');
}

function truncateTelegramLabel(value = '', maxLength = 26) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function rememberCustomerChatOrderContext(chatId = '', access = null) {
  const normalizedChatId = String(chatId || '').trim();
  const normalizedAccess = access ? CustomerTelegramAccessStore.findById(access._id || access.accessId || access.id) || access : null;
  if (!normalizedChatId || !normalizedAccess?._id) return;
  customerChatOrderContext.set(normalizedChatId, {
    accessId: String(normalizedAccess._id || '').trim(),
    updatedAt: Date.now(),
  });
}

function resolveRememberedCustomerAccess(accesses = [], chatId = '') {
  const normalizedChatId = String(chatId || '').trim();
  if (!normalizedChatId) return null;
  const context = customerChatOrderContext.get(normalizedChatId);
  if (!context?.accessId) return null;
  return (Array.isArray(accesses) ? accesses : []).find((access) => (
    String(access?._id || access?.accessId || access?.id || '').trim() === context.accessId
  )) || null;
}

function normalizeTelegramButtonText(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function buildTelegramProgressBar(completed = 0, total = 0, { segments = 8 } = {}) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeCompleted = Math.max(0, Math.min(safeTotal, Number(completed) || 0));
  if (!safeTotal) {
    return { bar: '⬜⬜⬜⬜⬜⬜⬜⬜', percent: 0 };
  }
  const percent = Math.round((safeCompleted / safeTotal) * 100);
  const filledSegments = Math.max(0, Math.min(segments, Math.round((safeCompleted / safeTotal) * segments)));
  return {
    bar: `${'🟩'.repeat(filledSegments)}${'⬜'.repeat(Math.max(0, segments - filledSegments))}`,
    percent,
  };
}

function getStageStatusMarker(status = '', legendKey = '') {
  const normalizedStatus = String(status || '').trim();
  const normalizedLegendKey = String(legendKey || '').trim();
  if (normalizedStatus !== 'completed') return '⬜';
  if (normalizedLegendKey === 'stock') return '🟦';
  if (normalizedLegendKey === 'assembly') return '🟧';
  if (normalizedLegendKey === 'paint') return '🟪';
  if (normalizedLegendKey === 'postpaint') return '🟥';
  if (normalizedLegendKey === 'ready') return '🟩';
  if (normalizedLegendKey === 'brief' || normalizedLegendKey === 'drafting') return '🟩';
  return '⬜';
}

function getItemActiveRoleStage(item = {}, role = '') {
  return (Array.isArray(item?.stages) ? item.stages : []).find((stage) => stage?.role === role && stage?.status === 'in_progress') || null;
}

function getItemActiveStage(item = {}) {
  return (Array.isArray(item?.stages) ? item.stages : []).find((stage) => stage?.status === 'in_progress') || null;
}

function getItemAssignedStage(item = {}) {
  const stages = Array.isArray(item?.stages) ? item.stages : [];
  const stagesWithEmployee = stages.filter((stage) => String(stage?.employeeName || '').trim());
  if (stagesWithEmployee.length === 0) return null;

  const inProgressStages = stagesWithEmployee.filter((stage) => stage?.status === 'in_progress');
  const candidates = inProgressStages.length > 0 ? inProgressStages : stagesWithEmployee;
  return candidates.reduce((currentStage, stage) => {
    if (!currentStage) return stage;
    const currentTs = Date.parse(currentStage.startedAt || currentStage.completedAt || '') || 0;
    const nextTs = Date.parse(stage.startedAt || stage.completedAt || '') || 0;
    return nextTs >= currentTs ? stage : currentStage;
  }, null);
}

function getItemEffectiveColumnTimestamp(item = {}, columnKey = '') {
  const normalizedColumnKey = String(columnKey || '').trim();
  if (!normalizedColumnKey) return '';

  const manualStageMarks = item?.manualStageMarks && typeof item.manualStageMarks === 'object'
    ? item.manualStageMarks
    : {};
  const manualStageClears = item?.manualStageClears && typeof item.manualStageClears === 'object'
    ? item.manualStageClears
    : {};

  if (manualStageClears[normalizedColumnKey]) return '';

  const manualMark = manualStageMarks[normalizedColumnKey] || null;
  const manualMarkLegendKey = String(manualMark?.legendKey || '').trim();
  if ((normalizedColumnKey === 'itemStartDate' || normalizedColumnKey === 'itemEndDate') && manualMarkLegendKey) {
    return '';
  }

  const updatedAt = String(manualMark?.updatedAt || '').trim();
  if (updatedAt) return updatedAt;

  if (normalizedColumnKey === 'orderCard' || normalizedColumnKey === 'paint') {
    const fieldName = normalizedColumnKey === 'paint' ? 'paintAttachments' : 'attachments';
    const attachments = Array.isArray(item?.[fieldName]) ? item[fieldName] : [];
    return getLatestTimestamp(...attachments.map((attachment) => (
      attachment?.uploadedAt || attachment?.createdAt || attachment?.updatedAt || ''
    )));
  }

  if (normalizedColumnKey === 'packageName' || normalizedColumnKey === 'materialRequests') {
    return '';
  }

  if (normalizedColumnKey !== 'carpenter') return '';

  const carpenterAssignment = item?.workerAssignments?.carpenter || null;
  const carpenterActiveStage = getItemActiveRoleStage(item, 'carpenter');
  const activeStage = getItemActiveStage(item);
  const assignedStage = getItemAssignedStage(item);
  const workerStageForText = assignedStage || carpenterActiveStage || activeStage || null;
  const earliestAutoAt = getEarliestTimestamp(
    carpenterAssignment?.scannedAt,
    carpenterActiveStage?.startedAt,
    workerStageForText?.startedAt,
  );
  return (carpenterAssignment || workerStageForText)
    ? earliestAutoAt
    : '';
}

function getItemManufacturingMeta(item = {}) {
  const explicitStartAt = getItemEffectiveColumnTimestamp(item, 'itemStartDate');
  const triggerStartAt = getItemEffectiveColumnTimestamp(item, 'room');
  const startAt = explicitStartAt || triggerStartAt || '';
  const explicitEndAt = getItemEffectiveColumnTimestamp(item, 'itemEndDate');
  const completionTimestamps = ORDER_MANUFACTURING_REQUIRED_COLUMN_KEYS.map((columnKey) => (
    getItemEffectiveColumnTimestamp(item, columnKey)
  ));
  const isCompleted = completionTimestamps.every(Boolean);
  const endAt = explicitEndAt || (isCompleted ? getLatestTimestamp(...completionTimestamps) : '');

  return {
    startAt,
    endAt,
    isCompleted,
  };
}

function getTrackedSecondaryHeaderCells() {
  const settings = SettingsStore.get();
  const secondaryHeaders = Array.isArray(settings?.orderStageLegendConfig?.secondaryHeaders)
    ? settings.orderStageLegendConfig.secondaryHeaders
    : [];
  let startIndex = 0;
  return secondaryHeaders
    .map((header) => {
      const span = Number(header?.colSpan) || 1;
      const cell = {
        ...header,
        startIndex,
        endIndex: startIndex + span - 1,
      };
      startIndex += span;
      return cell;
    })
    .filter((header) => (
      String(header?.legendKey || '').trim()
      && header.endIndex >= ORDER_TRACKED_PRIMARY_START_INDEX
      && header.startIndex <= ORDER_TRACKED_PRIMARY_END_INDEX
    ));
}

function getTrackedStageLabel(header = {}) {
  const label = String(header?.label || '').trim();
  if (label === 'Готово') return 'Заказ готов';
  return label || 'Этап';
}

function getItemTrackedStageProgress(order = {}, item = {}) {
  const headers = getTrackedSecondaryHeaderCells();
  return headers.map((header) => {
    const columnIndexes = [];
    for (let columnIndex = Math.max(header.startIndex, ORDER_TRACKED_PRIMARY_START_INDEX); columnIndex <= Math.min(header.endIndex, ORDER_TRACKED_PRIMARY_END_INDEX); columnIndex += 1) {
      columnIndexes.push(columnIndex);
    }

    const cells = columnIndexes
      .map((columnIndex) => {
        const columnKey = PRIMARY_INDEX_TO_ORDER_COLUMN_KEY[columnIndex] || '';
        if (!columnKey) return null;
        let value = getItemEffectiveColumnTimestamp(item, columnKey);
        if (!value && (columnKey === 'itemStartDate' || columnKey === 'itemEndDate' || columnKey === 'itemDuration')) {
          const itemMeta = getItemManufacturingMeta(item);
          if (columnKey === 'itemStartDate') value = itemMeta.startAt;
          if (columnKey === 'itemEndDate') value = itemMeta.endAt;
          if (columnKey === 'itemDuration' && itemMeta.isCompleted) value = itemMeta.endAt || itemMeta.startAt;
        }
        if (!value && columnKey === 'duration') {
          const orderMeta = OrderStore.deriveOrderManufacturingMeta(order);
          if (orderMeta.isCompleted) {
            value = orderMeta.endAt || orderMeta.startAt;
          }
        }
        return {
          columnKey,
          value,
          isCompleted: Boolean(value),
        };
      })
      .filter(Boolean);

    const completedCount = cells.filter((cell) => cell.isCompleted).length;
    const totalCount = cells.length;
    let status = 'pending';
    if (completedCount > 0 && completedCount < totalCount) {
      status = 'in_progress';
    } else if (totalCount > 0 && completedCount === totalCount) {
      status = 'completed';
    }

    return {
      key: `${String(header?.legendKey || '').trim()}-${header.startIndex}-${header.endIndex}`,
      legendKey: String(header?.legendKey || '').trim(),
      label: getTrackedStageLabel(header),
      status,
      completedCount,
      totalCount,
    };
  });
}

function getItemProgressSnapshot(order = {}, item = {}) {
  const stageProgress = getItemTrackedStageProgress(order, item);
  const total = stageProgress.reduce((sum, stage) => sum + stage.totalCount, 0);
  const completed = stageProgress.reduce((sum, stage) => sum + stage.completedCount, 0);
  return {
    total,
    completed,
    ...buildTelegramProgressBar(completed, total),
  };
}

function getOrderProgressSnapshot(order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const snapshots = items.map((item) => getItemProgressSnapshot(order, item));
  const total = snapshots.reduce((sum, snapshot) => sum + snapshot.total, 0);
  const completed = snapshots.reduce((sum, snapshot) => sum + snapshot.completed, 0);
  return {
    total,
    completed,
    ...buildTelegramProgressBar(completed, total),
  };
}

function buildCustomerOrderInlineKeyboard(access = {}, order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const buttons = items.map((item, index) => {
    const progress = getItemProgressSnapshot(order, item);
    return {
      text: `${truncateTelegramLabel(getOrderItemDisplayName(item, index), 20)} ${buildTelegramProgressBar(progress.completed, progress.total, { segments: 5 }).bar} ${progress.percent}%`,
      callback_data: `${CUSTOMER_CALLBACK_PREFIX}|${CUSTOMER_CALLBACK_ACTION_ITEM}|${String(access?._id || '').trim()}|${String(item?.itemId || '').trim()}`,
    };
  }).filter((button) => button.callback_data.split('|')[3]);

  if (buttons.length === 0) return [];

  const rows = [];
  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }
  return rows;
}

function getCustomerBackToItemsButtonText(access = {}) {
  const { order } = getCustomerAccessContext(access);
  const orderNumber = String(order?.orderNumber || '').trim();
  return orderNumber
    ? `${CUSTOMER_BACK_TO_ITEMS_BUTTON_PREFIX} Заказ ${orderNumber}`
    : CUSTOMER_BACK_TO_ITEMS_BUTTON_PREFIX;
}

function getCustomerItemButtonText(access = {}, order = {}, item = {}, index = 0) {
  const itemNumber = String(item?.itemNumber || index + 1).trim() || String(index + 1);
  const itemName = truncateTelegramLabel(String(item?.name || '').trim() || `Изделие ${itemNumber}`, 28);
  return normalizeTelegramButtonText(
    `Изделие № ${itemNumber} - ${itemName}`
  );
}

function buildCustomerOrderReplyKeyboard(access = {}, order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const rows = [
    [{ text: CUSTOMER_FULL_ORDER_BUTTON_TEXT }],
    ...items
    .map((item, index) => {
      const buttonText = getCustomerItemButtonText(access, order, item, index);
      return buttonText ? [{ text: buttonText }] : null;
    })
    .filter(Boolean),
  ];
  return rows;
}

function parseCustomerItemButtonText(text = '') {
  const normalized = normalizeTelegramButtonText(text);
  const match = normalized.match(/^Изделие\s*№\s*(.+?)\s*-\s*(.+)$/i);
  if (!match) return null;
  return {
    itemNumber: String(match[1] || '').trim(),
    itemName: String(match[2] || '').trim(),
  };
}

function parseCustomerBackToItemsButtonText(text = '') {
  const normalized = normalizeTelegramButtonText(text);
  const match = normalized.match(/^⬅️\s*Назад к изделиям(?:\s+Заказ\s+(.+))?$/i);
  if (!match) return null;
  return {
    orderNumber: String(match[1] || '').trim(),
  };
}

function resolveCustomerAccessByOrderNumber(accesses = [], orderNumber = '') {
  const normalizedOrderNumber = String(orderNumber || '').trim();
  if (!normalizedOrderNumber) return null;
  return (Array.isArray(accesses) ? accesses : []).find((access) => {
    const { order } = getCustomerAccessContext(access);
    return String(order?.orderNumber || '').trim() === normalizedOrderNumber;
  }) || null;
}

function resolveCustomerItemSelectionFromText(accesses = [], text = '', options = {}) {
  const parsed = parseCustomerItemButtonText(text);
  if (!parsed) return null;

  const rememberedAccess = resolveRememberedCustomerAccess(accesses, options.chatId);
  const orderedAccesses = rememberedAccess
    ? [rememberedAccess, ...(Array.isArray(accesses) ? accesses : []).filter((access) => access !== rememberedAccess)]
    : (Array.isArray(accesses) ? accesses : []);

  for (const access of orderedAccesses) {
    const { order } = getCustomerAccessContext(access);
    const items = Array.isArray(order?.items) ? order.items : [];
    const item = items.find((entry, index) => {
      const itemNumber = String(entry?.itemNumber || index + 1).trim() || String(index + 1);
      const itemName = truncateTelegramLabel(String(entry?.name || '').trim() || `Изделие ${itemNumber}`, 28);
      return itemNumber === parsed.itemNumber && itemName === parsed.itemName;
    }) || null;

    if (item) {
      return {
        access,
        itemId: String(item?.itemId || '').trim(),
      };
    }
  }

  return null;
}

function resolveCustomerBackToItemsFromText(accesses = [], text = '') {
  const parsed = parseCustomerBackToItemsButtonText(text);
  if (!parsed) return null;
  if (parsed.orderNumber) {
    return resolveCustomerAccessByOrderNumber(accesses, parsed.orderNumber);
  }
  return (Array.isArray(accesses) ? accesses[0] : null) || null;
}

function buildCustomerOrderCardItemsLines(order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length === 0) return [];

  const lines = ['Изделия:'];
  items.forEach((item, index) => {
    const itemNumber = String(item?.itemNumber || index + 1).trim() || String(index + 1);
    const itemName = String(item?.name || '').trim() || `Изделие ${itemNumber}`;
    const itemProgress = getItemProgressSnapshot(order, item);
    lines.push(`Изделие № ${itemNumber}`);
    lines.push(itemName);
    lines.push(`${itemProgress.bar} ${itemProgress.percent}%`);
  });
  return lines;
}

function buildCustomerOrderLaunchSummary(access = {}) {
  const { order } = getCustomerAccessContext(access);
  return [
    `№ Заказа ${String(order?.orderNumber || '').trim() || 'не указан'}`,
    `Всего в заказе ${getOrderItemCount(order)} изделий`,
    `Статус заказа: ${getReadableOrderStatus(order)}`,
  ];
}

function getCustomerOrderCardMessage(access = {}) {
  const { order } = getCustomerAccessContext(access);
  const progress = getOrderProgressSnapshot(order);
  const text = [
    'Весь заказ',
    `Статус заказа: ${getReadableOrderStatus(order)}`,
    `Общая готовность заказа: ${progress.percent}%`,
    `Всего изделий в заказе: ${getOrderItemCount(order)}`,
    '________________',
    ...buildCustomerOrderCardItemsLines(order),
    'Нажмите на изделие ниже, чтобы открыть его карточку.',
  ].filter(Boolean).join('\n');

  const replyKeyboard = buildCustomerOrderReplyKeyboard(access, order);
  return {
    text,
    extra: replyKeyboard.length > 0
      ? {
          reply_markup: {
            keyboard: replyKeyboard,
            resize_keyboard: true,
            is_persistent: true,
            one_time_keyboard: false,
            input_field_placeholder: 'Выберите изделие',
          },
        }
      : {},
  };
}

function getCustomerItemCardMessage(access = {}, itemId = '') {
  const { order } = getCustomerAccessContext(access);
  const items = Array.isArray(order?.items) ? order.items : [];
  const item = items.find((entry) => String(entry?.itemId || '').trim() === String(itemId || '').trim()) || null;
  if (!item) {
    return {
      text: [
        'Карточка изделия',
        `Заказ № ${String(order?.orderNumber || '').trim() || 'не указан'}`,
        'Изделие не найдено. Откройте заказ еще раз и выберите нужное изделие.',
      ].join('\n'),
      extra: {
        reply_markup: {
          keyboard: [
            [{ text: getCustomerBackToItemsButtonText(access) }],
          ],
          resize_keyboard: true,
          is_persistent: true,
          one_time_keyboard: false,
          input_field_placeholder: 'Вернитесь к списку изделий',
        },
      },
    };
  }

  const itemIndex = items.findIndex((entry) => String(entry?.itemId || '').trim() === String(itemId || '').trim());
  const itemNumber = String(item?.itemNumber || itemIndex + 1).trim() || String(itemIndex + 1);
  const itemProgress = getItemProgressSnapshot(order, item);
  const stageLines = getItemTrackedStageProgress(order, item).map((stage) => {
    return `${getStageStatusMarker(stage.status, stage.legendKey)} ${stage.label}`;
  });

  return {
    text: [
      'Карточка изделия',
      `Заказ № ${String(order?.orderNumber || '').trim() || 'не указан'}`,
      `Изделие № ${itemNumber}`,
      `${String(item?.name || '').trim() || `Изделие ${itemNumber}`}`,
      'Готовность изделия:',
      `${itemProgress.bar} ${itemProgress.percent}%`,
      'Стадии:',
      ...stageLines,
    ].filter(Boolean).join('\n'),
    extra: {
      reply_markup: {
        keyboard: [
          [{ text: getCustomerBackToItemsButtonText(access) }],
        ],
        resize_keyboard: true,
        is_persistent: true,
        one_time_keyboard: false,
        input_field_placeholder: 'Вернитесь к выбору изделий',
      },
    },
  };
}

function parseCustomerCallbackData(value = '') {
  const parts = String(value || '').trim().split('|');
  if (parts.length < 3 || parts[0] !== CUSTOMER_CALLBACK_PREFIX) {
    return null;
  }
  const action = String(parts[1] || '').trim();
  const accessId = String(parts[2] || '').trim();
  if (!accessId) return null;
  if (action === CUSTOMER_CALLBACK_ACTION_ORDER) {
    return { action, accessId, itemId: '' };
  }
  if (action === CUSTOMER_CALLBACK_ACTION_ITEM) {
    const itemId = String(parts[3] || '').trim();
    if (!itemId) return null;
    return { action, accessId, itemId };
  }
  return null;
}

function getReadableOrderStatus(order = {}) {
  if (String(order.archivedAt || '').trim()) {
    return 'в архиве';
  }

  const overallStatus = String(OrderStore.getOrderOverallStatus(order) || '').trim();
  if (overallStatus === 'completed') return 'завершен';
  if (overallStatus === 'in_progress') return 'в работе';
  return 'ожидает запуска';
}

function getStatusEmoji(status = '') {
  const normalizedStatus = String(status || '').trim();
  if (normalizedStatus === 'completed' || normalizedStatus === 'завершено' || normalizedStatus === 'завершен') {
    return '✅';
  }
  if (normalizedStatus === 'in_progress' || normalizedStatus === 'в работе') {
    return '🟡';
  }
  if (normalizedStatus === 'archived' || normalizedStatus === 'в архиве') {
    return '📦';
  }
  return '⏳';
}

function getReadableItemStatus(item = {}) {
  const overallStatus = String(
    item?.overallStatus
      || OrderStore.calculateItemOverallStatus(
        Array.isArray(item?.stages) ? item.stages : [],
        item?.manualStageMarks || {}
      )
      || ''
  ).trim();
  if (overallStatus === 'completed') return 'завершено';
  if (overallStatus === 'in_progress') return 'в работе';
  return 'ожидает запуска';
}

function getOrderItemCount(order = {}) {
  return Array.isArray(order?.items) ? order.items.length : 0;
}

function getItemCurrentStageLabel(item = {}) {
  const stages = Array.isArray(item?.stages) ? item.stages : [];
  const activeStage = stages.find((stage) => stage?.status === 'in_progress');
  if (String(activeStage?.stepName || '').trim()) {
    return String(activeStage.stepName).trim();
  }
  if (getReadableItemStatus(item) === 'завершено') {
    const completedStage = [...stages].reverse().find((stage) => stage?.status === 'completed');
    return String(completedStage?.stepName || '').trim() || 'Завершено';
  }
  return '';
}

function getOrderItemDisplayName(item = {}, index = 0) {
  const itemNumber = String(item?.itemNumber || index + 1).trim();
  const itemName = String(item?.name || '').trim() || `Изделие ${itemNumber}`;
  const roomNumber = String(item?.roomNumber || '').trim();
  const roomName = String(item?.room || '').trim();
  const roomLabel = roomNumber
    ? `пом. ${roomNumber}${roomName ? ` (${roomName})` : ''}`
    : roomName;
  return [itemNumber ? `${itemNumber}.` : '', itemName, roomLabel ? `- ${roomLabel}` : '']
    .filter(Boolean)
    .join(' ');
}

function buildCustomerOrderItemsStatusLines(order = {}, { title = '' } = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length === 0) return [];

  const lines = items.map((item, index) => {
    const itemStatus = getReadableItemStatus(item);
    const currentStageLabel = getItemCurrentStageLabel(item);
    return `${getOrderItemDisplayName(item, index)}${currentStageLabel ? ` · ${currentStageLabel}` : ` · ${itemStatus}`}`;
  });

  return [
    title || (items.length > 1 ? 'Изделия:' : 'Изделие:'),
    ...lines,
  ];
}

function buildCustomerOrderProgressSummary(order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length === 0) return '';

  const counts = items.reduce((acc, item) => {
    const itemStatus = getReadableItemStatus(item);
    if (itemStatus === 'завершено') {
      acc.completed += 1;
    } else if (itemStatus === 'в работе') {
      acc.inProgress += 1;
    } else {
      acc.pending += 1;
    }
    return acc;
  }, {
    completed: 0,
    inProgress: 0,
    pending: 0,
  });

  return `Изделий: ${items.length} · Завершено: ${counts.completed} · В работе: ${counts.inProgress} · Ожидают: ${counts.pending}`;
}

function getOrderDisplayName(order = {}) {
  const itemCount = getOrderItemCount(order);
  return [
    String(order.orderNumber || '').trim(),
    itemCount > 0 ? `${itemCount} изд.` : '',
  ].filter(Boolean).join(' · ');
}

function getCustomerDisplayName(customer = {}) {
  return String(customer.fullName || '').trim() || 'Заказчик';
}

function getCustomerAccessContext(access = {}) {
  const customer = CustomerStore.findById(access.customerId) || null;
  const order = OrderStore.findById(access.orderId) || null;
  return { customer, order };
}

async function buildCustomerSharePayload(access = {}) {
  const token = getConfiguredBotToken();
  if (!token) {
    throw new Error('Токен Telegram-бота не настроен.');
  }

  const bot = await getBotInfo(token);
  const botUsername = String(bot?.username || '').trim();
  if (!botUsername) {
    throw new Error('Не удалось определить username Telegram-бота.');
  }

  const startPayload = `${CUSTOMER_START_PREFIX}${String(access.accessToken || '').trim()}`;
  const deepLinkUrl = `https://t.me/${botUsername}?start=${startPayload}`;
  const qrDataUrl = await QRCode.toDataURL(deepLinkUrl, {
    width: 360,
    margin: 1,
  });

  return {
    startPayload,
    deepLinkUrl,
    qrDataUrl,
    botUsername,
  };
}

function getCustomerSubscriptionReadyText(access = {}) {
  const { customer, order } = getCustomerAccessContext(access);
  return [
    '✅ Доступ к заказу подключен.',
    `${getCustomerDisplayName(customer)}, отслеживание включено.`,
    ...buildCustomerOrderLaunchSummary(access),
    'Для просмотра всего заказа - жмите кнопку Весь заказ.',
  ].filter(Boolean).join('\n');
}

function getCustomerAlreadyLinkedText(accesses = []) {
  const normalizedAccesses = Array.isArray(accesses) ? accesses : [];
  if (normalizedAccesses.length === 0) {
    return 'Уведомления по заказу уже подключены.';
  }

  const blocks = normalizedAccesses.map((access) => (
    buildCustomerOrderLaunchSummary(access).join('\n')
  )).filter(Boolean);

  return [
    'Уведомления уже подключены:',
    ...blocks,
    'Для просмотра всего заказа - жмите кнопку Весь заказ.',
  ].join('\n');
}

function getCustomerKeyboardReplyMarkup() {
  return {
    keyboard: [[{ text: CUSTOMER_FULL_ORDER_BUTTON_TEXT }]],
    resize_keyboard: true,
    is_persistent: true,
    one_time_keyboard: false,
    input_field_placeholder: 'Выберите действие',
  };
}

function getCustomerRemoveKeyboardReplyMarkup() {
  return {
    remove_keyboard: true,
  };
}

function getCustomerFullOrderText(access = {}) {
  return getCustomerOrderCardMessage(access).text;
}

function getCustomerAccessClosedText(order = {}, { hasOtherAccesses = false } = {}) {
  return [
    'Доступ к заказу закрыт.',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    hasOtherAccesses
      ? 'Уведомления по другим вашим заказам остаются активными.'
      : 'Уведомления по этому чату отключены.',
  ].filter(Boolean).join('\n');
}

function getCustomerOrderUpdateItemText(order = {}, item = {}, stageLabel = '', { clear = false } = {}) {
  const itemStatus = getReadableItemStatus(item);
  return [
    'Обновление по заказу',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    `${getOrderItemDisplayName(item)}${stageLabel ? ` · ${stageLabel}` : ''}`,
    `Статус изделия: ${itemStatus}`,
    `Для полного списка изделий нажмите "${CUSTOMER_FULL_ORDER_BUTTON_TEXT}".`,
  ].filter(Boolean).join('\n');
}

function getCustomerOrderChangedItemsText(order = {}, changedItems = [], { clear = false } = {}) {
  const normalizedItems = (Array.isArray(changedItems) ? changedItems : [])
    .filter((entry) => entry?.item);
  if (normalizedItems.length === 0) {
    return [
      'Обновление по заказу',
      `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
      `Для полного списка изделий нажмите "${CUSTOMER_FULL_ORDER_BUTTON_TEXT}".`,
    ].filter(Boolean).join('\n');
  }

  return [
    'Обновление по заказу',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    ...normalizedItems.map(({ item, stageLabel }) => {
      const itemStatus = getReadableItemStatus(item);
      return `${getOrderItemDisplayName(item)}${stageLabel ? ` · ${stageLabel}` : ''}\nСтатус изделия: ${itemStatus}`;
    }),
    `Для полного списка изделий нажмите "${CUSTOMER_FULL_ORDER_BUTTON_TEXT}".`,
  ].filter(Boolean).join('\n');
}

async function sendCustomerTelegramMessage({
  access = null,
  chatId = '',
  telegramUserId = '',
  text = '',
  type = 'message',
  meta = {},
  extra = {},
} = {}) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    return { ok: false, skipped: true, reason: 'EMPTY_TEXT' };
  }

  const normalizedAccess = access ? CustomerTelegramAccessStore.findById(access._id || access.accessId || access.id) || access : null;
  const effectiveChatId = String(chatId || normalizedAccess?.telegramChatId || normalizedAccess?.pendingLinkChatId || '').trim();
  const effectiveTelegramUserId = String(telegramUserId || normalizedAccess?.telegramUserId || normalizedAccess?.pendingLinkTelegramUserId || '').trim();
  const token = getConfiguredBotToken();

  if (!normalizedAccess) {
    addTelegramDiagnosticLog('customer-telegram', 'send.skipped', {
      reason: 'ACCESS_NOT_FOUND',
      type,
      chatId: effectiveChatId,
      telegramUserId: effectiveTelegramUserId,
    });
    return { ok: false, skipped: true, reason: 'ACCESS_NOT_FOUND' };
  }

  if (!token) {
    addTelegramDiagnosticLog('customer-telegram', 'send.skipped', {
      reason: 'BOT_TOKEN_NOT_CONFIGURED',
      accessId: normalizedAccess._id,
      orderId: normalizedAccess.orderId,
      type,
      chatId: effectiveChatId,
      telegramUserId: effectiveTelegramUserId,
    });
    const logEntry = CustomerTelegramLogStore.add({
      customerId: normalizedAccess.customerId,
      orderId: normalizedAccess.orderId,
      accessId: normalizedAccess._id,
      chatId: effectiveChatId,
      telegramUserId: effectiveTelegramUserId,
      type,
      text: normalizedText,
      status: 'skipped',
      errorMessage: 'Токен Telegram-бота не настроен.',
      meta,
    });
    return { ok: false, skipped: true, reason: 'BOT_TOKEN_NOT_CONFIGURED', logEntry };
  }

  if (!effectiveChatId) {
    addTelegramDiagnosticLog('customer-telegram', 'send.skipped', {
      reason: 'CHAT_NOT_LINKED',
      accessId: normalizedAccess._id,
      orderId: normalizedAccess.orderId,
      type,
      chatId: effectiveChatId,
      telegramUserId: effectiveTelegramUserId,
    });
    const logEntry = CustomerTelegramLogStore.add({
      customerId: normalizedAccess.customerId,
      orderId: normalizedAccess.orderId,
      accessId: normalizedAccess._id,
      chatId: effectiveChatId,
      telegramUserId: effectiveTelegramUserId,
      type,
      text: normalizedText,
      status: 'skipped',
      errorMessage: 'Telegram chat еще не привязан к заказчику.',
      meta,
    });
    return { ok: false, skipped: true, reason: 'CHAT_NOT_LINKED', logEntry };
  }

  try {
    if (type === 'customer.order.full' || type === 'customer.order.item') {
      rememberCustomerChatOrderContext(effectiveChatId, normalizedAccess);
    }
    addTelegramDiagnosticLog('customer-telegram', 'send.request', {
      accessId: normalizedAccess._id,
      orderId: normalizedAccess.orderId,
      type,
      chatId: effectiveChatId,
      telegramUserId: effectiveTelegramUserId,
      replyMarkupKind: extra?.reply_markup?.force_reply
        ? 'force_reply'
        : extra?.reply_markup?.keyboard
          ? 'keyboard'
          : extra?.reply_markup?.inline_keyboard
            ? 'inline_keyboard'
          : extra?.reply_markup?.remove_keyboard
            ? 'remove_keyboard'
            : '',
    });
    await sendMessage(token, effectiveChatId, normalizedText, extra);
    addTelegramDiagnosticLog('customer-telegram', 'send.success', {
      accessId: normalizedAccess._id,
      orderId: normalizedAccess.orderId,
      type,
      chatId: effectiveChatId,
      telegramUserId: effectiveTelegramUserId,
    });
    const logEntry = CustomerTelegramLogStore.add({
      customerId: normalizedAccess.customerId,
      orderId: normalizedAccess.orderId,
      accessId: normalizedAccess._id,
      chatId: effectiveChatId,
      telegramUserId: effectiveTelegramUserId,
      type,
      text: normalizedText,
      status: 'sent',
      meta,
    });
    return { ok: true, logEntry };
  } catch (error) {
    addTelegramDiagnosticLog('customer-telegram', 'send.failed', {
      accessId: normalizedAccess._id,
      orderId: normalizedAccess.orderId,
      type,
      chatId: effectiveChatId,
      telegramUserId: effectiveTelegramUserId,
      message: error.message || 'Не удалось отправить сообщение в Telegram.',
    });
    const logEntry = CustomerTelegramLogStore.add({
      customerId: normalizedAccess.customerId,
      orderId: normalizedAccess.orderId,
      accessId: normalizedAccess._id,
      chatId: effectiveChatId,
      telegramUserId: effectiveTelegramUserId,
      type,
      text: normalizedText,
      status: 'failed',
      errorMessage: error.message || 'Не удалось отправить сообщение в Telegram.',
      meta,
    });
    return { ok: false, error, logEntry };
  }
}

function resolveCustomerOrderAccessContext({ customerId, orderId } = {}) {
  const normalizedCustomerId = String(customerId || '').trim();
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedCustomerId || !normalizedOrderId) {
    throw new Error('Не выбран заказ для выдачи Telegram-доступа.');
  }

  const customer = CustomerStore.findById(normalizedCustomerId);
  if (!customer) {
    throw new Error('Заказчик не найден.');
  }

  const order = OrderStore.findById(normalizedOrderId);
  if (!order) {
    throw new Error('Заказ не найден.');
  }
  if (!CustomerStore.isOrderLinked(normalizedCustomerId, order)) {
    throw new Error('Этот заказ не привязан к выбранному заказчику.');
  }

  return {
    customer,
    order,
    customerId: normalizedCustomerId,
    orderId: normalizedOrderId,
  };
}

async function ensureCustomerOrderAccess({ customerId, orderId, rotateCredentials = false } = {}) {
  const context = resolveCustomerOrderAccessContext({ customerId, orderId });
  const prepared = CustomerTelegramAccessStore.ensureAccess({
    customerId: context.customerId,
    orderId: context.orderId,
    createAccessToken,
    rotateCredentials,
  });
  const share = await buildCustomerSharePayload(prepared.access);

  return {
    access: prepared.access,
    createdNewCredentials: prepared.createdNewCredentials,
    ...share,
  };
}

async function issueCustomerOrderAccess({ customerId, orderId } = {}) {
  return ensureCustomerOrderAccess({ customerId, orderId, rotateCredentials: true });
}

async function getCustomerOrderShare(orderId) {
  const access = CustomerTelegramAccessStore.findByOrderId(orderId)[0] || null;
  if (!access) {
    throw new Error('Для заказа еще не создан Telegram-доступ.');
  }
  return {
    access,
    ...(await buildCustomerSharePayload(access)),
  };
}

async function notifyCustomerOrderCreated(order = {}) {
  const access = CustomerTelegramAccessStore.findByOrderId(order._id)[0] || null;
  if (!access) return null;

  const text = [
    'Доступ к заказу готов.',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    `Статус: ${getReadableOrderStatus(order)}`,
    buildCustomerOrderProgressSummary(order),
    'После перехода по ссылке или QR-коду обновления придут сюда.',
  ].filter(Boolean).join('\n');

  return sendCustomerTelegramMessage({
    access,
    text,
    type: 'order.created',
    meta: { orderNumber: order.orderNumber || '' },
  });
}

async function notifyCustomerOrderStatusText(order = {}, text = '', { type = 'order.update', meta = {} } = {}) {
  const access = CustomerTelegramAccessStore.findByOrderId(order._id)[0] || null;
  if (!access) return null;
  return sendCustomerTelegramMessage({
    access,
    text,
    type,
    meta,
    extra: { reply_markup: getCustomerKeyboardReplyMarkup() },
  });
}

async function notifyCustomerOrderArchived(order = {}) {
  const text = [
    'Заказ переведен в архив.',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    buildCustomerOrderProgressSummary(order),
    `Для полного списка изделий нажмите "${CUSTOMER_FULL_ORDER_BUTTON_TEXT}".`,
  ].filter(Boolean).join('\n');
  return notifyCustomerOrderStatusText(order, text, {
    type: 'order.archived',
    meta: { orderNumber: order.orderNumber || '' },
  });
}

async function notifyCustomerOrderRestored(order = {}) {
  const text = [
    'Заказ снова в работе.',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    `Статус: ${getReadableOrderStatus(order)}`,
    buildCustomerOrderProgressSummary(order),
    `Для полного списка изделий нажмите "${CUSTOMER_FULL_ORDER_BUTTON_TEXT}".`,
  ].filter(Boolean).join('\n');
  return notifyCustomerOrderStatusText(order, text, {
    type: 'order.restored',
    meta: { orderNumber: order.orderNumber || '' },
  });
}

function extractCustomerAccessTokenFromStartText(text = '') {
  const normalizedText = String(text || '').trim();
  const match = normalizedText.match(/^\/start(?:\s+(.+))?$/i);
  const payload = String(match?.[1] || '').trim();
  if (!payload.startsWith(CUSTOMER_START_PREFIX)) {
    return '';
  }
  return payload.slice(CUSTOMER_START_PREFIX.length).trim();
}

module.exports = {
  buildCustomerSharePayload,
  getCustomerKeyboardReplyMarkup,
  getCustomerRemoveKeyboardReplyMarkup,
  getCustomerAccessClosedText,
  getCustomerFullOrderText,
  getCustomerBackToItemsButtonText,
  getCustomerOrderCardMessage,
  getCustomerItemCardMessage,
  getCustomerOrderChangedItemsText,
  getCustomerOrderUpdateItemText,
  buildCustomerOrderItemsStatusLines,
  buildCustomerOrderProgressSummary,
  CUSTOMER_FULL_ORDER_BUTTON_TEXT,
  CUSTOMER_CALLBACK_ACTION_ITEM,
  CUSTOMER_CALLBACK_ACTION_ORDER,
  ensureCustomerOrderAccess,
  CUSTOMER_START_PREFIX,
  extractCustomerAccessTokenFromStartText,
  parseCustomerCallbackData,
  resolveCustomerBackToItemsFromText,
  resolveCustomerItemSelectionFromText,
  getCustomerAlreadyLinkedText,
  getCustomerSubscriptionReadyText,
  getCustomerOrderShare,
  issueCustomerOrderAccess,
  notifyCustomerOrderArchived,
  notifyCustomerOrderCreated,
  notifyCustomerOrderRestored,
  notifyCustomerOrderStatusText,
  sendCustomerTelegramMessage,
};
