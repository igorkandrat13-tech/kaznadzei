const crypto = require('crypto');
const QRCode = require('qrcode');
const SettingsStore = require('../../stores/settingsStore');
const CustomerTelegramAccessStore = require('../../stores/customerTelegramAccessStore');
const {
  normalizeTelegramButtonText,
  truncateTelegramLabel,
  shortFullName,
  getOrderDisplayName,
  getCustomerDisplayName,
  getReadableOrderStatus,
} = require('./stageFormatters');
const {
  CUSTOMER_START_PREFIX,
  CUSTOMER_FULL_ORDER_BUTTON_TEXT,
  CUSTOMER_CALLBACK,
  CUSTOMER_CALLBACK_PREFIX,
  CUSTOMER_CALLBACK_ACTION_ORDER,
  CUSTOMER_CALLBACK_ACTION_ITEM,
  getCustomerAccessContext,
  buildCustomerOrderLaunchSummary,
  buildCustomerOrderProgressSummary,
  buildCustomerOrderItemsStatusLines,
} = require('./cardRenderers');

const customerChatOrderContext = new Map();

function getConfiguredBotToken() {
  return String(SettingsStore.get().telegramBotToken || '').trim();
}

function createAccessToken() {
  return crypto.randomBytes(16).toString('hex');
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
    ? [rememberedAccess, ...(Array.isArray(accesses) ? accesses : []).filter((a) => a !== rememberedAccess)]
    : (Array.isArray(accesses) ? accesses : []);
  for (let i = 0; i < orderedAccesses.length; i += 1) {
    const access = orderedAccesses[i];
    const { order } = getCustomerAccessContext(access);
    const items = Array.isArray(order?.items) ? order.items : [];
    const item = items.find((entry, idx) => {
      const itemNumber = String(entry?.itemNumber || idx + 1).trim() || String(idx + 1);
      const itemName = truncateTelegramLabel(String(entry?.name || '').trim() || `Изделие ${itemNumber}`, 28);
      return itemNumber === parsed.itemNumber && itemName === parsed.itemName;
    }) || null;
    if (item) {
      return { access, itemId: String(item?.itemId || '').trim() };
    }
  }
  return null;
}

function resolveCustomerBackToItemsFromText(accesses = [], text = '') {
  const parsed = parseCustomerBackToItemsButtonText(text);
  if (!parsed) return null;
  if (parsed.orderNumber) return resolveCustomerAccessByOrderNumber(accesses, parsed.orderNumber);
  return (Array.isArray(accesses) ? accesses[0] : null) || null;
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
  if (normalizedAccesses.length === 0) return 'Уведомления по заказу уже подключены.';
  const blocks = normalizedAccesses.map((access) => buildCustomerOrderLaunchSummary(access).join('\n')).filter(Boolean);
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
  return { remove_keyboard: true };
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

function parseCustomerCallbackData(value = '') {
  const parts = String(value || '').trim().split('|');
  if (parts.length < 3 || parts[0] !== CUSTOMER_CALLBACK_PREFIX) return null;
  const action = String(parts[1] || '').trim();
  const accessId = String(parts[2] || '').trim();
  if (!accessId) return null;
  if (action === CUSTOMER_CALLBACK_ACTION_ORDER) return { action, accessId, itemId: '' };
  if (action === CUSTOMER_CALLBACK_ACTION_ITEM) {
    const itemId = String(parts[3] || '').trim();
    if (!itemId) return null;
    return { action, accessId, itemId };
  }
  return null;
}

function extractCustomerAccessTokenFromStartText(text = '') {
  const normalizedText = String(text || '').trim();
  const match = normalizedText.match(/^\/start(?:\s+(.+))?$/i);
  const payload = String(match?.[1] || '').trim();
  if (!payload.startsWith(CUSTOMER_START_PREFIX)) return '';
  return payload.slice(CUSTOMER_START_PREFIX.length).trim();
}

async function buildCustomerSharePayload(access = {}, deps = {}) {
  const { getBotInfo } = deps.telegramService || require('./telegramService');
  const token = getConfiguredBotToken();
  if (!token) throw new Error('Токен Telegram-бота не настроен.');
  const bot = await getBotInfo(token);
  const botUsername = String(bot?.username || '').trim();
  if (!botUsername) throw new Error('Не удалось определить username Telegram-бота.');
  const startPayload = `${CUSTOMER_START_PREFIX}${String(access.accessToken || '').trim()}`;
  const deepLinkUrl = `https://t.me/${botUsername}?start=${startPayload}`;
  const qrDataUrl = await QRCode.toDataURL(deepLinkUrl, { width: 360, margin: 1 });
  return { startPayload, deepLinkUrl, qrDataUrl, botUsername };
}

function resolveCustomerOrderAccessContext({ customerId, orderId } = {}) {
  const CustomerStore = require('../../stores/customerStore');
  const OrderStore = require('../../stores/orderStore');
  const normalizedCustomerId = String(customerId || '').trim();
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedCustomerId || !normalizedOrderId) throw new Error('Не выбран заказ для выдачи Telegram-доступа.');
  const customer = CustomerStore.findById(normalizedCustomerId);
  if (!customer) throw new Error('Заказчик не найден.');
  const order = OrderStore.findById(normalizedOrderId);
  if (!order) throw new Error('Заказ не найден.');
  if (!CustomerStore.isOrderLinked(normalizedCustomerId, order)) throw new Error('Этот заказ не привязан к выбранному заказчику.');
  return { customer, order, customerId: normalizedCustomerId, orderId: normalizedOrderId };
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
  return { access: prepared.access, createdNewCredentials: prepared.createdNewCredentials, ...share };
}

async function issueCustomerOrderAccess({ customerId, orderId } = {}) {
  return ensureCustomerOrderAccess({ customerId, orderId, rotateCredentials: true });
}

async function getCustomerOrderShare(orderId) {
  const access = CustomerTelegramAccessStore.findByOrderId(orderId)[0] || null;
  if (!access) throw new Error('Для заказа еще не создан Telegram-доступ.');
  return { access, ...(await buildCustomerSharePayload(access)) };
}

function getCustomerOrderUpdateItemText(order = {}, item = {}, stageLabel = '', { clear = false, actorName = '', legendKey = '' } = {}) {
  const itemNumber = String(item?.itemNumber || '').trim();
  const itemName = String(item?.name || '').trim() || 'Без названия';
  const itemLine = itemNumber ? `Номер изделия: ${itemNumber} - ${itemName}` : `Номер изделия: ${itemName}`;
  const statusLine = `Статус изделия: ${String(stageLabel || '').trim() || 'Этап производства'}`;
  const actorLine = `Сотрудник: ${shortFullName(actorName)}`;
  return [
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    itemLine,
    statusLine,
    actorLine,
  ].filter(Boolean).join('\n');
}

function getCustomerOrderChangedItemsText(order = {}, changedItems = [], { clear = false, actorName = '', legendKey = '' } = {}) {
  const normalizedItems = (Array.isArray(changedItems) ? changedItems : []).filter((e) => e?.item);
  if (normalizedItems.length === 0) {
    return [`Заказ: ${getOrderDisplayName(order) || 'не указан'}`].filter(Boolean).join('\n');
  }
  const perActor = actorName ? actorName : (normalizedItems[0]?.actorName || '');
  const actorLine = `Сотрудник: ${shortFullName(perActor)}`;
  return [
    `Заказ: ${getOrderDisplayName(order) || 'не указан'}`,
    ...normalizedItems.flatMap(({ item, stageLabel }, i) => {
      const itemNumber = String(item?.itemNumber || '').trim();
      const itemName = String(item?.name || '').trim() || 'Без названия';
      const itemLine = itemNumber ? `Номер изделия: ${itemNumber} - ${itemName}` : `Номер изделия: ${itemName}`;
      const statusLine = `Статус изделия: ${String(stageLabel || '').trim() || 'Этап производства'}`;
      const block = [itemLine, statusLine];
      if (i === normalizedItems.length - 1) block.push(actorLine);
      return block;
    }),
  ].filter(Boolean).join('\n');
}

module.exports = {
  rememberCustomerChatOrderContext,
  resolveRememberedCustomerAccess,
  parseCustomerItemButtonText,
  parseCustomerBackToItemsButtonText,
  resolveCustomerAccessByOrderNumber,
  resolveCustomerItemSelectionFromText,
  resolveCustomerBackToItemsFromText,
  parseCustomerCallbackData,
  extractCustomerAccessTokenFromStartText,
  getCustomerSubscriptionReadyText,
  getCustomerAlreadyLinkedText,
  getCustomerKeyboardReplyMarkup,
  getCustomerRemoveKeyboardReplyMarkup,
  getCustomerAccessClosedText,
  buildCustomerSharePayload,
  resolveCustomerOrderAccessContext,
  ensureCustomerOrderAccess,
  issueCustomerOrderAccess,
  getCustomerOrderShare,
  getCustomerOrderUpdateItemText,
  getCustomerOrderChangedItemsText,
  createAccessToken,
  getConfiguredBotToken,
};
