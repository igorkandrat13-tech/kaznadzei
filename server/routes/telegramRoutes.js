const express = require('express');
const SettingsStore = require('../stores/settingsStore');
const EmployeeStore = require('../stores/employeeStore');
const { requireWriteAccess } = require('../middleware/security');
const { getBotInfo, getWebhookInfo, setWebhook, sendMessage } = require('../services/telegramService');
const {
  createTelegramEmployeeSessionToken,
  resolveTelegramWebAppUser,
  verifyTelegramEmployeeSessionToken,
} = require('../services/telegramWebAppAuth');

const router = express.Router();

function getConfiguredBotToken() {
  return String(SettingsStore.get().telegramBotToken || '').trim();
}

function getRecommendedWebhookUrl() {
  const baseUrl = SettingsStore.get().publicBaseUrl;
  return new URL('/api/telegram/webhook', baseUrl).toString();
}

function getTelegramWebAppUrl(employeeSessionToken = '') {
  const baseUrl = String(SettingsStore.get().publicBaseUrl || '').trim();
  if (!baseUrl) return '';

  try {
    const url = new URL('/telegram-app', baseUrl);
    if (employeeSessionToken) {
      url.searchParams.set('employeeSessionToken', employeeSessionToken);
    }
    return url.toString();
  } catch (error) {
    return '';
  }
}

function getEmployeeRoleLabel(role) {
  const labels = {
    carpenter: 'Столяр',
    assembler: 'Комплектовщик',
    painter: 'Маляр',
    designer: 'Дизайнер',
  };
  return labels[role] || role;
}

function getAuthorizedReplyMarkup(token, employee) {
  const employeeSessionToken = employee ? createTelegramEmployeeSessionToken(token, employee) : '';
  const webAppUrl = getTelegramWebAppUrl(employeeSessionToken);
  if (!webAppUrl) return null;

  return {
    keyboard: [[{
      text: 'Сканировать QR-код',
      web_app: { url: webAppUrl },
    }]],
    resize_keyboard: true,
    persistent: true,
  };
}

async function sendAuthorizedMessage(token, chatId, text, employee) {
  const replyMarkup = getAuthorizedReplyMarkup(token, employee);
  await sendMessage(
    token,
    chatId,
    text,
    replyMarkup ? { reply_markup: replyMarkup } : {}
  );
}

async function processTelegramMessage(token, message) {
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  const chatId = message?.chat?.id;
  const from = message?.from;

  if (!chatId || !from) return;

  const existingEmployee = EmployeeStore.findByTelegramUserId(from.id);
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
    if (existingEmployee) {
      await sendAuthorizedMessage(
        token,
        chatId,
        `Здравствуйте, ${existingEmployee.fullName}. Вы уже авторизованы как ${getEmployeeRoleLabel(existingEmployee.role)}.\nИспользуйте кнопку "Сканировать QR-код", чтобы открыть камеру и перейти к заказу.`,
        existingEmployee
      );
      return;
    }
    await sendMessage(token, chatId, 'Здравствуйте! Для первичной авторизации отправьте PIN-код, который выдал администратор.');
    return;
  }

  if (existingEmployee) {
    await sendAuthorizedMessage(
      token,
      chatId,
      `Вы уже авторизованы как ${existingEmployee.fullName}. Используйте кнопку "Сканировать QR-код" для открытия камеры в Telegram Web App.`,
      existingEmployee
    );
    return;
  }

  const employee = EmployeeStore.findByPinCode(text);
  if (!employee) {
    await sendMessage(token, chatId, 'PIN-код не найден. Проверьте его и попробуйте снова.');
    return;
  }

  if (employee.telegramUserId && String(employee.telegramUserId) !== String(from.id)) {
    await sendMessage(token, chatId, 'Этот сотрудник уже привязан к другому Telegram-пользователю. Обратитесь к администратору.');
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
    `Авторизация прошла успешно.\nСотрудник: ${linkedEmployee.fullName}\nРоль: ${getEmployeeRoleLabel(linkedEmployee.role)}\nТеперь можно открыть сканер QR-кодов кнопкой ниже.`,
    linkedEmployee
  );
}

router.post('/telegram/check', requireWriteAccess, async (req, res) => {
  const token = getConfiguredBotToken();
  if (!token) {
    return res.status(400).json({ message: 'Сначала сохраните токен Telegram-бота.' });
  }

  try {
    const [bot, webhook] = await Promise.all([
      getBotInfo(token),
      getWebhookInfo(token).catch(() => null),
    ]);

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
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Не удалось проверить Telegram-бота.' });
  }
});

router.post('/telegram/webhook/setup', requireWriteAccess, async (req, res) => {
  const token = getConfiguredBotToken();
  if (!token) {
    return res.status(400).json({ message: 'Сначала сохраните токен Telegram-бота.' });
  }

  try {
    const webhookUrl = getRecommendedWebhookUrl();
    await setWebhook(token, webhookUrl);
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
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Не удалось установить webhook Telegram-бота.' });
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

    if (payload.sessionToken) {
      try {
        const sessionPayload = verifyTelegramEmployeeSessionToken(token, payload.sessionToken);
        employee = EmployeeStore.findById(sessionPayload.employeeId);
        if (!employee || String(employee.telegramUserId || '') !== String(sessionPayload.telegramUserId || '')) {
          return res.status(403).json({ message: 'Сотрудник Telegram не найден или session token устарел.' });
        }
        telegramUser = {
          id: sessionPayload.telegramUserId,
          username: employee.telegramUsername || '',
          first_name: employee.telegramFirstName || '',
          last_name: employee.telegramLastName || '',
        };
      } catch (sessionError) {
        const hasTelegramAuthPayload = Boolean(String(payload.initData || '').trim() || payload.unsafeUser?.id);
        if (!hasTelegramAuthPayload) {
          throw sessionError;
        }
        telegramUser = resolveTelegramWebAppUser(token, payload);
        employee = EmployeeStore.findByTelegramUserId(telegramUser.id);
      }
    } else {
      telegramUser = resolveTelegramWebAppUser(token, payload);
      employee = EmployeeStore.findByTelegramUserId(telegramUser.id);
    }

    if (!employee) {
      return res.status(403).json({ message: 'Сотрудник Telegram не найден или не авторизован.' });
    }

    EmployeeStore.touchTelegramUser(employee._id, {
      telegramUsername: telegramUser.username ? `@${String(telegramUser.username).replace(/^@+/, '')}` : employee.telegramUsername || '',
      telegramFirstName: telegramUser.first_name || employee.telegramFirstName || '',
      telegramLastName: telegramUser.last_name || employee.telegramLastName || '',
    });

    res.json({
      ok: true,
      sessionToken: createTelegramEmployeeSessionToken(token, employee),
      employee: {
        _id: employee._id,
        fullName: employee.fullName,
        role: employee.role,
        telegramUsername: employee.telegramUsername || '',
      },
    });
  } catch (error) {
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
