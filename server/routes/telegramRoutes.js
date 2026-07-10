const express = require('express');
const SettingsStore = require('../stores/settingsStore');
const EmployeeStore = require('../stores/employeeStore');
const CustomerTelegramAccessStore = require('../stores/customerTelegramAccessStore');
const { requireAdminAccess } = require('../middleware/security');
const { getBotInfo, getWebhookInfo, setWebhook, setChatMenuButton, sendMessage } = require('../services/telegramService');
const {
  addTelegramDiagnosticLog,
  clearTelegramDiagnosticLogs,
  getTelegramDiagnosticLogs,
} = require('../services/telegramDiagnostics');
const {
  createTelegramEmployeeSessionToken,
  resolveTelegramWebAppUser,
  verifyTelegramEmployeeSessionToken,
} = require('../services/telegramWebAppAuth');
const {
  extractCustomerAccessTokenFromStartText,
  getCustomerAlreadyLinkedText,
  getCustomerFullOrderText,
  getCustomerKeyboardReplyMarkup,
  getCustomerPinPromptText,
  getCustomerSubscriptionReadyText,
  sendCustomerTelegramMessage,
} = require('../services/customerTelegramService');
const { getRoleDefinitions, getRoleLabel } = require('../config/roles');

const router = express.Router();

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

function getAuthorizedMessageReplyMarkup() {
  return {
    remove_keyboard: true,
  };
}

function getTelegramMenuButtonConfig() {
  const webAppUrl = getTelegramWebAppUrl();
  if (!webAppUrl) return null;
  return {
    text: '📷 Сканер QR',
    url: webAppUrl,
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
    || normalizedText === 'весьзаказ'
    || normalizedText === 'заказ целиком';
}

async function clearTelegramMenuButton(token, chatId) {
  await setChatMenuButton(token, { type: 'default' }).catch(() => null);
  if (chatId) {
    await setChatMenuButton(token, { chatId, type: 'default' }).catch(() => null);
  }
}

async function syncTelegramMenuButton(token, chatId) {
  const menuButton = getTelegramMenuButtonConfig();
  if (!menuButton) {
    await clearTelegramMenuButton(token, chatId);
    return;
  }
  await setChatMenuButton(token, menuButton).catch(() => null);
  if (chatId) {
    await setChatMenuButton(token, { chatId, ...menuButton }).catch(() => null);
  }
}

async function sendAuthorizedMessage(token, chatId, text, employee) {
  await syncTelegramMenuButton(token, chatId);
  await sendMessage(token, chatId, text, { reply_markup: getAuthorizedMessageReplyMarkup() });
}

async function sendGuestMessage(token, chatId, text) {
  await clearTelegramMenuButton(token, chatId);
  await sendMessage(token, chatId, text, { reply_markup: getUnauthorizedReplyMarkup() });
}

async function refreshAuthorizedEmployeeAccess(token, { notifyEmployees = false } = {}) {
  const employees = EmployeeStore.findAll().filter(employee =>
    String(employee.telegramUserId || '').trim()
    && String(employee.telegramChatId || '').trim()
  );

  let refreshedCount = 0;
  const errors = [];

  for (const employee of employees) {
    try {
      if (notifyEmployees) {
        await sendAuthorizedMessage(
          token,
          employee.telegramChatId,
          `Обновили доступ к сканеру QR-кодов.\nСотрудник: ${employee.fullName}\nРоль: ${getEmployeeRoleLabel(employee.role)}\nИспользуйте кнопку меню "📷 Сканер QR".`,
          employee
        );
      } else {
        await syncTelegramMenuButton(token, employee.telegramChatId);
      }
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

async function processTelegramMessage(token, message) {
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  const chatId = message?.chat?.id;
  const from = message?.from;

  if (!chatId || !from) return;

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
  const existingEmployee = EmployeeStore.findByTelegramUserId(from.id);
  if (existingEmployee) {
    await syncTelegramMenuButton(token, chatId);
  } else {
    await clearTelegramMenuButton(token, chatId);
  }
  if (existingEmployee) {
    EmployeeStore.touchTelegramUser(existingEmployee._id, {
      telegramUsername: from.username ? `@${String(from.username).replace(/^@+/, '')}` : existingEmployee.telegramUsername || '',
      telegramFirstName: from.first_name || existingEmployee.telegramFirstName || '',
      telegramLastName: from.last_name || existingEmployee.telegramLastName || '',
      telegramChatId: String(chatId),
    });
  }

  if (!text) return;

  if (text.startsWith('/start')) {
    const customerAccessToken = extractCustomerAccessTokenFromStartText(text);
    if (existingEmployee) {
      await sendAuthorizedMessage(
        token,
        chatId,
        `Здравствуйте, ${existingEmployee.fullName}. Вы уже авторизованы как ${getEmployeeRoleLabel(existingEmployee.role)}.\nИспользуйте кнопку меню "📷 Сканер QR".`,
        existingEmployee
      );
      return;
    }
    if (customerAccessToken) {
      const access = CustomerTelegramAccessStore.findByAccessToken(customerAccessToken);
      if (!access) {
        await sendGuestMessage(token, chatId, 'Ссылка на отслеживание заказа устарела. Запросите новую ссылку или QR-код у менеджера.');
        return;
      }

      if (String(access.telegramUserId || '').trim() === String(from.id)) {
        await sendCustomerTelegramMessage({
          access,
          chatId,
          telegramUserId: from.id,
          type: 'customer.start.already-linked',
          text: getCustomerSubscriptionReadyText(access),
          meta: { event: 'already-linked' },
        extra: { reply_markup: getCustomerKeyboardReplyMarkup() },
        });
        return;
      }

      const pendingAccess = CustomerTelegramAccessStore.beginTelegramLink(access._id, {
        chatId,
        telegramUserId: from.id,
      }) || access;
      await sendCustomerTelegramMessage({
        access: pendingAccess,
        chatId,
        telegramUserId: from.id,
        type: 'customer.start.pin-request',
        text: getCustomerPinPromptText(pendingAccess),
        meta: { event: 'pin-request' },
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
    await sendGuestMessage(token, chatId, 'Здравствуйте! Для первичной авторизации отправьте PIN-код, который выдал администратор.');
    return;
  }

  if (existingEmployee) {
    await sendAuthorizedMessage(
      token,
      chatId,
      `Вы уже авторизованы как ${existingEmployee.fullName}. Используйте кнопку меню "📷 Сканер QR".`,
      existingEmployee
    );
    return;
  }

  const pendingCustomerAccess = CustomerTelegramAccessStore.findPendingByTelegramContext({
    chatId,
    telegramUserId: from.id,
  });
  if (pendingCustomerAccess) {
    if (!CustomerTelegramAccessStore.verifyPinCode(pendingCustomerAccess._id, text)) {
      await sendCustomerTelegramMessage({
        access: pendingCustomerAccess,
        chatId,
        telegramUserId: from.id,
        type: 'customer.pin.invalid',
        text: 'PIN-код для этого заказа не подошел. Проверьте его и отправьте еще раз.',
        meta: { event: 'pin-invalid' },
      });
      return;
    }

    const linkedAccess = CustomerTelegramAccessStore.linkTelegramUser(pendingCustomerAccess._id, {
      telegramUserId: from.id,
      chatId,
      username: from.username ? `@${String(from.username).replace(/^@+/, '')}` : '',
      firstName: from.first_name || '',
      lastName: from.last_name || '',
    });
    await sendCustomerTelegramMessage({
      access: linkedAccess,
      chatId,
      telegramUserId: from.id,
      type: 'customer.pin.success',
      text: getCustomerSubscriptionReadyText(linkedAccess),
      meta: { event: 'pin-success' },
      extra: { reply_markup: getCustomerKeyboardReplyMarkup() },
    });
    return;
  }

  if (linkedCustomerAccesses.length > 0) {
    if (isCustomerFullOrderRequest(text)) {
      for (const access of linkedCustomerAccesses) {
        await sendCustomerTelegramMessage({
          access,
          chatId,
          telegramUserId: from.id,
          type: 'customer.order.full',
          text: getCustomerFullOrderText(access),
          meta: { event: 'full-order' },
          extra: { reply_markup: getCustomerKeyboardReplyMarkup() },
        });
      }
      return;
    }

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

  const employee = EmployeeStore.findByPinCode(text);
  if (!employee) {
    await sendGuestMessage(token, chatId, 'PIN-код не найден. Проверьте его и попробуйте снова.');
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
    `Авторизация прошла успешно.\nСотрудник: ${linkedEmployee.fullName}\nРоль: ${getEmployeeRoleLabel(linkedEmployee.role)}\nТеперь используйте кнопку меню "📷 Сканер QR".`,
    linkedEmployee
  );
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
    await syncTelegramMenuButton(token);
    const refreshResult = await refreshAuthorizedEmployeeAccess(token, { notifyEmployees: false });

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
    await syncTelegramMenuButton(token);
    const refreshResult = await refreshAuthorizedEmployeeAccess(token, { notifyEmployees: false });
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
  } catch (error) {
    console.error('Telegram webhook error:', error.message);
  }

  res.json({ ok: true });
});

module.exports = router;
