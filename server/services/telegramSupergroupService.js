const SettingsStore = require('../stores/settingsStore');
const OrderStore = require('../stores/orderStore');
const EmployeeStore = require('../stores/employeeStore');
const CustomerTelegramAccessStore = require('../stores/customerTelegramAccessStore');
const CustomerTelegramBridgeStore = require('../stores/customerTelegramBridgeStore');
const { addTelegramDiagnosticLog } = require('./telegramDiagnostics');
const { createForumTopic, sendMessage } = require('./telegramService');
const { getRoleLabel } = require('../config/roles');
const { getCustomerKeyboardReplyMarkup, sendCustomerTelegramMessage } = require('./customerTelegramService');

function getConfiguredBotToken() {
  return String(SettingsStore.get().telegramBotToken || '').trim();
}

function getInternalSupergroupConfig() {
  const settings = SettingsStore.get();
  return {
    enabled: Boolean(settings.telegramSupergroupEnabled),
    chatId: String(settings.telegramSupergroupChatId || '').trim(),
  };
}

function isSupergroupBridgeEnabled() {
  const config = getInternalSupergroupConfig();
  return Boolean(config.enabled && config.chatId && getConfiguredBotToken());
}

function isInternalSupergroupMessage(message = {}) {
  const config = getInternalSupergroupConfig();
  return Boolean(
    config.enabled
    && config.chatId
    && String(message?.chat?.type || '').trim() === 'supergroup'
    && String(message?.chat?.id || '').trim() === config.chatId
  );
}

function truncateTopicTitle(value = '', maxLength = 120) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function buildOrderTopicTitle(order = {}) {
  const orderNumber = String(order.orderNumber || '').trim() || 'без номера';
  const customer = String(order.customer || '').trim() || 'Заказчик';
  return truncateTopicTitle(`Заказ ${orderNumber} | ${customer}`);
}

function buildOrdersPageUrl() {
  const baseUrl = String(SettingsStore.get().publicBaseUrl || '').trim();
  if (!baseUrl) return '';
  try {
    return new URL('/orders', baseUrl).toString();
  } catch (error) {
    return '';
  }
}

function buildOrderTopicStartText(order = {}) {
  const orderUrl = buildOrdersPageUrl();
  return [
    'Служебная карточка старта',
    `Заказ: ${String(order.orderNumber || '').trim() || 'не указан'}`,
    `Заказчик: ${String(order.customer || '').trim() || 'не указан'}`,
    `ID заказа: ${String(order._id || '').trim() || 'не указан'}`,
    orderUrl ? `Контекст: ${orderUrl}` : '',
    'Ответьте reply на сообщение заказчика, чтобы бот переслал ответ ему в личку.',
  ].filter(Boolean).join('\n');
}

function buildCustomerRelayText(order = {}, text = '') {
  return [
    'Сообщение от заказчика',
    `Заказ: ${String(order.orderNumber || '').trim() || 'не указан'}`,
    `Заказчик: ${String(order.customer || '').trim() || 'не указан'}`,
    '',
    String(text || '').trim(),
  ].filter(Boolean).join('\n');
}

function buildEmployeeSignature(message = {}) {
  const employee = EmployeeStore.findByTelegramUserId(message?.from?.id);
  if (employee) {
    const roleLabel = getRoleLabel(employee.role, SettingsStore.get().roles || SettingsStore.get().roleLabels || {});
    return `${roleLabel}: ${employee.fullName}`;
  }

  const fallbackName = [
    String(message?.from?.first_name || '').trim(),
    String(message?.from?.last_name || '').trim(),
  ].filter(Boolean).join(' ').trim()
    || String(message?.from?.username || '').trim()
    || 'Сотрудник';
  return `Сотрудник: ${fallbackName}`;
}

async function ensureOrderSupergroupTopic(orderInput = {}, { sendStarterMessage = false } = {}) {
  const token = getConfiguredBotToken();
  const config = getInternalSupergroupConfig();
  const orderId = String(orderInput?._id || '').trim();
  const sourceOrder = orderId ? (OrderStore.findById(orderId) || orderInput) : null;
  if (!sourceOrder?._id) {
    return { ok: false, reason: 'ORDER_NOT_FOUND' };
  }
  if (!config.enabled || !config.chatId) {
    return { ok: false, reason: 'SUPERGROUP_NOT_CONFIGURED', order: sourceOrder };
  }
  if (!token) {
    return { ok: false, reason: 'BOT_TOKEN_NOT_CONFIGURED', order: sourceOrder };
  }

  let order = sourceOrder;
  let topic = order.telegramTopic || {};
  let created = false;

  if (String(topic.chatId || '').trim() !== config.chatId || !(Number(topic.messageThreadId) > 0)) {
    const title = buildOrderTopicTitle(order);
    let createdTopic = null;
    try {
      createdTopic = await createForumTopic(token, config.chatId, title);
    } catch (error) {
      addTelegramDiagnosticLog('telegram-supergroup', 'topic.create.failed', {
        orderId: order._id,
        orderNumber: order.orderNumber || '',
        topicTitle: title,
        chatId: config.chatId,
        message: error.message || 'Не удалось создать topic в Telegram.',
      });
      throw new Error(`Не удалось создать topic в Telegram: ${error.message || 'ошибка Telegram API.'}`);
    }
    const messageThreadId = Number(createdTopic?.message_thread_id) || 0;
    if (!messageThreadId) {
      addTelegramDiagnosticLog('telegram-supergroup', 'topic.create.invalid-response', {
        orderId: order._id,
        orderNumber: order.orderNumber || '',
        topicTitle: title,
        chatId: config.chatId,
      });
      throw new Error('Telegram не вернул идентификатор созданного topic.');
    }
    order = OrderStore.update(order._id, {
      telegramTopic: {
        chatId: config.chatId,
        messageThreadId,
        title: title,
        createdAt: new Date().toISOString(),
        starterMessageId: 0,
      },
    }) || order;
    topic = order.telegramTopic || {};
    created = true;
    addTelegramDiagnosticLog('telegram-supergroup', 'topic.created', {
      orderId: order._id,
      orderNumber: order.orderNumber || '',
      topicTitle: title,
      topicThreadId: topic.messageThreadId || 0,
      chatId: config.chatId,
    });
  }

  if (sendStarterMessage && Number(topic.messageThreadId) > 0 && !Number(topic.starterMessageId)) {
    try {
      const starterMessage = await sendMessage(token, config.chatId, buildOrderTopicStartText(order), {
        message_thread_id: Number(topic.messageThreadId),
        disable_web_page_preview: true,
      });
      order = OrderStore.update(order._id, {
        telegramTopic: {
          ...topic,
          starterMessageId: Number(starterMessage?.message_id) || 0,
        },
      }) || order;
      topic = order.telegramTopic || topic;
    } catch (error) {
      addTelegramDiagnosticLog('telegram-supergroup', 'topic.starter-message.failed', {
        orderId: order._id,
        orderNumber: order.orderNumber || '',
        topicThreadId: Number(topic.messageThreadId) || 0,
        chatId: config.chatId,
        created,
        message: error.message || 'Не удалось отправить служебную карточку старта.',
      });
    }
  }

  return {
    ok: Boolean(Number(topic.messageThreadId) > 0),
    created,
    order,
    topic,
  };
}

async function relayCustomerMessageToSupergroup({
  access = null,
  text = '',
  customerChatId = '',
  customerTelegramUserId = '',
  customerMessageId = 0,
} = {}) {
  const normalizedText = String(text || '').trim();
  const normalizedAccess = access ? CustomerTelegramAccessStore.findById(access._id || access.accessId || access.id) || access : null;
  if (!normalizedAccess?._id || !normalizedText) {
    return { ok: false, reason: 'INVALID_PAYLOAD' };
  }

  const order = OrderStore.findById(normalizedAccess.orderId);
  if (!order) {
    return { ok: false, reason: 'ORDER_NOT_FOUND' };
  }

  const topicResult = await ensureOrderSupergroupTopic(order, { sendStarterMessage: true });
  if (!topicResult.ok) {
    return topicResult;
  }

  const token = getConfiguredBotToken();
  const sentMessage = await sendMessage(token, topicResult.topic.chatId, buildCustomerRelayText(topicResult.order, normalizedText), {
    message_thread_id: Number(topicResult.topic.messageThreadId),
    disable_web_page_preview: true,
  });

  const bridge = CustomerTelegramBridgeStore.create({
    orderId: topicResult.order._id,
    accessId: normalizedAccess._id,
    customerChatId: String(customerChatId || normalizedAccess.telegramChatId || '').trim(),
    customerTelegramUserId: String(customerTelegramUserId || normalizedAccess.telegramUserId || '').trim(),
    customerMessageId: Number(customerMessageId) || 0,
    topicChatId: topicResult.topic.chatId,
    topicThreadId: Number(topicResult.topic.messageThreadId) || 0,
    topicMessageId: Number(sentMessage?.message_id) || 0,
  });

  addTelegramDiagnosticLog('telegram-supergroup', 'customer.forwarded', {
    orderId: topicResult.order._id,
    accessId: normalizedAccess._id,
    topicThreadId: topicResult.topic.messageThreadId || 0,
    customerMessageId: Number(customerMessageId) || 0,
    topicMessageId: Number(sentMessage?.message_id) || 0,
  });

  return {
    ok: true,
    order: topicResult.order,
    topic: topicResult.topic,
    bridge,
    sentMessage,
  };
}

async function relaySupergroupReplyToCustomer(message = {}) {
  const replyToMessageId = Number(message?.reply_to_message?.message_id) || 0;
  const topicThreadId = Number(message?.message_thread_id) || 0;
  const topicChatId = String(message?.chat?.id || '').trim();
  const text = String(message?.text || message?.caption || '').trim();
  if (!replyToMessageId || !topicThreadId || !topicChatId || !text) {
    return { ok: false, reason: 'INVALID_REPLY' };
  }

  const bridge = CustomerTelegramBridgeStore.findByTopicMessage({
    topicChatId,
    topicThreadId,
    topicMessageId: replyToMessageId,
  });
  if (!bridge) {
    return { ok: false, reason: 'BRIDGE_NOT_FOUND' };
  }

  const access = CustomerTelegramAccessStore.findById(bridge.accessId) || CustomerTelegramAccessStore.findByOrderId(bridge.orderId)[0] || null;
  if (!access?._id || !String(access.telegramChatId || '').trim()) {
    return { ok: false, reason: 'CUSTOMER_CHAT_NOT_LINKED', bridge };
  }

  const result = await sendCustomerTelegramMessage({
    access,
    chatId: access.telegramChatId,
    telegramUserId: access.telegramUserId,
    type: 'customer.bridge.reply',
    text: `${buildEmployeeSignature(message)}\n\n${text}`,
    meta: {
      bridgeId: bridge._id,
      orderId: bridge.orderId,
      topicThreadId,
      topicMessageId: Number(message?.message_id) || 0,
    },
    extra: {
      reply_markup: getCustomerKeyboardReplyMarkup(),
    },
  });

  CustomerTelegramBridgeStore.markEmployeeReplySent(bridge._id, Number(message?.message_id) || 0);
  addTelegramDiagnosticLog('telegram-supergroup', 'employee.replied', {
    bridgeId: bridge._id,
    orderId: bridge.orderId,
    topicThreadId,
    topicMessageId: Number(message?.message_id) || 0,
    customerChatId: String(access.telegramChatId || '').trim(),
    ok: Boolean(result?.ok),
  });

  return {
    ok: Boolean(result?.ok),
    bridge,
    result,
  };
}

module.exports = {
  buildOrderTopicTitle,
  ensureOrderSupergroupTopic,
  getInternalSupergroupConfig,
  isInternalSupergroupMessage,
  isSupergroupBridgeEnabled,
  relayCustomerMessageToSupergroup,
  relaySupergroupReplyToCustomer,
};
