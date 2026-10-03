const CustomerTelegramAccessStore = require('../../stores/customerTelegramAccessStore');
const CustomerTelegramLogStore = require('../../stores/customerTelegramLogStore');
const { addTelegramDiagnosticLog } = require('../telegramDiagnostics');
const { getBotInfo, sendMessage, sendPhoto, setChatMenuButton } = require('../telegramService');
const {
  getConfiguredBotToken,
  rememberCustomerChatOrderContext,
  ensureCustomerOrderAccess,
  issueCustomerOrderAccess,
  getCustomerOrderShare,
} = require('./accessShareHelpers');
const {
  getCustomerKeyboardReplyMarkup,
  getOrderDisplayName,
  getReadableOrderStatus,
  buildCustomerOrderProgressSummary,
  buildCustomerOrderItemsStatusLines,
  CUSTOMER_FULL_ORDER_BUTTON_TEXT,
} = require('./cardRenderers');

async function sendCustomerTelegramMessage({
  access = null, chatId = '', telegramUserId = '', text = '', type = 'message', meta = {}, extra = {},
} = {}) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) return { ok: false, skipped: true, reason: 'EMPTY_TEXT' };
  const normalizedAccess = access ? CustomerTelegramAccessStore.findById(access._id || access.accessId || access.id) || access : null;
  const effectiveChatId = String(chatId || normalizedAccess?.telegramChatId || normalizedAccess?.pendingLinkChatId || '').trim();
  const effectiveTelegramUserId = String(telegramUserId || normalizedAccess?.telegramUserId || normalizedAccess?.pendingLinkTelegramUserId || '').trim();
  const token = getConfiguredBotToken();
  if (!normalizedAccess) {
    addTelegramDiagnosticLog('customer-telegram', 'send.skipped', {
      reason: 'ACCESS_NOT_FOUND', type, chatId: effectiveChatId, telegramUserId: effectiveTelegramUserId,
    });
    return { ok: false, skipped: true, reason: 'ACCESS_NOT_FOUND' };
  }
  if (!token) {
    addTelegramDiagnosticLog('customer-telegram', 'send.skipped', {
      reason: 'BOT_TOKEN_NOT_CONFIGURED', accessId: normalizedAccess._id, orderId: normalizedAccess.orderId, type, chatId: effectiveChatId, telegramUserId: effectiveTelegramUserId,
    });
    const logEntry = CustomerTelegramLogStore.add({
      customerId: normalizedAccess.customerId, orderId: normalizedAccess.orderId, accessId: normalizedAccess._id, chatId: effectiveChatId,
      telegramUserId: effectiveTelegramUserId, type, text: normalizedText, status: 'skipped',
      errorMessage: 'Токен Telegram-бота не настроен.', meta,
    });
    return { ok: false, skipped: true, reason: 'BOT_TOKEN_NOT_CONFIGURED', logEntry };
  }
  if (!effectiveChatId) {
    addTelegramDiagnosticLog('customer-telegram', 'send.skipped', {
      reason: 'CHAT_NOT_LINKED', accessId: normalizedAccess._id, orderId: normalizedAccess.orderId, type, chatId: effectiveChatId, telegramUserId: effectiveTelegramUserId,
    });
    const logEntry = CustomerTelegramLogStore.add({
      customerId: normalizedAccess.customerId, orderId: normalizedAccess.orderId, accessId: normalizedAccess._id, chatId: effectiveChatId,
      telegramUserId: effectiveTelegramUserId, type, text: normalizedText, status: 'skipped',
      errorMessage: 'Telegram chat еще не привязан к заказчику.', meta,
    });
    return { ok: false, skipped: true, reason: 'CHAT_NOT_LINKED', logEntry };
  }
  try {
    if (type === 'customer.order.full' || type === 'customer.order.item') {
      rememberCustomerChatOrderContext(effectiveChatId, normalizedAccess);
    }
    await setChatMenuButton(token, { chatId: effectiveChatId, type: 'default' }).catch(() => null);
    const photoUrl = String(extra?.photoUrl || '').trim();
    const photoCaptionHint = String(extra?.photoCaption || '').trim();
    const cleanedExtra = { ...(extra || {}) };
    delete cleanedExtra.photoUrl;
    delete cleanedExtra.photoCaption;
    let mainSendResult = null;
    const TELEGRAM_CAPTION_MAX = 1024;
    if (photoUrl) {
      const textFitsInCaption = normalizedText && normalizedText.length <= TELEGRAM_CAPTION_MAX;
      const photoPayload = {};
      if (textFitsInCaption) {
        photoPayload.caption = normalizedText;
        if (cleanedExtra.reply_markup) photoPayload.reply_markup = cleanedExtra.reply_markup;
      } else if (photoCaptionHint) {
        photoPayload.caption = photoCaptionHint;
      } else if (normalizedText) {
        photoPayload.caption = normalizedText.slice(0, TELEGRAM_CAPTION_MAX);
      }
      addTelegramDiagnosticLog('customer-telegram', 'send.request-photo', {
        accessId: normalizedAccess._id, orderId: normalizedAccess.orderId, type, chatId: effectiveChatId, telegramUserId: effectiveTelegramUserId,
        photoUrlTail: photoUrl.slice(-60), captionLength: String(photoPayload.caption || '').length, textFitsInCaption: Boolean(textFitsInCaption),
      });
      mainSendResult = await sendPhoto(token, effectiveChatId, photoUrl, photoPayload);
      if (normalizedText && !textFitsInCaption) {
        const textPayload = { ...cleanedExtra };
        addTelegramDiagnosticLog('customer-telegram', 'send.request-text-follow-up', {
          accessId: normalizedAccess._id, orderId: normalizedAccess.orderId, type, chatId: effectiveChatId, textLength: normalizedText.length,
        });
        mainSendResult = await sendMessage(token, effectiveChatId, normalizedText, textPayload);
      }
    } else {
      addTelegramDiagnosticLog('customer-telegram', 'send.request', {
        accessId: normalizedAccess._id, orderId: normalizedAccess.orderId, type, chatId: effectiveChatId, telegramUserId: effectiveTelegramUserId,
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
      mainSendResult = await sendMessage(token, effectiveChatId, normalizedText, cleanedExtra);
    }
    addTelegramDiagnosticLog('customer-telegram', 'send.success', {
      accessId: normalizedAccess._id, orderId: normalizedAccess.orderId, type, chatId: effectiveChatId, telegramUserId: effectiveTelegramUserId,
      withPhoto: Boolean(photoUrl),
      messagesCount: (photoUrl && normalizedText && normalizedText.length > TELEGRAM_CAPTION_MAX) ? 2 : 1,
    });
    const logEntry = CustomerTelegramLogStore.add({
      customerId: normalizedAccess.customerId, orderId: normalizedAccess.orderId, accessId: normalizedAccess._id, chatId: effectiveChatId,
      telegramUserId: effectiveTelegramUserId, type, text: normalizedText, status: 'sent', meta,
    });
    return { ok: true, logEntry };
  } catch (error) {
    addTelegramDiagnosticLog('customer-telegram', 'send.failed', {
      accessId: normalizedAccess._id, orderId: normalizedAccess.orderId, type, chatId: effectiveChatId, telegramUserId: effectiveTelegramUserId,
      message: error.message || 'Не удалось отправить сообщение в Telegram.',
    });
    const logEntry = CustomerTelegramLogStore.add({
      customerId: normalizedAccess.customerId, orderId: normalizedAccess.orderId, accessId: normalizedAccess._id, chatId: effectiveChatId,
      telegramUserId: effectiveTelegramUserId, type, text: normalizedText, status: 'failed',
      errorMessage: error.message || 'Не удалось отправить сообщение в Telegram.', meta,
    });
    return { ok: false, error, logEntry };
  }
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
    access, text, type: 'order.created', meta: { orderNumber: order.orderNumber || '' },
  });
}

async function notifyCustomerOrderStatusText(order = {}, text = '', { type = 'order.update', meta = {} } = {}) {
  const access = CustomerTelegramAccessStore.findByOrderId(order._id)[0] || null;
  if (!access) return null;
  return sendCustomerTelegramMessage({
    access, text, type, meta, extra: { reply_markup: getCustomerKeyboardReplyMarkup() },
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
    type: 'order.archived', meta: { orderNumber: order.orderNumber || '' },
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
    type: 'order.restored', meta: { orderNumber: order.orderNumber || '' },
  });
}

module.exports = {
  sendCustomerTelegramMessage,
  notifyCustomerOrderCreated,
  notifyCustomerOrderStatusText,
  notifyCustomerOrderArchived,
  notifyCustomerOrderRestored,
  ensureCustomerOrderAccess,
  issueCustomerOrderAccess,
  getCustomerOrderShare,
};
