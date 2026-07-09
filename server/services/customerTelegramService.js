const crypto = require('crypto');
const QRCode = require('qrcode');
const SettingsStore = require('../stores/settingsStore');
const OrderStore = require('../stores/orderStore');
const CustomerStore = require('../stores/customerStore');
const CustomerTelegramAccessStore = require('../stores/customerTelegramAccessStore');
const CustomerTelegramLogStore = require('../stores/customerTelegramLogStore');
const { getBotInfo, sendMessage } = require('./telegramService');

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

function getOrderDisplayName(order = {}) {
  return [
    String(order.orderNumber || '').trim(),
    String(OrderStore.getOrderPrimaryName(order) || '').trim(),
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
    `Здравствуйте, ${getCustomerDisplayName(customer)}.`,
    'Чтобы подключить уведомления по заказу, отправьте PIN-код доступа.',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
  ].join('\n');
}

function getCustomerSubscriptionReadyText(access = {}) {
  const { customer, order } = getCustomerAccessContext(access);
  return [
    `Подписка активирована для ${getCustomerDisplayName(customer)}.`,
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    `Текущий статус: ${getReadableOrderStatus(order)}`,
    'Дальше сюда будут приходить изменения по заказу.',
  ].join('\n');
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
    return 'У вас уже подключены уведомления по заказу.';
  }

  return [
    'У вас уже подключены уведомления по следующим заказам:',
    ...lines.map((line) => `- ${line}`),
  ].join('\n');
}

async function sendCustomerTelegramMessage({
  access = null,
  chatId = '',
  telegramUserId = '',
  text = '',
  type = 'message',
  meta = {},
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
    return { ok: false, skipped: true, reason: 'ACCESS_NOT_FOUND' };
  }

  if (!token) {
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
    await sendMessage(token, effectiveChatId, normalizedText);
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

async function issueCustomerOrderAccess({ customerId, orderId } = {}) {
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

  const pinCode = createPinCode();
  const access = CustomerTelegramAccessStore.issueAccess({
    customerId: normalizedCustomerId,
    orderId: normalizedOrderId,
    accessToken: createAccessToken(),
    pinCode,
  });
  const share = await buildCustomerSharePayload(access);

  return {
    access,
    pinCode,
    ...share,
  };
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
    'Для вашего заказа подготовлен Telegram-доступ.',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    `Статус: ${getReadableOrderStatus(order)}`,
    'После привязки чата сюда будут приходить обновления.',
  ].join('\n');

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
  });
}

async function notifyCustomerOrderArchived(order = {}) {
  const text = [
    'Заказ переведен в архив.',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    'Если это было сделано раньше времени, свяжитесь с менеджером.',
  ].join('\n');
  return notifyCustomerOrderStatusText(order, text, {
    type: 'order.archived',
    meta: { orderNumber: order.orderNumber || '' },
  });
}

async function notifyCustomerOrderRestored(order = {}) {
  const text = [
    'Заказ снова возвращен в работу.',
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    `Текущий статус: ${getReadableOrderStatus(order)}`,
  ].join('\n');
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
