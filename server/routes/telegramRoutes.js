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
  getChatMenuButton,
  sendMessage,
  createForumTopic,
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
const { notifyMaterialRequestWatchers } = require('../services/orderNotifications');
const { createWorkshopRequestAttachment } = require('../services/workshopRequestAttachments');
const {
  createTelegramEmployeeSessionToken,
  getTelegramEmployeeSessionTokenInfo,
  resolveTelegramWebAppUser,
  TELEGRAM_EMPLOYEE_SESSION_TTL_DAYS,
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
  resolveRememberedCustomerAccess,
  sendCustomerTelegramMessage,
} = require('../services/customerTelegramService');
const {
  ensureOrderSupergroupTopic,
  isInternalSupergroupMessage,
  relayCustomerMessageToSupergroup,
  relaySupergroupReplyToCustomer,
} = require('../services/telegramSupergroupService');
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

function buildEmployeeWebAppUrl(employee) {
  const baseUrl = getTelegramWebAppUrl();
  if (!baseUrl) return '';
  try {
    const url = new URL(baseUrl);
    if (employee && employee._id) {
      const token = getConfiguredBotToken();
      if (token) {
        try {
          const sessionToken = createTelegramEmployeeSessionToken(token, employee);
          if (sessionToken) {
            const pathname = String(url.pathname || '/telegram-app').replace(/\/+$/, '');
            const tokenSegment = encodeURIComponent(String(sessionToken));
            url.pathname = `${pathname}/t/${tokenSegment}/`;
          }
        } catch (_) { /* ignore token creation errors */ }
      }
    }
    return url.toString();
  } catch (_) {
    return baseUrl;
  }
}

function getEmployeeByTelegramChatId(chatId) {
  if (!chatId) return null;
  const normalized = String(chatId);
  return EmployeeStore.findAll().find(emp =>
    String(emp.telegramChatId || '') === normalized
  ) || null;
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
  const keyboardRow = [];

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
      : '',
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
  if (!chatId) return { updated: false, error: 'empty_chat_id', url: '' };
  const employee = getEmployeeByTelegramChatId(chatId);
  if (!employee) {
    await clearTelegramMenuButton(token, chatId);
    return { updated: false, error: 'no_employee_by_chat_id', url: '' };
  }
  const webAppUrlWithToken = buildEmployeeWebAppUrl(employee);
  if (!webAppUrlWithToken) {
    await clearTelegramMenuButton(token, chatId);
    return { updated: false, error: 'empty_url', url: '' };
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await clearTelegramMenuButton(token, chatId);
    await wait(150);
    await setChatMenuButton(token, {
      chatId,
      type: 'web_app',
      text: EMPLOYEE_QR_SCANNER_BUTTON_TEXT,
      url: webAppUrlWithToken,
    });
    await wait(200);
    await setChatMenuButton(token, {
      chatId,
      type: 'web_app',
      text: EMPLOYEE_QR_SCANNER_BUTTON_TEXT,
      url: webAppUrlWithToken,
    });
    return { updated: true, error: '', url: webAppUrlWithToken };
  } catch (err) {
    try { await clearTelegramMenuButton(token, chatId); } catch (_) { /* ignore */ }
    return { updated: false, error: String(err?.message || err || 'unknown'), url: webAppUrlWithToken };
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
    String(employee.telegramChatId || '').trim()
  );

  let refreshedCount = 0;
  const errors = [];
  const perEmployee = [];

  for (const employee of employees) {
    try {
      const result = await syncTelegramMenuButton(token, employee.telegramChatId);
      if (result?.updated) {
        refreshedCount += 1;
      } else if (result?.error) {
        errors.push({
          employeeId: employee._id,
          fullName: employee.fullName,
          chatId: employee.telegramChatId,
          message: result.error,
        });
      }
      perEmployee.push({
        employeeId: employee._id,
        fullName: employee.fullName,
        chatId: employee.telegramChatId,
        updated: Boolean(result?.updated),
        error: result?.error || '',
        expectedUrl: result?.url || '',
      });
    } catch (error) {
      errors.push({
        employeeId: employee._id,
        fullName: employee.fullName,
        chatId: employee.telegramChatId,
        message: error.message || 'Не удалось обновить кнопку в Telegram.',
      });
      perEmployee.push({
        employeeId: employee._id,
        fullName: employee.fullName,
        chatId: employee.telegramChatId,
        updated: false,
        error: error.message || String(error),
        expectedUrl: '',
      });
    }
  }

  return {
    total: employees.length,
    refreshedCount,
    failedCount: errors.length,
    errors,
    perEmployee,
  };
}

function resolveCustomerBridgeAccess(accesses = [], chatId = '') {
  const rememberedAccess = resolveRememberedCustomerAccess(accesses, chatId);
  if (rememberedAccess) return rememberedAccess;
  return Array.isArray(accesses) && accesses.length === 1 ? accesses[0] : null;
}

async function handleInternalSupergroupReply(message = {}) {
  if (!isInternalSupergroupMessage(message)) return false;
  if (message?.from?.is_bot) return true;
  const replyResult = await relaySupergroupReplyToCustomer(message);
  return Boolean(replyResult?.ok || replyResult?.reason);
}

async function handleCustomerBridgeMessage(token, message, accesses = []) {
  const text = getTelegramMessageText(message);
  const chatId = String(message?.chat?.id || '').trim();
  const telegramUserId = String(message?.from?.id || '').trim();
  if (!chatId || !telegramUserId || !Array.isArray(accesses) || accesses.length === 0) {
    return false;
  }

  const access = resolveCustomerBridgeAccess(accesses, chatId);
  if (getTelegramMessageImageAttachment(message)) {
    await sendCustomerTelegramMessage({
      access: access || accesses[0],
      chatId,
      telegramUserId,
      type: 'customer.bridge.image-not-supported',
      text: 'Пока в чате с заказчиком поддерживаются только текстовые сообщения. Фото и файлы добавим следующим этапом.',
      meta: { event: 'bridge-image-not-supported' },
      extra: { reply_markup: getCustomerKeyboardReplyMarkup() },
    });
    return true;
  }

  if (!text || text.startsWith('/')) {
    return false;
  }

  if (!access) {
    await sendCustomerTelegramMessage({
      access: accesses[0],
      chatId,
      telegramUserId,
      type: 'customer.bridge.order-not-selected',
      text: 'У вас подключено несколько заказов. Сначала откройте нужный заказ кнопкой "Весь заказ", затем отправьте сообщение еще раз.',
      meta: { event: 'bridge-order-not-selected' },
      extra: { reply_markup: getCustomerKeyboardReplyMarkup() },
    });
    return true;
  }

  const relayResult = await relayCustomerMessageToSupergroup({
    access,
    text,
    customerChatId: chatId,
    customerTelegramUserId: telegramUserId,
    customerMessageId: Number(message?.message_id) || 0,
  });

  if (!relayResult?.ok) {
    await sendCustomerTelegramMessage({
      access,
      chatId,
      telegramUserId,
      type: 'customer.bridge.failed',
      text: 'Не удалось передать сообщение в тему заказа. Попробуйте чуть позже.',
      meta: { event: 'bridge-forward-failed', reason: relayResult?.reason || '' },
      extra: { reply_markup: getCustomerKeyboardReplyMarkup() },
    });
    return true;
  }

  await sendCustomerTelegramMessage({
    access,
    chatId,
    telegramUserId,
    type: 'customer.bridge.ack',
    text: 'Сообщение передано сотрудникам по вашему заказу. Ответ придет сюда.',
    meta: {
      event: 'bridge-forwarded',
      orderId: relayResult?.order?._id || '',
      topicThreadId: relayResult?.topic?.messageThreadId || 0,
    },
    extra: { reply_markup: getCustomerKeyboardReplyMarkup() },
  });
  return true;
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

  notifyMaterialRequestWatchers([
    'Новая заявка: ТГ бот сотрудников',
    `Сотрудник: ${employee.fullName || 'Сотрудник'}`,
    attachments.length > 0 ? 'Тип: С фото' : 'Тип: Текст',
    `Текст: ${createdRequest.text || 'без текста'}`,
  ].join('\n')).catch(() => {});

  await sendAuthorizedMessage(
    token,
    chatId,
    attachments.length > 0
      ? `Заявка с фото принята.\n\n${createdRequest.text}\n\nМенеджер увидит ее в разделе "Заявки на материалы".`
      : `Заявка принята.\n\n${createdRequest.text}\n\nМенеджер увидит ее в разделе "Заявки на материалы".`,
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
  if (await handleInternalSupergroupReply(message)) {
    return;
  }
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
    if (await handleCustomerBridgeMessage(token, message, linkedCustomerAccesses)) {
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

router.post('/telegram/diagnostics/token-flow', requireAdminAccess(), express.json({ limit: '32kb' }), async (req, res) => {
  const token = getConfiguredBotToken();
  const steps = [];
  const pushStep = (name, details = {}) => {
    steps.push({ step: name, ts: new Date().toISOString(), ...details });
  };
  try {
    if (!token) {
      pushStep('bot-token', { ok: false, reason: 'Отсутствует bot token в SettingsStore.' });
      return res.status(400).json({ ok: false, steps, message: 'Сначала сохраните токен Telegram-бота.' });
    }
    pushStep('bot-token', { ok: true });
    const body = req.body || {};
    const sessionToken = String(body.sessionToken || '').trim();
    const initData = String(body.initData || '').trim();
    const unsafeUserId = body.unsafeUser?.id ? String(body.unsafeUser.id) : '';
    const employeeIdParam = String(body.employeeId || '').trim();
    let effectiveSessionToken = sessionToken;
    let serverIssuedDiagnosticToken = false;
    if (!effectiveSessionToken && employeeIdParam) {
      const candidate = EmployeeStore.findById(employeeIdParam);
      if (candidate) {
        try {
          effectiveSessionToken = createTelegramEmployeeSessionToken(token, candidate);
          serverIssuedDiagnosticToken = true;
          pushStep('employee.lookup-by-id', {
            ok: true,
            employeeId: employeeIdParam,
            found: true,
            fullName: candidate.fullName || '',
            hasTelegramUserId: Boolean(candidate.telegramUserId),
            telegramUserId: String(candidate.telegramUserId || ''),
            authorizedAt: candidate.telegramAuthorizedAt || '',
            serverIssuedToken: true,
          });
        } catch (issueErr) {
          pushStep('employee.lookup-by-id', {
            ok: false,
            employeeId: employeeIdParam,
            found: true,
            error: String(issueErr.message || issueErr || ''),
          });
        }
      } else {
        pushStep('employee.lookup-by-id', {
          ok: false,
          employeeId: employeeIdParam,
          found: false,
          error: 'Сотрудник с таким employeeId не найден в EmployeeStore.',
        });
      }
    }
    pushStep('input', {
      hasSessionToken: Boolean(effectiveSessionToken),
      sessionTokenLength: effectiveSessionToken.length,
      hasInitData: Boolean(initData),
      hasUnsafeUserId: Boolean(unsafeUserId),
      unsafeUserId,
      employeeId: employeeIdParam,
      serverIssuedDiagnosticToken,
    });

    let tokenInfo = null;
    if (effectiveSessionToken) {
      tokenInfo = getTelegramEmployeeSessionTokenInfo(effectiveSessionToken);
      pushStep('token.decode', {
        ok: Boolean(tokenInfo && tokenInfo.employeeId),
        employeeId: tokenInfo?.employeeId || '',
        telegramUserId: tokenInfo?.telegramUserId || '',
        role: tokenInfo?.role || '',
        daysLeft: tokenInfo?.daysLeft,
        expired: tokenInfo?.expired,
        expiresAt: tokenInfo?.expiresAt || '',
        serverIssuedDiagnosticToken,
      });
    }

    let sigMatches = false;
    if (effectiveSessionToken) {
      try {
        const [payloadPart, signaturePart] = effectiveSessionToken.split('.');
        if (payloadPart && signaturePart) {
          const crypto = require('crypto');
          const expected = crypto
            .createHmac('sha256', String(token || '').trim())
            .update(payloadPart)
            .digest('hex');
          if (Buffer.from(signaturePart, 'hex').length === Buffer.from(expected, 'hex').length) {
            sigMatches = crypto.timingSafeEqual(Buffer.from(signaturePart, 'hex'), Buffer.from(expected, 'hex'));
          }
        }
      } catch (_) { sigMatches = false; }
      pushStep('token.signature', { ok: sigMatches });
    }

    let verifyResult = null;
    let verifyError = null;
    try {
      verifyResult = verifyTelegramEmployeeSessionToken(token, effectiveSessionToken);
      pushStep('token.verify', { ok: true, employeeId: verifyResult?.employeeId || '', telegramUserId: String(verifyResult?.telegramUserId || '') });
    } catch (err) {
      verifyError = String(err.message || '');
      pushStep('token.verify', { ok: false, error: verifyError });
    }

    let serverRefreshed = false;
    if (!verifyResult && tokenInfo && tokenInfo.employeeId && sigMatches) {
      const candidate = EmployeeStore.findById(tokenInfo.employeeId);
      const authorizedAtMs = candidate?.telegramAuthorizedAt ? Number(new Date(candidate.telegramAuthorizedAt)) : 0;
      const fiveYearsAgoMs = Date.now() - (5 * 365 * 24 * 60 * 60 * 1000);
      const authorizedFresh = authorizedAtMs >= fiveYearsAgoMs;
      const userIdMatches = !tokenInfo.telegramUserId
        || !candidate?.telegramUserId
        || String(tokenInfo.telegramUserId) === String(candidate.telegramUserId);
      serverRefreshed = Boolean(candidate && authorizedFresh && userIdMatches);
      pushStep('token.server-refresh-check', {
        ok: serverRefreshed,
        candidateFound: Boolean(candidate),
        authorizedAtMs,
        authorizedAt: candidate?.telegramAuthorizedAt || '',
        authorizedFresh,
        userIdMatches,
        tokenTelegramUserId: tokenInfo.telegramUserId || '',
        employeeTelegramUserId: candidate?.telegramUserId || '',
      });
    }

    const finalPayload = verifyResult || (serverRefreshed && tokenInfo ? {
      employeeId: tokenInfo.employeeId,
      telegramUserId: tokenInfo.telegramUserId,
      role: tokenInfo.role,
      exp: Date.now() + (5 * 365 * 24 * 60 * 60 * 1000),
      _serverRefreshed: true,
    } : null);

    let employee = null;
    if (finalPayload?.employeeId) {
      employee = EmployeeStore.findById(finalPayload.employeeId);
      const finalTelegramUserId = String(finalPayload.telegramUserId || '');
      const employeeTelegramUserId = String(employee?.telegramUserId || '');
      const match = !finalTelegramUserId || !employeeTelegramUserId || finalTelegramUserId === employeeTelegramUserId;
      pushStep('employee.lookup', {
        ok: Boolean(employee && match),
        employeeFound: Boolean(employee),
        employeeFullName: employee?.fullName || '',
        employeeTelegramUserId,
        finalTelegramUserId,
        userIdMatch: match,
        allowedColumns: employee?.allowedColumns || [],
        role: employee?.role || '',
      });
    }

    if (!employee && (initData || unsafeUserId)) {
      let tgUserId = '';
      try {
        const tgUser = resolveTelegramWebAppUser(token, body);
        tgUserId = String(tgUser?.id || '');
      } catch (_) { tgUserId = ''; }
      employee = tgUserId ? EmployeeStore.findByTelegramUserId(tgUserId) : null;
      pushStep('employee.initData-fallback', {
        ok: Boolean(employee),
        resolvedTelegramUserId: tgUserId,
        employeeFound: Boolean(employee),
        employeeFullName: employee?.fullName || '',
      });
    }

    let sessionTokenFresh = '';
    if (employee) {
      sessionTokenFresh = createTelegramEmployeeSessionToken(token, {
        ...employee,
        telegramAuthorizedAt: employee.telegramAuthorizedAt || new Date().toISOString(),
      });
      const publicBase = String(SettingsStore.get()?.publicBaseUrl || '').trim();
      const webAppUrl = publicBase
        ? `${publicBase.replace(/\/$/, '')}/telegram-app?employeeSessionToken=${encodeURIComponent(sessionTokenFresh)}`
        : '';
      pushStep('issue', {
        ok: true,
        newSessionToken: `${sessionTokenFresh.slice(0, 16)}...[${sessionTokenFresh.length} chars]`,
        newSessionTokenFull: sessionTokenFresh,
        employeeWebAppUrl: webAppUrl,
        ttlDays: TELEGRAM_EMPLOYEE_SESSION_TTL_DAYS,
        webAppUrl,
      });
    }

    const finalOk = Boolean(employee);
    res.json({
      ok: finalOk,
      steps,
      effectiveSessionToken: effectiveSessionToken || '',
      serverIssuedDiagnosticToken,
      issued: employee ? {
        sessionToken: sessionTokenFresh,
        employeeWebAppUrl: (() => {
          const publicBase = String(SettingsStore.get()?.publicBaseUrl || '').trim();
          return publicBase
            ? `${publicBase.replace(/\/$/, '')}/telegram-app?employeeSessionToken=${encodeURIComponent(sessionTokenFresh)}`
            : '';
        })(),
        ttlDays: TELEGRAM_EMPLOYEE_SESSION_TTL_DAYS,
      } : null,
      employee: employee ? {
        _id: employee._id,
        fullName: employee.fullName,
        role: employee.role,
        allowedColumns: employee.allowedColumns || [],
        telegramUserId: employee.telegramUserId || '',
        telegramUsername: employee.telegramUsername || '',
        telegramAuthorizedAt: employee.telegramAuthorizedAt || '',
        telegramChatId: employee.telegramChatId || '',
      } : null,
    });
  } catch (error) {
    pushStep('fatal', { error: String(error.message || ''), stack: String(error.stack || '').slice(0, 400) });
    res.status(500).json({ ok: false, steps, message: String(error.message || 'Неожиданная ошибка при диагностике токена.') });
  }
});

router.get('/telegram/employee/:id/session-status', requireAdminAccess(), async (req, res) => {
  try {
    const employeeId = String(req.params?.id || '').trim();
    const employee = EmployeeStore.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ ok: false, message: 'Сотрудник не найден.' });
    }
    const hasTelegram = Boolean(employee.telegramUserId || employee.telegramAuthorizedAt);
    const authorizedAtMs = employee.telegramAuthorizedAt
      ? new Date(String(employee.telegramAuthorizedAt)).getTime()
      : 0;
    const lastSeenAtMs = employee.telegramLastSeenAt
      ? new Date(String(employee.telegramLastSeenAt)).getTime()
      : 0;
    let daysLeft = 0;
    let expired = true;
    let expiresAtMs = 0;
    if (authorizedAtMs) {
      expiresAtMs = authorizedAtMs + (TELEGRAM_EMPLOYEE_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
      daysLeft = Math.ceil((expiresAtMs - Date.now()) / (24 * 60 * 60 * 1000));
      expired = daysLeft <= 0;
    }
    let statusLabel = 'Не авторизован в Telegram';
    let statusLevel = 'none';
    if (!hasTelegram) {
      statusLabel = 'Не связан с Telegram (используйте PIN или кнопку в боте)';
      statusLevel = 'none';
    } else if (!authorizedAtMs) {
      statusLabel = 'Связан с Telegram, но нет даты авторизации';
      statusLevel = 'warning';
    } else if (expired) {
      statusLabel = `Токен истёк ${Math.abs(daysLeft)} дней назад.`;
      statusLevel = 'expired';
    } else if (daysLeft <= 30) {
      statusLabel = `Истекает через ${daysLeft} дн. (скоро).`;
      statusLevel = 'soon';
    } else if (daysLeft <= 180) {
      statusLabel = `Осталось ${daysLeft} дн.`;
      statusLevel = 'ok';
    } else {
      statusLabel = `Осталось ${daysLeft} дн. (действует до ${new Date(expiresAtMs).toLocaleDateString('ru-RU')})`;
      statusLevel = 'great';
    }
    res.json({
      ok: true,
      employeeId,
      hasTelegramLink: hasTelegram,
      telegramUserId: String(employee.telegramUserId || ''),
      telegramUsername: String(employee.telegramUsername || ''),
      telegramAuthorizedAt: employee.telegramAuthorizedAt || '',
      telegramLastSeenAt: employee.telegramLastSeenAt || '',
      authorizedAtMs,
      lastSeenAtMs,
      expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : '',
      expiresAtMs,
      daysLeft,
      expired,
      statusLabel,
      statusLevel,
      ttlDays: TELEGRAM_EMPLOYEE_SESSION_TTL_DAYS,
    });
  } catch (error) {
    res.status(400).json({ ok: false, message: String(error.message || 'Не удалось получить статус сессии сотрудника.') });
  }
});

router.post('/telegram/employee/refresh-session-token', requireAdminAccess(), express.json({ limit: '16kb' }), async (req, res) => {
  const token = getConfiguredBotToken();
  try {
    if (!token) {
      return res.status(400).json({ ok: false, message: 'Сначала сохраните токен Telegram-бота в Настройки.' });
    }
    const employeeId = String((req.body || {}).employeeId || '').trim();
    if (!employeeId) {
      return res.status(400).json({ ok: false, message: 'Отсутствует employeeId.' });
    }
    const employee = EmployeeStore.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ ok: false, message: 'Сотрудник не найден.' });
    }
    const now = Date.now();
    const authorizedAt = new Date(now).toISOString();
    EmployeeStore.touchTelegramUser(employeeId, {
      telegramAuthorizedAt: authorizedAt,
      telegramLastSeenAt: authorizedAt,
    });
    const freshEmployee = EmployeeStore.findById(employeeId) || employee;
    const sessionToken = createTelegramEmployeeSessionToken(token, {
      ...freshEmployee,
      telegramAuthorizedAt: authorizedAt,
    });
    const info = getTelegramEmployeeSessionTokenInfo(sessionToken);
    const publicBase = String(SettingsStore.get()?.publicBaseUrl || '').trim();
    let employeeWebAppUrl = '';
    if (publicBase) {
      try {
        const base = new URL('/telegram-app', publicBase);
        const tokenSegment = encodeURIComponent(String(sessionToken));
        base.pathname = `/telegram-app/t/${tokenSegment}/`;
        employeeWebAppUrl = base.toString();
      } catch (_) { /* ignore */ }
    }

    let menuButtonUpdated = false;
    let menuButtonError = '';
    const chatId = String(freshEmployee.telegramChatId || '').trim();
    if (chatId) {
      try {
        await syncTelegramMenuButton(token, chatId);
        menuButtonUpdated = true;
      } catch (mbErr) {
        menuButtonError = String(mbErr?.message || mbErr || '');
      }
    }

    res.json({
      ok: true,
      employeeId,
      employee: {
        _id: freshEmployee._id,
        fullName: freshEmployee.fullName,
        role: freshEmployee.role,
        code: freshEmployee.code || freshEmployee.employeeCode || '',
        telegramUserId: freshEmployee.telegramUserId || '',
        telegramUsername: freshEmployee.telegramUsername || '',
      },
      sessionToken,
      expiresAt: info?.expiresAt || '',
      expiresAtMs: info?.expiresAtMs || 0,
      daysLeft: info?.daysLeft || TELEGRAM_EMPLOYEE_SESSION_TTL_DAYS,
      ttlDays: TELEGRAM_EMPLOYEE_SESSION_TTL_DAYS,
      employeeWebAppUrl,
      menuButtonUpdated,
      menuButtonError,
    });
  } catch (error) {
    res.status(400).json({ ok: false, message: String(error.message || 'Не удалось продлить токен сотрудника.') });
  }
});

router.post('/telegram/employee/get-menu-button', requireAdminAccess(), express.json({ limit: '16kb' }), async (req, res) => {
  const token = getConfiguredBotToken();
  try {
    if (!token) {
      return res.status(400).json({ ok: false, message: 'Сначала сохраните токен Telegram-бота в Настройки.' });
    }
    const employeeId = String((req.body || {}).employeeId || '').trim();
    if (!employeeId) {
      return res.status(400).json({ ok: false, message: 'Отсутствует employeeId.' });
    }
    const employee = EmployeeStore.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ ok: false, message: 'Сотрудник не найден.' });
    }
    const chatId = String(employee.telegramChatId || employee.telegramUserId || '').trim();
    if (!chatId) {
      return res.json({
        ok: true,
        employeeId,
        chatId: '',
        menuButton: null,
        type: 'none',
        hasChatId: false,
        hasEmployeeToken: false,
        urlPreview: '',
      });
    }
    const menuButton = await getChatMenuButton(token, { chatId });
    const type = String(menuButton?.type || (menuButton ? 'default' : 'none'));
    const actualUrl = String(menuButton?.web_app?.url || '');
    const expectedUrl = buildEmployeeWebAppUrl(employee);
    const hasPathToken = /\/telegram-app\/t\/[^/?#]{32,}/.test(actualUrl) || /[?&]employeeSessionToken=/.test(actualUrl);
    const urlsMatch = Boolean(expectedUrl && actualUrl && actualUrl.replace(/\/$/, '') === expectedUrl.replace(/\/$/, ''));
    res.json({
      ok: true,
      employeeId,
      chatId,
      menuButton,
      type,
      hasChatId: true,
      hasEmployeeToken: hasPathToken,
      urlPreview: actualUrl,
      expectedUrl,
      urlsMatch,
      diff: {
        hasExpected: Boolean(expectedUrl),
        hasActual: Boolean(actualUrl),
        expectedPath: (() => { try { return new URL(expectedUrl).pathname; } catch (_) { return ''; } })(),
        actualPath: (() => { try { return new URL(actualUrl).pathname; } catch (_) { return ''; } })(),
        cacheStillOld: Boolean(expectedUrl && actualUrl && !urlsMatch),
      },
    });
  } catch (error) {
    res.status(400).json({ ok: false, message: String(error.message || 'Не удалось проверить кнопку меню сотрудника.') });
  }
});

router.post('/telegram/employee/send-direct-link', requireAdminAccess(), express.json({ limit: '16kb' }), async (req, res) => {
  const token = getConfiguredBotToken();
  try {
    if (!token) {
      return res.status(400).json({ ok: false, message: 'Сначала сохраните токен Telegram-бота в Настройки.' });
    }
    const employeeId = String((req.body || {}).employeeId || '').trim();
    if (!employeeId) {
      return res.status(400).json({ ok: false, message: 'Отсутствует employeeId.' });
    }
    const employee = EmployeeStore.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ ok: false, message: 'Сотрудник не найден.' });
    }
    const now = Date.now();
    const authorizedAt = new Date(now).toISOString();
    EmployeeStore.touchTelegramUser(employeeId, {
      telegramAuthorizedAt: authorizedAt,
      telegramLastSeenAt: authorizedAt,
    });
    const freshEmployee = EmployeeStore.findById(employeeId) || employee;
    const sessionToken = createTelegramEmployeeSessionToken(token, {
      ...freshEmployee,
      telegramAuthorizedAt: authorizedAt,
    });
    const info = getTelegramEmployeeSessionTokenInfo(sessionToken);
    const publicBase = String(SettingsStore.get()?.publicBaseUrl || '').trim();
    let employeeWebAppUrl = '';
    if (publicBase) {
      try {
        const base = new URL('/telegram-app', publicBase);
        const tokenSegment = encodeURIComponent(String(sessionToken));
        base.pathname = `/telegram-app/t/${tokenSegment}/`;
        employeeWebAppUrl = base.toString();
      } catch (_) { /* ignore */ }
    }
    const chatId = String(freshEmployee.telegramChatId || '').trim()
      || String(freshEmployee.telegramUserId || '').trim();
    let sent = false;
    let sendStatus = 'no-chat-id';
    let telegramError = '';
    if (chatId && employeeWebAppUrl) {
      const expDate = info?.expiresAtMs ? new Date(info.expiresAtMs) : new Date(now + 1825 * 24 * 60 * 60 * 1000);
      const expDateRu = expDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const text = `🔐 ${freshEmployee.fullName || 'Сотрудник'}, ваша авторизация в «Казнадзеи» продлена на 5 лет!\n\nДействует до ${expDateRu}. Нажмите на кнопку ниже, чтобы открыть Сканер QR — всё заработает автоматически.`;
      const reply_markup = {
        inline_keyboard: [
          [{
            text: '📷 Открыть Сканер QR',
            ...(publicBase ? { url: employeeWebAppUrl } : {}),
          }],
        ],
      };
      try {
        await sendMessage(token, chatId, text, { reply_markup, parse_mode: undefined });
        sent = true;
        sendStatus = 'sent';
      } catch (tgErr) {
        sendStatus = 'telegram-error';
        telegramError = String(tgErr.message || 'Telegram API error');
      }
    }
    res.json({
      ok: true,
      sendStatus,
      sent,
      hasChatId: Boolean(chatId),
      chatId: chatId || '',
      employeeId,
      telegramError,
      employee: {
        _id: freshEmployee._id,
        fullName: freshEmployee.fullName,
        role: freshEmployee.role,
        code: freshEmployee.code || freshEmployee.employeeCode || '',
        telegramUserId: freshEmployee.telegramUserId || '',
        telegramChatId: freshEmployee.telegramChatId || '',
        telegramUsername: freshEmployee.telegramUsername || '',
      },
      sessionToken,
      expiresAt: info?.expiresAt || '',
      expiresAtMs: info?.expiresAtMs || 0,
      daysLeft: info?.daysLeft || TELEGRAM_EMPLOYEE_SESSION_TTL_DAYS,
      ttlDays: TELEGRAM_EMPLOYEE_SESSION_TTL_DAYS,
      employeeWebAppUrl,
    });
  } catch (error) {
    res.status(400).json({ ok: false, message: String(error.message || 'Не удалось отправить ссылку сотруднику.') });
  }
});

router.post('/telegram/employee-link-by-pin', express.json({ limit: '16kb' }), async (req, res) => {
  const token = getConfiguredBotToken();
  try {
    if (!token) return res.status(400).json({ ok: false, message: 'Сначала сохраните токен Telegram-бота в Настройки.' });
    const rawPin = String((req.body || {}).pinCode || '').trim().replace(/[^\d]/g, '');
    if (!rawPin || rawPin.length < 4 || rawPin.length > 8) {
      return res.status(400).json({ ok: false, message: 'ПИН-код должен содержать от 4 до 8 цифр.' });
    }
    const employee = EmployeeStore.findByPinCode(rawPin);
    if (!employee) return res.status(404).json({ ok: false, message: 'Сотрудник с таким ПИН-кодом не найден.' });
    const now = Date.now();
    const authorizedAt = new Date(now).toISOString();
    EmployeeStore.touchTelegramUser(employee._id, {
      telegramAuthorizedAt: authorizedAt,
      telegramLastSeenAt: authorizedAt,
    });
    const fresh = EmployeeStore.findById(employee._id) || employee;
    const sessionToken = createTelegramEmployeeSessionToken(token, { ...fresh, telegramAuthorizedAt: authorizedAt });
    const webAppUrl = buildEmployeeWebAppUrl({ ...fresh, _id: fresh._id });
    const chatId = String(fresh.telegramChatId || '').trim();
    let menuButton = null;
    if (chatId) {
      try {
        menuButton = await syncTelegramMenuButton(token, chatId);
      } catch (_) { /* ignore */ }
    }
    res.json({
      ok: true,
      sessionToken,
      webAppUrl,
      employee: {
        _id: fresh._id,
        fullName: fresh.fullName,
        role: fresh.role || '',
      },
      menuButton,
    });
  } catch (error) {
    res.status(400).json({ ok: false, message: String(error.message || 'Не удалось выполнить вход по ПИН-коду.') });
  }
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
      const tokenInfo = getTelegramEmployeeSessionTokenInfo(payload.sessionToken);
      const normalized = String(payload.sessionToken || '').trim();
      let sessionPayload = null;
      let validateError = null;
      try {
        sessionPayload = verifyTelegramEmployeeSessionToken(token, normalized);
      } catch (verifyErr) {
        validateError = verifyErr;
      }
      if (!sessionPayload && tokenInfo && tokenInfo.employeeId) {
        const candidate = EmployeeStore.findById(tokenInfo.employeeId);
        let sigMatches = false;
        try {
          if (normalized) {
            const [payloadPart, signaturePart] = normalized.split('.');
            if (payloadPart && signaturePart) {
              const crypto = require('crypto');
              const expected = crypto
                .createHmac('sha256', String(token || '').trim())
                .update(payloadPart)
                .digest('hex');
              if (Buffer.from(signaturePart, 'hex').length === Buffer.from(expected, 'hex').length) {
                sigMatches = crypto.timingSafeEqual(Buffer.from(signaturePart, 'hex'), Buffer.from(expected, 'hex'));
              }
            }
          }
        } catch (_) { sigMatches = false; }
        if (candidate && sigMatches) {
          const authorizedAtMs = candidate.telegramAuthorizedAt ? Number(new Date(candidate.telegramAuthorizedAt)) : 0;
          const fiveYearsAgoMs = Date.now() - (5 * 365 * 24 * 60 * 60 * 1000);
          const authorizedFresh = authorizedAtMs >= fiveYearsAgoMs;
          const userIdMatches = !tokenInfo.telegramUserId
            || !candidate.telegramUserId
            || String(tokenInfo.telegramUserId) === String(candidate.telegramUserId);
          if (authorizedFresh && userIdMatches) {
            logTelegramWebAppDebug('session.auth.token-expired-but-server-refreshed', {
              ...payloadDebug,
              employeeId: candidate._id,
              employeeRole: candidate.role,
              tokenDaysLeft: tokenInfo.daysLeft,
              tokenExpired: tokenInfo.expired,
              authorizedAtMs,
              authorizedFresh,
              sigMatches,
              userIdMatches,
            });
            sessionPayload = {
              employeeId: candidate._id,
              telegramUserId: String(candidate.telegramUserId || tokenInfo.telegramUserId || ''),
              role: candidate.role || tokenInfo.role || '',
              exp: Date.now() + (5 * 365 * 24 * 60 * 60 * 1000),
              _serverRefreshed: true,
            };
          }
        }
      }
      try {
        if (!sessionPayload && validateError) {
          throw validateError;
        }
        if (!sessionPayload) {
          throw new Error('Session token Telegram Web App не прошёл проверку.');
        }
        employee = EmployeeStore.findById(sessionPayload.employeeId);
        const sessionTelegramUserId = String(sessionPayload.telegramUserId || '');
        const employeeTelegramUserId = String(employee?.telegramUserId || '');
        const telegramUserIdMatch = !sessionTelegramUserId || !employeeTelegramUserId || sessionTelegramUserId === employeeTelegramUserId;
        if (!employee || !telegramUserIdMatch) {
          logTelegramWebAppDebug('session.reject.session-mismatch', {
            ...payloadDebug,
            employeeId: sessionPayload.employeeId,
            telegramUserId: sessionTelegramUserId,
            employeeFound: Boolean(employee),
            employeeTelegramUserId,
            telegramUserIdMatch,
          });
          if (!employee || employeeTelegramUserId && sessionTelegramUserId && sessionTelegramUserId !== employeeTelegramUserId) {
            return res.status(403).json({ message: 'Сотрудник Telegram не найден или session token устарел.' });
          }
        }
        logTelegramWebAppDebug('session.auth.session-token-ok', {
          ...payloadDebug,
          employeeId: employee._id,
          employeeRole: employee.role,
          telegramUserId: employeeTelegramUserId || sessionTelegramUserId,
          tokenDaysLeft: tokenInfo?.daysLeft,
          tokenExpired: tokenInfo?.expired,
          serverRefreshed: Boolean(sessionPayload._serverRefreshed),
        });
        telegramUser = {
          id: employee.telegramUserId || sessionTelegramUserId || undefined,
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
          tokenDaysLeft: tokenInfo?.daysLeft,
          tokenExpired: tokenInfo?.expired,
        });
        if (!hasTelegramAuthPayload) {
          throw sessionError;
        }
        try {
          telegramUser = resolveTelegramWebAppUser(token, payload);
        } catch (resolveErr) {
          logTelegramWebAppDebug('session.auth.resolve-initData-failed', {
            ...payloadDebug,
            resolveError: String(resolveErr?.message || resolveErr || ''),
            unsafeUserId: String(payload.unsafeUser?.id || ''),
          });
          const unsafeUserIdRaw = String(payload.unsafeUser?.id || '').trim();
          if (unsafeUserIdRaw) {
            telegramUser = {
              id: unsafeUserIdRaw,
              username: String(payload.unsafeUser?.username || ''),
              first_name: String(payload.unsafeUser?.first_name || ''),
              last_name: String(payload.unsafeUser?.last_name || ''),
              _unsafeUserFallback: true,
            };
          } else {
            throw resolveErr;
          }
        }
        employee = EmployeeStore.findByTelegramUserId(telegramUser.id);
        if (!employee) {
          const existingByTokenEmployee = tokenInfo?.employeeId ? EmployeeStore.findById(tokenInfo.employeeId) : null;
          if (existingByTokenEmployee && String(existingByTokenEmployee.telegramUserId || '') === String(telegramUser.id || '')) {
            employee = existingByTokenEmployee;
            logTelegramWebAppDebug('session.auth.token-userid-match-fallback', {
              ...payloadDebug,
              employeeId: employee._id,
              resolvedTelegramUserId: String(telegramUser.id || ''),
            });
          }
        }
        logTelegramWebAppDebug('session.auth.payload-fallback', {
          ...payloadDebug,
          resolvedTelegramUserId: String(telegramUser?.id || ''),
          employeeFound: Boolean(employee),
        });
      }
    } else {
      try {
        telegramUser = resolveTelegramWebAppUser(token, payload);
      } catch (resolveErr) {
        logTelegramWebAppDebug('session.auth.payload-only-resolve-failed', {
          ...payloadDebug,
          resolveError: String(resolveErr?.message || resolveErr || ''),
          unsafeUserId: String(payload.unsafeUser?.id || ''),
        });
        const unsafeUserIdRaw = String(payload.unsafeUser?.id || '').trim();
        if (unsafeUserIdRaw) {
          telegramUser = {
            id: unsafeUserIdRaw,
            username: String(payload.unsafeUser?.username || ''),
            first_name: String(payload.unsafeUser?.first_name || ''),
            last_name: String(payload.unsafeUser?.last_name || ''),
            _unsafeUserFallback: true,
          };
        } else {
          throw resolveErr;
        }
      }
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
