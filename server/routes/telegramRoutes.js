const express = require('express');
const SettingsStore = require('../stores/settingsStore');
const EmployeeStore = require('../stores/employeeStore');
const CustomerTelegramAccessStore = require('../stores/customerTelegramAccessStore');
const { WorkshopRequestStore } = require('../stores/workshopRequestStore');
const { requireAdminAccess } = require('../middleware/security');
const {
  getBotInfo,
  getWebhookInfo,
  setWebhook,
  setChatMenuButton,
  sendMessage,
  answerCallbackQuery,
  getFile,
  downloadTelegramFile,
} = require('../services/telegramService');
const { addActivityLog } = require('../services/activityLog');
const {
  addTelegramDiagnosticLog,
  clearTelegramDiagnosticLogs,
  getTelegramDiagnosticLogs,
} = require('../services/telegramDiagnostics');
const { createWorkshopRequestAttachment } = require('../services/workshopRequestAttachments');
const {
  createTelegramEmployeeSessionToken,
  resolveTelegramWebAppUser,
  verifyTelegramEmployeeSessionToken,
} = require('../services/telegramWebAppAuth');
const {
  CUSTOMER_FULL_ORDER_BUTTON_TEXT,
  extractCustomerAccessTokenFromStartText,
  getCustomerAlreadyLinkedText,
  getCustomerBackToItemsButtonText,
  getCustomerItemCardMessage,
  getCustomerOrderCardMessage,
  getCustomerKeyboardReplyMarkup,
  getCustomerSubscriptionReadyText,
  parseCustomerCallbackData,
  resolveCustomerBackToItemsFromText,
  resolveCustomerItemSelectionFromText,
  sendCustomerTelegramMessage,
} = require('../services/customerTelegramService');
const { getRoleDefinitions, getRoleLabel } = require('../config/roles');

const router = express.Router();
const EMPLOYEE_QR_SCANNER_BUTTON_TEXT = 'Сканер QR';
const EMPLOYEE_WORKSHOP_REQUEST_BUTTON_TEXT = 'Заявки';
const EMPLOYEE_WORKSHOP_REQUEST_CANCEL_BUTTON_TEXT = 'Отмена заявки';
const EMPLOYEE_PENDING_ACTION_CREATE_WORKSHOP_REQUEST = 'create_workshop_request';

function getConfiguredBotToken() {
  return String(SettingsStore.get().telegramBotToken || '').trim();
}

function getRecommendedWebhookUrl() {
  const baseUrl = SettingsStore.get().publicBaseUrl;
  return new URL('/api/telegram/webhook', baseUrl).toString();
}

function getTelegramWebAppUrl() {
  const baseUrl = String(SettingsStore.get().publicBaseUrl || '').trim();
  if (!baseUrl) return '';

  try {
    return new URL('/telegram-app', baseUrl).toString();
  } catch (error) {
    return '';
  }
}

function getEmployeeRoleLabel(role) {
  return getRoleLabel(role, SettingsStore.get().roles || SettingsStore.get().roleLabels || {});
}

function getEmployeeAllowedColumns(employee = {}) {
  if (Array.isArray(employee?.allowedColumns)) {
    return [...employee.allowedColumns];
  }

  const roleDefinitions = getRoleDefinitions(SettingsStore.get());
  const roleDefinition = roleDefinitions.find((role) => role.key === String(employee?.role || '').trim());
  return Array.isArray(roleDefinition?.allowedColumns) ? [...roleDefinition.allowedColumns] : [];
}

function maskTelegramValue(value, { tail = 6 } = {}) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized.length <= tail) return normalized;
  return `...${normalized.slice(-tail)}`;
}

function getTelegramPayloadDebug(payload = {}) {
  const initData = String(payload.initData || '').trim();
  const unsafeUserId = String(payload.unsafeUser?.id || '').trim();
  const sessionToken = String(payload.sessionToken || '').trim();

  return {
    hasInitData: Boolean(initData),
    initDataLength: initData.length,
    hasUnsafeUser: Boolean(unsafeUserId),
    unsafeUserId: unsafeUserId || '',
    hasSessionToken: Boolean(sessionToken),
    sessionTokenLength: sessionToken.length,
    sessionTokenTail: maskTelegramValue(sessionToken),
  };
}

function logTelegramWebAppDebug(event, details = {}) {
  addTelegramDiagnosticLog('telegram-webapp', event, details);
  console.log(`[telegram-webapp] ${event}`, JSON.stringify(details));
}

function logCustomerTelegramDebug(event, details = {}) {
  addTelegramDiagnosticLog('customer-telegram', event, details);
  console.log(`[customer-telegram] ${event}`, JSON.stringify(details));
}

function getEmployeePendingAction(employee = {}) {
  return String(employee?.telegramPendingAction || '').trim();
}

function isWorkshopRequestCommand(text = '') {
  const normalizedText = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return normalizedText === 'заявки'
    || normalizedText === 'заявка'
    || normalizedText === `📝 ${String(EMPLOYEE_WORKSHOP_REQUEST_BUTTON_TEXT).toLowerCase()}`
    || normalizedText === `🛠 ${String(EMPLOYEE_WORKSHOP_REQUEST_BUTTON_TEXT).toLowerCase()}`;
}

function isCancelWorkshopRequestCommand(text = '') {
  const normalizedText = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return normalizedText === String(EMPLOYEE_WORKSHOP_REQUEST_CANCEL_BUTTON_TEXT || '').trim().toLowerCase()
    || normalizedText === 'отмена'
    || normalizedText === 'отменить';
}

function getTelegramMessageText(message = {}) {
  if (typeof message?.text === 'string') {
    return message.text.trim();
  }
  if (typeof message?.caption === 'string') {
    return message.caption.trim();
  }
  return '';
}

function getTelegramMessagePhoto(message = {}) {
  const photoSizes = Array.isArray(message?.photo) ? message.photo : [];
  if (photoSizes.length === 0) return null;
  return photoSizes[photoSizes.length - 1] || null;
}

function isTelegramImageDocument(document = {}) {
  const mimeType = String(document?.mime_type || '').trim().toLowerCase();
  const fileName = String(document?.file_name || '').trim().toLowerCase();
  return mimeType.startsWith('image/')
    || /\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName);
}

function getTelegramMessageImageAttachment(message = {}) {
  const photo = getTelegramMessagePhoto(message);
  if (photo?.file_id) {
    return {
      fileId: String(photo.file_id || '').trim(),
      filePathHint: '',
      fileName: '',
      mimeType: 'image/jpeg',
    };
  }

  const document = message?.document;
  if (document?.file_id && isTelegramImageDocument(document)) {
    return {
      fileId: String(document.file_id || '').trim(),
      filePathHint: String(document.file_name || '').trim(),
      fileName: String(document.file_name || '').trim(),
      mimeType: String(document.mime_type || '').trim() || getTelegramPhotoMimeType(document.file_name),
    };
  }

  return null;
}

function getTelegramPhotoMimeType(filePath = '') {
  const normalizedFilePath = String(filePath || '').trim().toLowerCase();
  if (normalizedFilePath.endsWith('.png')) return 'image/png';
  if (normalizedFilePath.endsWith('.webp')) return 'image/webp';
  if (normalizedFilePath.endsWith('.gif')) return 'image/gif';
  if (normalizedFilePath.endsWith('.bmp')) return 'image/bmp';
  return 'image/jpeg';
}

function getAuthorizedMessageReplyMarkup(employee = {}) {
  const isWaitingForWorkshopRequest = getEmployeePendingAction(employee) === EMPLOYEE_PENDING_ACTION_CREATE_WORKSHOP_REQUEST;
  const webAppUrl = getTelegramWebAppUrl();
  const keyboardRow = [];

  if (webAppUrl) {
    keyboardRow.push({
      text: EMPLOYEE_QR_SCANNER_BUTTON_TEXT,
      web_app: {
        url: webAppUrl,
      },
    });
  }

  keyboardRow.push({
    text: isWaitingForWorkshopRequest
      ? EMPLOYEE_WORKSHOP_REQUEST_CANCEL_BUTTON_TEXT
      : EMPLOYEE_WORKSHOP_REQUEST_BUTTON_TEXT,
  });

  return {
    keyboard: [keyboardRow],
    resize_keyboard: true,
    one_time_keyboard: false,
    input_field_placeholder: isWaitingForWorkshopRequest
      ? 'Напишите заявку для цеха'
      : 'Выберите действие',
  };
}

function getUnauthorizedReplyMarkup() {
  return {
    remove_keyboard: true,
  };
}

function isCustomerFullOrderRequest(text = '') {
  const normalizedText = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return normalizedText === 'весь заказ'
    || normalizedText === '📋 весь заказ'
    || normalizedText === 'весьзаказ'
    || normalizedText === 'заказ целиком'
    || normalizedText.includes('весь заказ')
    || normalizedText.includes(String(CUSTOMER_FULL_ORDER_BUTTON_TEXT || '').trim().toLowerCase())
    || normalizedText.includes('заказ целиком');
}

function normalizeTelegramPinInput(value = '') {
  return String(value || '').replace(/[^\d]/g, '').trim();
}

async function clearTelegramMenuButton(token, chatId) {
  if (chatId) {
    await setChatMenuButton(token, { chatId, type: 'default' }).catch(() => null);
  }
}

async function syncTelegramMenuButton(token, chatId) {
  if (chatId) {
    await clearTelegramMenuButton(token, chatId);
  }
}

async function sendAuthorizedMessage(token, chatId, text, employee) {
  await syncTelegramMenuButton(token, chatId);
  await sendMessage(token, chatId, text, { reply_markup: getAuthorizedMessageReplyMarkup(employee) });
}

async function sendGuestMessage(token, chatId, text) {
  await clearTelegramMenuButton(token, chatId);
  await sendMessage(token, chatId, text, { reply_markup: getUnauthorizedReplyMarkup() });
}

async function refreshAuthorizedEmployeeAccess(token) {
  const employees = EmployeeStore.findAll().filter(employee =>
    String(employee.telegramUserId || '').trim()
    && String(employee.telegramChatId || '').trim()
  );

  let refreshedCount = 0;
  const errors = [];

  for (const employee of employees) {
    try {
      await syncTelegramMenuButton(token, employee.telegramChatId);
      refreshedCount += 1;
    } catch (error) {
      errors.push({
        employeeId: employee._id,
        fullName: employee.fullName,
        message: error.message || 'Не удалось обновить кнопку в Telegram.',
      });
    }
  }

  return {
    total: employees.length,
    refreshedCount,
    failedCount: errors.length,
    errors,
  };
}

async function handleAuthorizedEmployeeMessage(token, chatId, message, employee) {
  const normalizedText = getTelegramMessageText(message);
  const imageAttachment = getTelegramMessageImageAttachment(message);
  if (!employee || !chatId || (!normalizedText && !imageAttachment)) return false;

  const pendingAction = getEmployeePendingAction(employee);
  if (isWorkshopRequestCommand(normalizedText)) {
    const updatedEmployee = EmployeeStore.touchTelegramUser(employee._id, {
      telegramPendingAction: EMPLOYEE_PENDING_ACTION_CREATE_WORKSHOP_REQUEST,
    }) || employee;
    await sendAuthorizedMessage(
      token,
      chatId,
      'Напишите заявку.',
      updatedEmployee,
    );
    return true;
  }

  if (isCancelWorkshopRequestCommand(normalizedText)) {
    const updatedEmployee = EmployeeStore.touchTelegramUser(employee._id, {
      telegramPendingAction: '',
    }) || employee;
    await sendAuthorizedMessage(
      token,
      chatId,
      pendingAction === EMPLOYEE_PENDING_ACTION_CREATE_WORKSHOP_REQUEST
        ? 'Создание заявки отменено.'
        : 'Незавершенной заявки сейчас нет.',
      updatedEmployee,
    );
    return true;
  }

  if (pendingAction !== EMPLOYEE_PENDING_ACTION_CREATE_WORKSHOP_REQUEST) {
    return false;
  }

  let attachments = [];
  if (imageAttachment?.fileId) {
    const telegramFile = await getFile(token, imageAttachment.fileId);
    const telegramFilePath = String(telegramFile?.file_path || '').trim();
    if (!telegramFilePath) {
      await sendAuthorizedMessage(token, chatId, 'Не удалось получить фото из Telegram. Попробуйте отправить его еще раз.', employee);
      return true;
    }

    const photoBuffer = await downloadTelegramFile(token, telegramFilePath);
    attachments = [createWorkshopRequestAttachment({
      originalName: imageAttachment.fileName || `Фото заявки${String(telegramFilePath).match(/\.[a-z0-9]+$/i)?.[0] || ''}`,
      mimeType: imageAttachment.mimeType || getTelegramPhotoMimeType(telegramFilePath),
      buffer: photoBuffer,
      telegramFilePath,
      uploadedAt: new Date().toISOString(),
    })];
  }

  const createdRequest = WorkshopRequestStore.create({
    text: normalizedText || 'Фото заявки',
    attachments,
    actor: {
      employeeId: employee._id,
      employeeName: employee.fullName,
      role: employee.role,
      telegramChatId: chatId,
    },
  });
  if (createdRequest === 'empty_text') {
    await sendAuthorizedMessage(token, chatId, 'Введите текст заявки.', employee);
    return true;
  }

  const updatedEmployee = EmployeeStore.touchTelegramUser(employee._id, {
    telegramPendingAction: '',
  }) || employee;

  try {
    addActivityLog({
      action: 'workshop-request.telegram.create',
      entityType: 'workshopRequest',
      entityId: createdRequest._id,
      entityName: createdRequest.text,
      actor: {
        type: 'telegram',
        role: employee.role,
        name: employee.fullName,
        label: employee.fullName,
      },
      message: 'Цеховая заявка создана из Telegram.',
      details: {
        workshopRequestId: createdRequest._id,
        employeeId: employee._id,
        employeeName: employee.fullName,
        telegramChatId: String(chatId),
        attachmentCount: attachments.length,
      },
    });
  } catch (activityLogError) {
    console.error('Workshop request activity log error:', activityLogError.message);
  }

  await sendAuthorizedMessage(
    token,
    chatId,
    attachments.length > 0
      ? `Заявка с фото принята.\n\n${createdRequest.text}\n\nМенеджер увидит ее в разделе "Все заявки".`
      : `Заявка принята.\n\n${createdRequest.text}\n\nМенеджер увидит ее в разделе "Все заявки".`,
    updatedEmployee,
  );
  return true;
}

async function processTelegramMessage(token, message) {
  const text = getTelegramMessageText(message);
  const hasPhoto = Boolean(getTelegramMessageImageAttachment(message));
  const normalizedPinInput = normalizeTelegramPinInput(text);
  const chatId = message?.chat?.id;
  const from = message?.from;

  if (!chatId || !from) return;
  logCustomerTelegramDebug('message.received', {
    chatId: String(chatId),
    telegramUserId: String(from.id || ''),
    text,
    hasText: Boolean(text),
    hasPhoto,
  });

  const touchedCustomerAccesses = CustomerTelegramAccessStore.touchLinkedByTelegramContext({
    chatId,
    telegramUserId: from.id,
    username: from.username ? `@${String(from.username).replace(/^@+/, '')}` : '',
    firstName: from.first_name || '',
    lastName: from.last_name || '',
  });
  const linkedCustomerAccesses = (() => {
    const items = [
      ...touchedCustomerAccesses,
      ...CustomerTelegramAccessStore.findLinkedByTelegramUserId(from.id),
      ...CustomerTelegramAccessStore.findLinkedByTelegramChatId(chatId),
    ];
    const uniqueById = new Map();
    for (const item of items) {
      if (!item?._id) continue;
      uniqueById.set(item._id, item);
    }
    return Array.from(uniqueById.values());
  })();
  let existingEmployee = EmployeeStore.findByTelegramUserId(from.id);
  if (existingEmployee) {
    await syncTelegramMenuButton(token, chatId);
  } else {
    await clearTelegramMenuButton(token, chatId);
  }
  if (existingEmployee) {
    existingEmployee = EmployeeStore.touchTelegramUser(existingEmployee._id, {
      telegramUsername: from.username ? `@${String(from.username).replace(/^@+/, '')}` : existingEmployee.telegramUsername || '',
      telegramFirstName: from.first_name || existingEmployee.telegramFirstName || '',
      telegramLastName: from.last_name || existingEmployee.telegramLastName || '',
      telegramChatId: String(chatId),
    }) || existingEmployee;
  }

  if (!text && !hasPhoto) return;

  if (text.startsWith('/start')) {
    const customerAccessToken = extractCustomerAccessTokenFromStartText(text);
    if (existingEmployee) {
      await sendAuthorizedMessage(
        token,
        chatId,
        `Здравствуйте, ${existingEmployee.fullName}. Вы уже авторизованы как ${getEmployeeRoleLabel(existingEmployee.role)}.\nИспользуйте кнопки "${EMPLOYEE_QR_SCANNER_BUTTON_TEXT}" и "${EMPLOYEE_WORKSHOP_REQUEST_BUTTON_TEXT}" ниже.`,
        existingEmployee
      );
      return;
    }
    if (customerAccessToken) {
      const access = CustomerTelegramAccessStore.findByAccessToken(customerAccessToken);
      logCustomerTelegramDebug('start.customer-token', {
        chatId: String(chatId),
        telegramUserId: String(from.id || ''),
        tokenFound: Boolean(access),
        accessTokenTail: customerAccessToken ? `...${customerAccessToken.slice(-6)}` : '',
      });
      if (!access) {
        await sendGuestMessage(token, chatId, 'Ссылка на отслеживание заказа устарела. Запросите новую ссылку или QR-код у менеджера.');
        return;
      }
      const linkedAccess = CustomerTelegramAccessStore.linkTelegramUser(access._id, {
        telegramUserId: from.id,
        chatId,
        username: from.username ? `@${String(from.username).replace(/^@+/, '')}` : '',
        firstName: from.first_name || '',
        lastName: from.last_name || '',
      }) || access;
      await sendCustomerTelegramMessage({
        access: linkedAccess,
        chatId,
        telegramUserId: from.id,
        type: 'customer.start.linked',
        text: getCustomerSubscriptionReadyText(linkedAccess),
        meta: { event: 'linked-by-token' },
        extra: { reply_markup: getCustomerKeyboardReplyMarkup() },
      });
      logCustomerTelegramDebug('start.linked-by-token', {
        accessId: linkedAccess?._id || access._id || '',
        orderId: linkedAccess?.orderId || access.orderId || '',
        chatId: String(chatId),
        telegramUserId: String(from.id || ''),
      });
      return;
    }
    if (linkedCustomerAccesses.length > 0) {
      await sendCustomerTelegramMessage({
        access: linkedCustomerAccesses[0],
        chatId,
        telegramUserId: from.id,
        type: 'customer.start.summary',
        text: getCustomerAlreadyLinkedText(linkedCustomerAccesses),
        meta: { event: 'linked-summary' },
        extra: { reply_markup: getCustomerKeyboardReplyMarkup() },
      });
      return;
    }
    await sendGuestMessage(token, chatId, 'Здравствуйте! Для доступа к заказу используйте личную ссылку или QR-код от менеджера. Сотрудники могут войти по PIN-коду.');
    return;
  }

  if (existingEmployee) {
    if (await handleAuthorizedEmployeeMessage(token, chatId, message, existingEmployee)) {
      return;
    }
    await sendAuthorizedMessage(
      token,
      chatId,
      `Вы уже авторизованы как ${existingEmployee.fullName}. Используйте кнопки "${EMPLOYEE_QR_SCANNER_BUTTON_TEXT}" и "${EMPLOYEE_WORKSHOP_REQUEST_BUTTON_TEXT}" ниже.`,
      existingEmployee
    );
    return;
  }

  if (linkedCustomerAccesses.length > 0 && isCustomerFullOrderRequest(text)) {
    logCustomerTelegramDebug('full-order.request', {
      chatId: String(chatId),
      telegramUserId: String(from.id || ''),
      accessCount: linkedCustomerAccesses.length,
      text,
    });
    for (const access of linkedCustomerAccesses) {
      const orderCardMessage = getCustomerOrderCardMessage(access);
      await sendCustomerTelegramMessage({
        access,
        chatId,
        telegramUserId: from.id,
        type: 'customer.order.full',
        text: orderCardMessage.text,
        meta: { event: 'full-order' },
        extra: orderCardMessage.extra,
      });
    }
    logCustomerTelegramDebug('full-order.sent', {
      chatId: String(chatId),
      telegramUserId: String(from.id || ''),
      accessCount: linkedCustomerAccesses.length,
    });
    return;
  }

  if (linkedCustomerAccesses.length > 0) {
    const backToItemsAccess = resolveCustomerBackToItemsFromText(linkedCustomerAccesses, text);
    if (backToItemsAccess) {
      const orderCardMessage = getCustomerOrderCardMessage(backToItemsAccess);
      await sendCustomerTelegramMessage({
        access: backToItemsAccess,
        chatId,
        telegramUserId: from.id,
        type: 'customer.order.full',
        text: orderCardMessage.text,
        meta: { event: 'back-to-items', buttonText: getCustomerBackToItemsButtonText(backToItemsAccess) },
        extra: orderCardMessage.extra,
      });
      return;
    }

    const itemSelection = resolveCustomerItemSelectionFromText(linkedCustomerAccesses, text, { chatId });
    if (itemSelection?.access && itemSelection?.itemId) {
      const itemCardMessage = getCustomerItemCardMessage(itemSelection.access, itemSelection.itemId);
      await sendCustomerTelegramMessage({
        access: itemSelection.access,
        chatId,
        telegramUserId: from.id,
        type: 'customer.order.item',
        text: itemCardMessage.text,
        meta: { event: 'item-card-by-text', itemId: itemSelection.itemId },
        extra: itemCardMessage.extra,
      });
      return;
    }
  }

  if (linkedCustomerAccesses.length > 0) {
    await sendCustomerTelegramMessage({
      access: linkedCustomerAccesses[0],
      chatId,
      telegramUserId: from.id,
      type: 'customer.linked.info',
      text: getCustomerAlreadyLinkedText(linkedCustomerAccesses),
      meta: { event: 'linked-info' },
      extra: { reply_markup: getCustomerKeyboardReplyMarkup() },
    });
    return;
  }

  const employee = EmployeeStore.findByPinCode(normalizedPinInput);
  if (!employee) {
    await sendGuestMessage(token, chatId, 'Доступ к заказу выдается только по личной ссылке или QR-коду от менеджера. Сотрудники могут войти по PIN-коду.');
    return;
  }

  if (employee.telegramUserId && String(employee.telegramUserId) !== String(from.id)) {
    await sendGuestMessage(token, chatId, 'Этот сотрудник уже привязан к другому Telegram-пользователю. Обратитесь к администратору.');
    return;
  }

  const linkedEmployee = EmployeeStore.linkTelegramUser(employee._id, {
    userId: from.id,
    chatId,
    username: from.username ? `@${String(from.username).replace(/^@+/, '')}` : '',
    firstName: from.first_name || '',
    lastName: from.last_name || '',
  });

  await sendAuthorizedMessage(
    token,
    chatId,
    `Авторизация прошла успешно.\nСотрудник: ${linkedEmployee.fullName}\nРоль: ${getEmployeeRoleLabel(linkedEmployee.role)}\nТеперь используйте кнопки "${EMPLOYEE_QR_SCANNER_BUTTON_TEXT}" и "${EMPLOYEE_WORKSHOP_REQUEST_BUTTON_TEXT}" ниже.`,
    linkedEmployee
  );
}

async function processTelegramCallbackQuery(token, callbackQuery) {
  const callbackId = String(callbackQuery?.id || '').trim();
  const payload = parseCustomerCallbackData(callbackQuery?.data);
  if (!callbackId || !payload) return;

  const chatId = callbackQuery?.message?.chat?.id;
  const from = callbackQuery?.from;
  if (!chatId || !from) {
    await answerCallbackQuery(token, callbackId).catch(() => null);
    return;
  }

  const touchedCustomerAccesses = CustomerTelegramAccessStore.touchLinkedByTelegramContext({
    chatId,
    telegramUserId: from.id,
    username: from.username ? `@${String(from.username).replace(/^@+/, '')}` : '',
    firstName: from.first_name || '',
    lastName: from.last_name || '',
  });
  const linkedCustomerAccesses = (() => {
    const items = [
      ...touchedCustomerAccesses,
      ...CustomerTelegramAccessStore.findLinkedByTelegramUserId(from.id),
      ...CustomerTelegramAccessStore.findLinkedByTelegramChatId(chatId),
    ];
    const uniqueById = new Map();
    for (const item of items) {
      if (!item?._id) continue;
      uniqueById.set(item._id, item);
    }
    return Array.from(uniqueById.values());
  })();
  const access = linkedCustomerAccesses.find((item) => item._id === payload.accessId) || null;
  if (!access) {
    await answerCallbackQuery(token, callbackId, 'Доступ к заказу больше недоступен.').catch(() => null);
    return;
  }

  try {
    if (payload.action === 'order') {
      const orderCardMessage = getCustomerOrderCardMessage(access);
      await sendCustomerTelegramMessage({
        access,
        chatId,
        telegramUserId: from.id,
        type: 'customer.order.full',
        text: orderCardMessage.text,
        meta: { event: 'full-order-callback' },
        extra: orderCardMessage.extra,
      });
      return;
    }

    if (payload.action === 'item') {
      const itemCardMessage = getCustomerItemCardMessage(access, payload.itemId);
      await sendCustomerTelegramMessage({
        access,
        chatId,
        telegramUserId: from.id,
        type: 'customer.order.item',
        text: itemCardMessage.text,
        meta: { event: 'item-card', itemId: payload.itemId || '' },
        extra: itemCardMessage.extra,
      });
    }
  } finally {
    await answerCallbackQuery(token, callbackId).catch(() => null);
  }
}

router.post('/telegram/check', requireAdminAccess(), async (req, res) => {
  const token = getConfiguredBotToken();
  if (!token) {
    return res.status(400).json({ message: 'Сначала сохраните токен Telegram-бота.' });
  }

  try {
    const [bot, webhook] = await Promise.all([
      getBotInfo(token),
      getWebhookInfo(token).catch(() => null),
    ]);
    const refreshResult = await refreshAuthorizedEmployeeAccess(token);

    res.json({
      ok: true,
      bot: {
        id: bot.id,
        username: bot.username,
        firstName: bot.first_name,
        canJoinGroups: Boolean(bot.can_join_groups),
        supportsInlineQueries: Boolean(bot.supports_inline_queries),
      },
      webhook: webhook ? {
        url: webhook.url || '',
        pendingUpdateCount: webhook.pending_update_count || 0,
        lastErrorMessage: webhook.last_error_message || '',
        lastErrorDate: webhook.last_error_date || null,
      } : null,
      recommendedWebhookUrl: getRecommendedWebhookUrl(),
      telegramWebAppUrl: getTelegramWebAppUrl(),
      refreshedAuthorizedEmployees: refreshResult,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Не удалось проверить Telegram-бота.' });
  }
});

router.post('/telegram/webhook/setup', requireAdminAccess(), async (req, res) => {
  const token = getConfiguredBotToken();
  if (!token) {
    return res.status(400).json({ message: 'Сначала сохраните токен Telegram-бота.' });
  }

  try {
    const webhookUrl = getRecommendedWebhookUrl();
    await setWebhook(token, webhookUrl);
    const refreshResult = await refreshAuthorizedEmployeeAccess(token);
    const [bot, webhook] = await Promise.all([
      getBotInfo(token),
      getWebhookInfo(token),
    ]);

    res.json({
      ok: true,
      message: 'Webhook успешно установлен.',
      bot: {
        id: bot.id,
        username: bot.username,
        firstName: bot.first_name,
      },
      webhook: {
        url: webhook.url || '',
        pendingUpdateCount: webhook.pending_update_count || 0,
        lastErrorMessage: webhook.last_error_message || '',
        lastErrorDate: webhook.last_error_date || null,
      },
      recommendedWebhookUrl: webhookUrl,
      telegramWebAppUrl: getTelegramWebAppUrl(),
      refreshedAuthorizedEmployees: refreshResult,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Не удалось установить webhook Telegram-бота.' });
  }
});

router.post('/telegram/refresh-authorized', requireAdminAccess(), async (req, res) => {
  const token = getConfiguredBotToken();
  if (!token) {
    return res.status(400).json({ message: 'Сначала сохраните токен Telegram-бота.' });
  }

  try {
    await syncTelegramMenuButton(token);
    const refreshResult = await refreshAuthorizedEmployeeAccess(token);
    res.json({
      ok: true,
      message: refreshResult.refreshedCount > 0
        ? 'Кнопки Telegram для авторизованных сотрудников обновлены.'
        : 'Не найдено сотрудников с привязанным Telegram chat id.',
      telegramWebAppUrl: getTelegramWebAppUrl(),
      refreshedAuthorizedEmployees: refreshResult,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Не удалось обновить кнопки Telegram для сотрудников.' });
  }
});

router.get('/telegram/logs', requireAdminAccess(), (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query?.limit) || 200, 400));
  const logs = getTelegramDiagnosticLogs({ limit });
  res.json({
    ok: true,
    logs,
    limit,
    count: logs.length,
  });
});

router.delete('/telegram/logs', requireAdminAccess(), (req, res) => {
  clearTelegramDiagnosticLogs();
  res.json({
    ok: true,
    message: 'Логи ТГ бота очищены.',
  });
});

router.post('/telegram/webapp/session', async (req, res) => {
  const token = getConfiguredBotToken();
  if (!token) {
    return res.status(400).json({ message: 'Сначала сохраните токен Telegram-бота.' });
  }

  try {
    let employee = null;
    let telegramUser = null;
    const payload = req.body || {};
    const payloadDebug = getTelegramPayloadDebug(payload);
    logTelegramWebAppDebug('session.request', payloadDebug);

    if (payload.sessionToken) {
      try {
        const sessionPayload = verifyTelegramEmployeeSessionToken(token, payload.sessionToken);
        employee = EmployeeStore.findById(sessionPayload.employeeId);
        if (!employee || String(employee.telegramUserId || '') !== String(sessionPayload.telegramUserId || '')) {
          logTelegramWebAppDebug('session.reject.session-mismatch', {
            ...payloadDebug,
            employeeId: sessionPayload.employeeId,
            telegramUserId: String(sessionPayload.telegramUserId || ''),
            employeeFound: Boolean(employee),
            employeeTelegramUserId: String(employee?.telegramUserId || ''),
          });
          return res.status(403).json({ message: 'Сотрудник Telegram не найден или session token устарел.' });
        }
        logTelegramWebAppDebug('session.auth.session-token-ok', {
          ...payloadDebug,
          employeeId: employee._id,
          employeeRole: employee.role,
          telegramUserId: String(sessionPayload.telegramUserId || ''),
        });
        telegramUser = {
          id: sessionPayload.telegramUserId,
          username: employee.telegramUsername || '',
          first_name: employee.telegramFirstName || '',
          last_name: employee.telegramLastName || '',
        };
      } catch (sessionError) {
        const hasTelegramAuthPayload = Boolean(String(payload.initData || '').trim() || payload.unsafeUser?.id);
        logTelegramWebAppDebug('session.auth.session-token-failed', {
          ...payloadDebug,
          hasTelegramAuthPayload,
          message: sessionError.message || 'Session token validation failed.',
        });
        if (!hasTelegramAuthPayload) {
          throw sessionError;
        }
        telegramUser = resolveTelegramWebAppUser(token, payload);
        employee = EmployeeStore.findByTelegramUserId(telegramUser.id);
        logTelegramWebAppDebug('session.auth.payload-fallback', {
          ...payloadDebug,
          resolvedTelegramUserId: String(telegramUser?.id || ''),
          employeeFound: Boolean(employee),
        });
      }
    } else {
      telegramUser = resolveTelegramWebAppUser(token, payload);
      employee = EmployeeStore.findByTelegramUserId(telegramUser.id);
      logTelegramWebAppDebug('session.auth.payload-only', {
        ...payloadDebug,
        resolvedTelegramUserId: String(telegramUser?.id || ''),
        employeeFound: Boolean(employee),
      });
    }

    if (!employee) {
      logTelegramWebAppDebug('session.reject.employee-not-found', {
        ...payloadDebug,
        resolvedTelegramUserId: String(telegramUser?.id || ''),
      });
      return res.status(403).json({ message: 'Сотрудник Telegram не найден или не авторизован.' });
    }

    EmployeeStore.touchTelegramUser(employee._id, {
      telegramUsername: telegramUser.username ? `@${String(telegramUser.username).replace(/^@+/, '')}` : employee.telegramUsername || '',
      telegramFirstName: telegramUser.first_name || employee.telegramFirstName || '',
      telegramLastName: telegramUser.last_name || employee.telegramLastName || '',
    });

    const nextSessionToken = createTelegramEmployeeSessionToken(token, employee);
    logTelegramWebAppDebug('session.success', {
      ...payloadDebug,
      employeeId: employee._id,
      employeeRole: employee.role,
      telegramUserId: String(telegramUser?.id || ''),
      issuedSessionTokenTail: maskTelegramValue(nextSessionToken),
    });

    res.json({
      ok: true,
      sessionToken: nextSessionToken,
      employee: {
        _id: employee._id,
        fullName: employee.fullName,
        role: employee.role,
        telegramUsername: employee.telegramUsername || '',
        allowedColumns: getEmployeeAllowedColumns(employee),
      },
    });
  } catch (error) {
    logTelegramWebAppDebug('session.error', {
      ...getTelegramPayloadDebug(req.body || {}),
      message: error.message || 'Не удалось авторизовать Telegram Web App.',
    });
    res.status(401).json({ message: error.message || 'Не удалось авторизовать Telegram Web App.' });
  }
});

router.post('/telegram/webhook', async (req, res) => {
  const token = getConfiguredBotToken();
  if (!token) {
    return res.json({ ok: true, ignored: true });
  }

  try {
    if (req.body?.message) {
      await processTelegramMessage(token, req.body.message);
    }
    if (req.body?.callback_query) {
      await processTelegramCallbackQuery(token, req.body.callback_query);
    }
  } catch (error) {
    console.error('Telegram webhook error:', error.message);
  }

  res.json({ ok: true });
});

module.exports = router;
