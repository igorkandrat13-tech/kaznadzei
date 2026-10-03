const {
  normalizeTelegramButtonText,
  truncateTelegramLabel,
  getStageStatusMarker,
  getReadableOrderStatus,
  getReadableItemStatus,
  getOrderItemCount,
  getItemCurrentStageLabel,
  getOrderItemDisplayName,
  getOrderDisplayName,
  getCustomerDisplayName,
} = require('./stageFormatters');
const {
  getItemProgressSnapshot,
  getOrderProgressSnapshot,
  getItemTrackedStageProgress,
} = require('./stageProgress');

const CUSTOMER_START_PREFIX = 'customer_';
const CUSTOMER_FULL_ORDER_BUTTON_TEXT = '📋 Весь заказ';
const CUSTOMER_BACK_TO_ITEMS_BUTTON_PREFIX = '⬅️ Назад к изделиям';
const CUSTOMER_CALLBACK_PREFIX = 'customer';
const CUSTOMER_CALLBACK_ACTION_ORDER = 'order';
const CUSTOMER_CALLBACK_ACTION_ITEM = 'item';
const CUSTOMER_CALLBACK = {
  PREFIX: CUSTOMER_CALLBACK_PREFIX,
  ACTION_ORDER: CUSTOMER_CALLBACK_ACTION_ORDER,
  ACTION_ITEM: CUSTOMER_CALLBACK_ACTION_ITEM,
};

const SettingsStore = require('../../stores/settingsStore');
function buildPublicRenderAttachmentUrl(order = {}, item = {}, attachment = {}) {
  const attachmentId = String(attachment?.attachmentId || '').trim();
  const orderId = String(order?._id || '').trim();
  const itemId = String(item?.itemId || '').trim();
  if (!attachmentId || !orderId || !itemId) return '';
  const baseUrl = String(SettingsStore.get()?.publicBaseUrl || '').trim();
  if (!baseUrl) return '';
  try {
    const endpointPath = `/api/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/attachments/${encodeURIComponent(attachmentId)}/file`;
    const url = new URL(endpointPath, baseUrl);
    url.searchParams.set('scope', 'render');
    return url.toString();
  } catch (error) {
    return '';
  }
}

function getCustomerAccessContext(access = {}, { CustomerStore, OrderStore } = {}) {
  const CStore = CustomerStore || require('../../stores/customerStore');
  const OStore = OrderStore || require('../../stores/orderStore');
  const customer = (CStore && typeof CStore.findById === 'function') ? CStore.findById(access.customerId) || null : null;
  const order = (OStore && typeof OStore.findById === 'function') ? OStore.findById(access.orderId) || null : null;
  return { customer, order };
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
  const itemName = String(item?.name || '').trim() || `Изделие ${itemNumber}`;
  const itemProgress = getItemProgressSnapshot(order, item);
  return normalizeTelegramButtonText(
    `Изд. № ${itemNumber} · ${itemName} · ${itemProgress.percent}%`
  );
}

function buildCustomerOrderInlineKeyboard(access = {}, order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const buttons = items.map((item, index) => {
    return {
      text: getCustomerItemButtonText(access, order, item, index),
      callback_data: `${CUSTOMER_CALLBACK_PREFIX}|${CUSTOMER_CALLBACK_ACTION_ITEM}|${String(access?._id || '').trim()}|${String(item?.itemId || '').trim()}`,
    };
  }).filter((button) => button.callback_data.split('|')[3]);
  if (buttons.length === 0) return [];
  return buttons.map((button) => [button]);
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

function getCustomerOrderCardMessage(access = {}) {
  const { order } = getCustomerAccessContext(access);
  const progress = getOrderProgressSnapshot(order);
  const text = [
    'Весь заказ',
    `Статус заказа: ${getReadableOrderStatus(order)}`,
    `Общая готовность заказа: ${progress.percent}%`,
    `Всего изделий в заказе: ${getOrderItemCount(order)}`,
    'Нажмите на изделие ниже, чтобы открыть его карточку.',
  ].filter(Boolean).join('\n');
  const inlineKeyboard = buildCustomerOrderInlineKeyboard(access, order);
  return {
    text,
    extra: inlineKeyboard.length > 0
      ? { reply_markup: { inline_keyboard: inlineKeyboard } }
      : {},
  };
}

function getCustomerFullOrderText(access = {}) {
  return getCustomerOrderCardMessage(access).text;
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
          inline_keyboard: [[{
            text: getCustomerBackToItemsButtonText(access),
            callback_data: `${CUSTOMER_CALLBACK_PREFIX}|${CUSTOMER_CALLBACK_ACTION_ORDER}|${String(access?._id || '').trim()}`,
          }]],
        },
      },
    };
  }
  const itemIndex = items.findIndex((entry) => String(entry?.itemId || '').trim() === String(itemId || '').trim());
  const itemNumber = String(item?.itemNumber || itemIndex + 1).trim() || String(itemIndex + 1);
  const itemProgressRaw = getItemProgressSnapshot(order, item);
  const stageLines = getItemTrackedStageProgress(order, item).map((stage) => {
    return `${getStageStatusMarker(stage.status, stage.legendKey)} ${stage.label}`;
  });
  const itemName = String(item?.name || '').trim() || `Изделие ${itemNumber}`;
  const firstRenderImage = Array.isArray(item.renderImages) ? item.renderImages[0] : null;
  const publicRenderImageUrl = firstRenderImage ? buildPublicRenderAttachmentUrl(order, item, firstRenderImage) : '';
  const progressSegments = 8;
  const percent = Number(itemProgressRaw.percent) || 0;
  const filled = Math.max(0, Math.min(progressSegments, Math.round((percent / 100) * progressSegments)));
  const bar = `${'🟩'.repeat(filled)}${'⬜'.repeat(Math.max(0, progressSegments - filled))}`;
  const itemProgress = { bar, percent };
  const shortPhotoCaption = [
    'Карточка изделия',
    `Заказ № ${String(order?.orderNumber || '').trim() || 'не указан'}`,
    `Изделие № ${itemNumber}`,
    itemName,
    `Готовность: ${itemProgress.bar} ${itemProgress.percent}%`,
  ].filter(Boolean).join('\n');
  const fullText = [
    'Карточка изделия',
    `Заказ № ${String(order?.orderNumber || '').trim() || 'не указан'}`,
    `Изделие № ${itemNumber}`,
    itemName,
    'Готовность изделия:',
    `${itemProgress.bar} ${itemProgress.percent}%`,
    'Стадии:',
    ...stageLines,
  ].filter(Boolean).join('\n');
  return {
    text: fullText,
    extra: {
      photoUrl: publicRenderImageUrl,
      photoCaption: shortPhotoCaption,
      reply_markup: {
        inline_keyboard: [[{
          text: getCustomerBackToItemsButtonText(access),
          callback_data: `${CUSTOMER_CALLBACK_PREFIX}|${CUSTOMER_CALLBACK_ACTION_ORDER}|${String(access?._id || '').trim()}`,
        }]],
      },
    },
  };
}

function buildCustomerOrderLaunchSummary(access = {}) {
  const { order } = getCustomerAccessContext(access);
  return [
    `№ Заказа ${String(order?.orderNumber || '').trim() || 'не указан'}`,
    `Всего в заказе ${getOrderItemCount(order)} изделий`,
    `Статус заказа: ${getReadableOrderStatus(order)}`,
  ];
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
    if (itemStatus === 'завершено') acc.completed += 1;
    else if (itemStatus === 'в работе') acc.inProgress += 1;
    else acc.pending += 1;
    return acc;
  }, { completed: 0, inProgress: 0, pending: 0 });
  return `Изделий: ${items.length} · Завершено: ${counts.completed} · В работе: ${counts.inProgress} · Ожидают: ${counts.pending}`;
}

module.exports = {
  CUSTOMER_START_PREFIX,
  CUSTOMER_FULL_ORDER_BUTTON_TEXT,
  CUSTOMER_BACK_TO_ITEMS_BUTTON_PREFIX,
  CUSTOMER_CALLBACK,
  CUSTOMER_CALLBACK_PREFIX,
  CUSTOMER_CALLBACK_ACTION_ORDER,
  CUSTOMER_CALLBACK_ACTION_ITEM,
  getCustomerAccessContext,
  buildPublicRenderAttachmentUrl,
  getCustomerBackToItemsButtonText,
  getCustomerItemButtonText,
  buildCustomerOrderInlineKeyboard,
  buildCustomerOrderReplyKeyboard,
  getCustomerOrderCardMessage,
  getCustomerFullOrderText,
  getCustomerItemCardMessage,
  buildCustomerOrderLaunchSummary,
  buildCustomerOrderItemsStatusLines,
  buildCustomerOrderProgressSummary,
  getOrderDisplayName,
  getCustomerDisplayName,
  getReadableOrderStatus,
  getReadableItemStatus,
  getOrderItemCount,
  getItemCurrentStageLabel,
  getOrderItemDisplayName,
};
