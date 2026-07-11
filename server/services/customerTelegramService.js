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

function getConfiguredBotToken() {
  return String(SettingsStore.get().telegramBotToken || '').trim();
}

function createAccessToken() {
  return crypto.randomBytes(16).toString('hex');
}

function createPinCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
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
    return `${getStatusEmoji(itemStatus)} ${getOrderItemDisplayName(item, index)}${currentStageLabel ? ` · ${currentStageLabel}` : ` · ${itemStatus}`}`;
  });

  return [
    title || (items.length > 1 ? '📋 Изделия:' : '📋 Изделие:'),
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

  return `📦 Изделий: ${items.length} · ✅ ${counts.completed} · 🟡 ${counts.inProgress} · ⏳ ${counts.pending}`;
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

function getCustomerPinPromptText(access = {}) {
  const { customer, order } = getCustomerAccessContext(access);
  return [
    `🔐 ${getCustomerDisplayName(customer)}, введите PIN для заказа.`,
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    buildCustomerOrderProgressSummary(order),
  ].filter(Boolean).join('\n');
}

function getCustomerPinReplyMarkup() {
  return {
    force_reply: true,
    input_field_placeholder: 'Введите 6-значный PIN',
    selective: false,
  };
}

function getCustomerSubscriptionReadyText(access = {}) {
  const { customer, order } = getCustomerAccessContext(access);
  return [
    '✅ PIN-код принят.',
    `${getCustomerDisplayName(customer)}, доступ подключен.`,
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    `${getStatusEmoji(getReadableOrderStatus(order))} Статус заказа: ${getReadableOrderStatus(order)}`,
    buildCustomerOrderProgressSummary(order),
    'Для полного списка изделий нажмите "Весь заказ".',
  ].filter(Boolean).join('\n');
}

function getCustomerAlreadyLinkedText(accesses = []) {
  const normalizedAccesses = Array.isArray(accesses) ? accesses : [];
  const lines = normalizedAccesses
    .map((access) => {
      const order = OrderStore.findById(access.orderId);
      return getOrderDisplayName(order);
    })
    .filter(Boolean);

  if (lines.length === 0) {
    return '✅ Уведомления по заказу уже подключены.';
  }

  return [
    '✅ Уведомления уже подключены:',
    ...lines.map((line) => `• ${line}`),
    'Для полного списка изделий нажмите "Весь заказ".',
  ].join('\n');
}

function getCustomerKeyboardReplyMarkup() {
  return {
    keyboard: [[{ text: 'Весь заказ' }]],
    resize_keyboard: true,
  };
}

function getCustomerRemoveKeyboardReplyMarkup() {
  return {
    remove_keyboard: true,
  };
}

function getCustomerFullOrderText(access = {}) {
  const { order } = getCustomerAccessContext(access);
  return [
    `📋 Весь заказ`,
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    `${getStatusEmoji(getReadableOrderStatus(order))} Статус заказа: ${getReadableOrderStatus(order)}`,
    buildCustomerOrderProgressSummary(order),
    ...buildCustomerOrderItemsStatusLines(order),
  ].filter(Boolean).join('\n');
}

function getCustomerAccessClosedText(order = {}, { hasOtherAccesses = false } = {}) {
  return [
    '🔒 Доступ к заказу закрыт.',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    hasOtherAccesses
      ? 'Уведомления по другим вашим заказам остаются активными.'
      : 'Уведомления по этому чату отключены.',
  ].filter(Boolean).join('\n');
}

function getCustomerOrderUpdateItemText(order = {}, item = {}, stageLabel = '', { clear = false } = {}) {
  const itemStatus = getReadableItemStatus(item);
  return [
    '🛠 Обновление по заказу',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    `${clear ? '↩️' : '✅'} ${getOrderItemDisplayName(item)}${stageLabel ? ` · ${stageLabel}` : ''}`,
    `${getStatusEmoji(itemStatus)} Статус изделия: ${itemStatus}`,
    'Для полного списка изделий нажмите "Весь заказ".',
  ].filter(Boolean).join('\n');
}

function getCustomerOrderChangedItemsText(order = {}, changedItems = [], { clear = false } = {}) {
  const normalizedItems = (Array.isArray(changedItems) ? changedItems : [])
    .filter((entry) => entry?.item);
  if (normalizedItems.length === 0) {
    return [
      '🛠 Обновление по заказу',
      `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
      'Для полного списка изделий нажмите "Весь заказ".',
    ].filter(Boolean).join('\n');
  }

  return [
    '🛠 Обновление по заказу',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    ...normalizedItems.map(({ item, stageLabel }) => {
      const itemStatus = getReadableItemStatus(item);
      return `${clear ? '↩️' : '✅'} ${getOrderItemDisplayName(item)}${stageLabel ? ` · ${stageLabel}` : ''}\n${getStatusEmoji(itemStatus)} Статус изделия: ${itemStatus}`;
    }),
    'Для полного списка изделий нажмите "Весь заказ".',
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
    createPinCode,
    rotateCredentials,
  });
  const share = await buildCustomerSharePayload(prepared.access);

  return {
    access: prepared.access,
    pinCode: prepared.pinCode,
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
    '🔗 Доступ к заказу готов.',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    `${getStatusEmoji(getReadableOrderStatus(order))} Статус: ${getReadableOrderStatus(order)}`,
    buildCustomerOrderProgressSummary(order),
    'После привязки чата обновления придут сюда.',
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
    '📦 Заказ переведен в архив.',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    buildCustomerOrderProgressSummary(order),
    'Для полного списка изделий нажмите "Весь заказ".',
  ].filter(Boolean).join('\n');
  return notifyCustomerOrderStatusText(order, text, {
    type: 'order.archived',
    meta: { orderNumber: order.orderNumber || '' },
  });
}

async function notifyCustomerOrderRestored(order = {}) {
  const text = [
    '↩️ Заказ снова в работе.',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    `${getStatusEmoji(getReadableOrderStatus(order))} Статус: ${getReadableOrderStatus(order)}`,
    buildCustomerOrderProgressSummary(order),
    'Для полного списка изделий нажмите "Весь заказ".',
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
  getCustomerPinReplyMarkup,
  getCustomerRemoveKeyboardReplyMarkup,
  getCustomerAccessClosedText,
  getCustomerFullOrderText,
  getCustomerOrderChangedItemsText,
  getCustomerOrderUpdateItemText,
  buildCustomerOrderItemsStatusLines,
  buildCustomerOrderProgressSummary,
  ensureCustomerOrderAccess,
  CUSTOMER_START_PREFIX,
  extractCustomerAccessTokenFromStartText,
  getCustomerAlreadyLinkedText,
  getCustomerPinPromptText,
  getCustomerSubscriptionReadyText,
  getCustomerOrderShare,
  issueCustomerOrderAccess,
  notifyCustomerOrderArchived,
  notifyCustomerOrderCreated,
  notifyCustomerOrderRestored,
  notifyCustomerOrderStatusText,
  sendCustomerTelegramMessage,
};
