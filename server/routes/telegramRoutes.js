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
const { addActivityLog, getRequestActor } = require('../services/activityLog');
const {
  addTelegramDiagnosticLog,
  clearTelegramDiagnosticLogs,
  getTelegramDiagnosticLogs,
} = require('../services/telegramDiagnostics');
const { notifyMaterialRequestWatchers } = require('../services/orderNotifications');
const { createWorkshopRequestAttachment } = require('../services/workshopRequestAttachments');
const {
  createTelegramEmployeeSessionToken,
  resolveTelegramWebAppUser,
  verifyTelegramEmployeeSessionToken,
  signTelegramEmployeeDirectLink,
  verifyTelegramEmployeeDirectLink,
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

function maskTelegramObjectDeep(value, depth = 0) {
  if (!value) return value;
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) {
    return value.map((item) => maskTelegramObjectDeep(item, depth + 1));
  }
  if (typeof value === 'object') {
    const next = {};
    Object.keys(value).forEach((key) => {
      const normalizedKey = String(key || '').toLowerCase();
      const raw = value[key];
      if (normalizedKey.includes('token') || /(password|secret|key$|hash|signature|session|auth_date|initdata|bot.?token)/i.test(normalizedKey)) {
        if (raw == null || raw === '') {
          next[key] = raw;
        } else if (typeof raw === 'object') {
          next[key] = '[redacted object]';
        } else {
          next[key] = maskTelegramValue(raw, { tail: 4 });
        }
        return;
      }
      next[key] = maskTelegramObjectDeep(raw, depth + 1);
    });
    return next;
  }
  return value;
}

function buildTelegramAuthDiagnosticsSnapshot() {
  const settings = SettingsStore.get() || {};
  const employees = EmployeeStore ? EmployeeStore.findAll() : [];
  const accesses = CustomerTelegramAccessStore ? CustomerTelegramAccessStore.findAll() : [];
  const workshopRequests = WorkshopRequestStore && typeof WorkshopRequestStore.findAll === 'function'
    ? WorkshopRequestStore.findAll()
    : [];
  const telegramLogs = getTelegramDiagnosticLogs({ limit: 400 });
  const authRelatedLogs = telegramLogs.filter((entry) => {
    const event = String(entry?.event || '').toLowerCase();
    const scope = String(entry?.scope || '').toLowerCase();
    if (scope.includes('webapp')) return true;
    return /session\.|auth|payload|signature|stale|grace|employee|item-scan|stage-mark|qr/.test(event);
  }).slice(-200);
  const packageInfo = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    uptimeSeconds: Math.floor(process.uptime()),
    envProduction: Boolean(process.env.NODE_ENV),
    pid: process.pid,
  };
  const botInfo = {
    botTokenConfigured: Boolean(String(settings.telegramBotToken || '').length > 0),
    botTokenTail: maskTelegramValue(settings.telegramBotToken, { tail: 4 }),
    publicBaseUrl: String(settings.publicBaseUrl || '').trim(),
    webAppUrl: getTelegramWebAppUrl(),
    supergroupChatIdConfigured: Boolean(String(settings.telegramSupergroupChatId || '').length > 0),
    supergroupEnabled: Boolean(settings.telegramSupergroupEnabled),
  };
  const employeeRows = employees.map((employee) => ({
    _id: String(employee._id || ''),
    role: String(employee.role || ''),
    fullName: String(employee.fullName || ''),
    telegramUserId: maskTelegramValue(employee.telegramUserId, { tail: 4 }),
    telegramChatId: maskTelegramValue(employee.telegramChatId, { tail: 4 }),
    hasTelegramUserId: Boolean(String(employee.telegramUserId || '').length > 0),
    hasTelegramChatId: Boolean(String(employee.telegramChatId || '').length > 0),
    pinEnabled: Boolean(String(employee.pinHash || '').length > 0),
    allowedColumns: Array.isArray(employee.allowedColumns) ? [...employee.allowedColumns] : [],
  }));
  return {
    generatedAt: new Date().toISOString(),
    packageInfo,
    bot: botInfo,
    constants: {
      TELEGRAM_EMPLOYEE_SESSION_TTL_DAYS: 365,
      TELEGRAM_EMPLOYEE_SESSION_EXPIRATION_GRACE_DAYS: 7,
      TELEGRAM_INIT_DATA_STRICT_TTL_HOURS: 24,
      TELEGRAM_INIT_DATA_STALE_TTL_DAYS: 180,
    },
    employees: employeeRows,
    customerTelegramAccesses: accesses.map((access) => ({
      _id: String(access._id || ''),
      customerName: String(access.customerName || ''),
      telegramUserId: maskTelegramValue(access.telegramUserId, { tail: 4 }),
      telegramChatId: maskTelegramValue(access.telegramChatId, { tail: 4 }),
      linked: Boolean(access.telegramUserId || access.telegramChatId),
      orderIds: Array.isArray(access.orderIds) ? access.orderIds.map(String) : [],
      updatedAt: String(access.updatedAt || ''),
    })),
    lastWorkshopRequests: workshopRequests.slice(-20).map((req) => ({
      _id: String(req._id || ''),
      status: String(req.status || ''),
      orderId: String(req.orderId || ''),
      createdAt: String(req.createdAt || ''),
      updatedAt: String(req.updatedAt || ''),
    })),
    logs: maskTelegramObjectDeep(authRelatedLogs),
    diagnosticsHints: {
      staleInitData: telegramLogs.filter((entry) => /signatureStale|stale-signature|stale-initdata|graceAllowed/i.test(`${String(entry?.event || '')} ${JSON.stringify(entry?.details || {})}`)).length,
      expiredSessions: telegramLogs.filter((entry) => /(expired|истек|истёк|session-token-expired|session\.token\.ист)/i.test(`${String(entry?.event || '')} ${JSON.stringify(entry?.details || {})}`)).length,
      employeeNotFound: telegramLogs.filter((entry) => /employee-not-found|employee\.missing/i.test(String(entry?.event || ''))).length,
      payloadFallbacks: telegramLogs.filter((entry) => /payload-fallback|payload-only|session-token-failed/i.test(String(entry?.event || ''))).length,
    },
  };
}

router.get('/telegram/auth-diagnostics', requireAdminAccess(), (req, res) => {
  try {
    const snapshot = buildTelegramAuthDiagnosticsSnapshot();
    const fileName = `kaznadzei-telegram-auth-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    addActivityLog({
      action: 'settings.telegram-auth-diagnostics.export',
      entityType: 'settings',
      entityName: fileName,
      actor: getRequestActor(req),
      message: 'Выгружен диагностический пакет по авторизации Telegram Web App.',
      details: {
        logsCount: snapshot.logs.length,
        employeesCount: snapshot.employees.length,
      },
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(`${JSON.stringify(snapshot, null, 2)}\n`);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось сформировать диагностический файл.' });
  }
});

router.post('/telegram/client-diagnostics-log', express.json({ limit: '256kb' }), (req, res) => {
  try {
    const payload = req && req.body ? req.body : {};
    const rawScope = String(payload.scope || 'telegram-webapp').toLowerCase().trim().slice(0, 64);
    const allowedScopes = ['telegram-webapp', 'telegram-order', 'telegram-scanner', 'customer-telegram', 'telegram-supergroup'];
    const scope = allowedScopes.includes(rawScope) ? rawScope : 'telegram-webapp';
    const event = String(payload.event || 'client.event').slice(0, 128);
    const details = payload.details && typeof payload.details === 'object' && !Array.isArray(payload.details)
      ? payload.details
      : { raw: typeof payload.details === 'object' ? payload.details : String(payload.details || '').slice(0, 2000) };
    const cappedDetails = {};
    Object.keys(details).forEach((key) => {
      const raw = details[key];
      const normalizedKey = String(key || '').toLowerCase();
      const sensitive = normalizedKey.includes('token') || /(password|secret|key$|hash|signature|session|auth_date|initdata|bot.?token|telegramuserid|telegramchatid)/i.test(normalizedKey);
      if (sensitive) {
        if (raw == null || raw === '') cappedDetails[key] = raw;
        else if (typeof raw === 'object') cappedDetails[key] = '[redacted object]';
        else {
          const s = String(raw);
          cappedDetails[key] = s.length > 4 ? `••••${s.slice(-4)}` : '***';
        }
        return;
      }
      if (typeof raw === 'string' && raw.length > 3500) {
        cappedDetails[key] = `${raw.slice(0, 3500)}… [truncated ${raw.length - 3500} chars]`;
        return;
      }
      cappedDetails[key] = raw;
    });
    addTelegramDiagnosticLog(scope, event, cappedDetails);
    res.json({ ok: true });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, message: error.message || 'Не удалось сохранить клиентское диагностическое событие.' });
  }
});

router.get('/telegram/stable-employee-link', requireAdminAccess(), (req, res) => {
  const token = getConfiguredBotToken();
  if (!token) {
    return res.status(400).json({ message: 'Сначала сохраните токен Telegram-бота.' });
  }
  try {
    const employeeId = String((req.query.employeeId) || '').trim() || String((req.user && req.user._id) || '').trim();
    if (!employeeId) {
      return res.status(400).json({ message: 'Не передан идентификатор сотрудника.' });
    }
    const employee = EmployeeStore.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Сотрудник не найден.' });
    }
    const scope = String(req.query.scope || 'qr-item').trim().slice(0, 80);
    const orderId = String(req.query.orderId || '').trim();
    const link = signTelegramEmployeeDirectLink(token, employee._id.toString(), { orderId, scope });
    res.json({ ok: true, employeeId: employee._id.toString(), scope, orderId, employeeLink: link, expiresInDays: 5 * 365 });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось сгенерировать стабильную ссылку сотрудника.' });
  }
});

router.post('/telegram/webapp/bootstrap', (req, res) => {
  const token = getConfiguredBotToken();
  if (!token) {
    return res.status(400).json({ message: 'Сначала сохраните токен Telegram-бота.' });
  }
  try {
    const payload = req && req.body ? req.body : {};
    const initData = String(payload.initData || '').trim();
    const unsafeUser = payload.unsafeUser && typeof payload.unsafeUser === 'object' ? payload.unsafeUser : null;
    let resolvedTelegramUserId = '';
    if (initData) {
      try {
        const parsed = extractTelegramInitDataUser(initData);
        if (parsed?.id) resolvedTelegramUserId = String(parsed.id);
      } catch { /* ignore */ }
    }
    if (!resolvedTelegramUserId && unsafeUser?.id) {
      resolvedTelegramUserId = String(unsafeUser.id);
    }

    if (!resolvedTelegramUserId) {
      return res.json({
        ok: true,
        needReopen: true,
        needBotAuth: true,
        employee: null,
        employeeLink: null,
        sessionToken: null,
        message: 'Telegram auth payload ещё не загружен в webview. Повторите попытку через несколько секунд или откройте webapp заново через кнопку в боте.',
      });
    }

    const employee = EmployeeStore.findByTelegramUserId(resolvedTelegramUserId);
    if (!employee) {
      return res.status(403).json({
        ok: false,
        needReopen: true,
        message: 'Сотрудник Telegram не найден или не авторизован.',
        telegramUserId: resolvedTelegramUserId ? `...${String(resolvedTelegramUserId).slice(-6)}` : '',
      });
    }
    const scope = String(payload.scope || 'webapp-bootstrap').trim().slice(0, 80);
    const orderId = String(payload.orderId || '').trim();
    const employeeLink = signTelegramEmployeeDirectLink(token, employee._id.toString(), { orderId, scope });
    const nextSessionToken = createTelegramEmployeeSessionToken(token, employee);
    EmployeeStore.touchTelegramUser(employee._id, {
      telegramUsername: unsafeUser?.username ? `@${String(unsafeUser.username).replace(/^@+/, '')}` : employee.telegramUsername || '',
      telegramFirstName: unsafeUser?.first_name || employee.telegramFirstName || '',
      telegramLastName: unsafeUser?.last_name || employee.telegramLastName || '',
    });
    res.json({
      ok: true,
      employee: {
        _id: employee._id,
        fullName: employee.fullName,
        role: employee.role,
        telegramUsername: employee.telegramUsername || '',
        telegramUserId: employee.telegramUserId || '',
      },
      employeeLink,
      sessionToken: nextSessionToken,
      expiresInDays: { employeeLink: 5 * 365, sessionToken: 365 },
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось сгенерировать bootstrap-данные Web App.' });
  }
});

router.get('/employee-directory', express.json({ limit: '4kb' }), async (req, res) => {
  try {
    const employees = (EmployeeStore.list && EmployeeStore.list()) || EmployeeStore.findAll() || [];
    const rows = employees
      .filter(emp => Boolean(emp.code || emp.employeeCode || emp.fullName || emp.name || emp.telegramUsername))
      .map(emp => ({
        code: String(emp.code || emp.employeeCode || '').trim(),
        name: String(emp.fullName || emp.name || '').slice(0, 80),
        role: String(emp.role || '').slice(0, 32),
        username: String(emp.telegramUsername || '').replace(/^@/, '').slice(0, 48),
      }))
      .filter(r => r.code || r.name)
      .sort((a, b) => (a.code || a.name || '').localeCompare(b.code || b.name || ''));
    res.json({ ok: true, count: rows.length, employees: rows });
  } catch (error) {
    res.status(500).json({ ok: false, count: 0, employees: [], message: String(error.message || '') });
  }
});

router.post('/webapp/employee-link-by-code', express.json({ limit: '16kb' }), async (req, res) => {
  try {
    const rawInput = String((req.body || {}).code || '').trim();
    const rawCode = rawInput.toLowerCase();
    if (!rawCode || rawCode.length < 2) {
      return res.status(400).json({ ok: false, retryable: true, message: 'Введите PIN или код сотрудника (минимум 2 символа).' });
    }
    const employees = (EmployeeStore.list && EmployeeStore.list()) || EmployeeStore.findAll() || [];
    let match = null;
    let matchBy = null;
    if (/^\d+$/.test(rawInput)) {
      const pinMatch = EmployeeStore.findByPinCode(rawInput);
      if (pinMatch) {
        match = pinMatch;
        matchBy = 'pin';
      }
    }
    if (!match) {
      match = (employees.find((emp) => {
        const code = String(emp.code || emp.employeeCode || '').toLowerCase();
        const username = String(emp.telegramUsername || '').toLowerCase().replace(/^@/, '');
        const name = String(emp.fullName || emp.name || '').toLowerCase();
        const id6 = String(emp._id || '').slice(-6).toLowerCase();
        if (!code && !username && !name) return false;
        return (code && code === rawCode)
          || (username && username === rawCode)
          || (id6 && id6 === rawCode)
          || (name && rawCode.length >= 3 && name.includes(rawCode));
      }) || null);
      if (match) matchBy = 'code';
    }

    if (!match) {
      addTelegramDiagnosticLog({
        scope: 'telegram-auth',
        level: 'warn',
        event: 'employee-link-by-code.not-found',
        details: { code: rawCode, searched: employees.length },
      });
      const isPinAttempt = /^\d+$/.test(rawInput) && rawInput.length >= 4;
      return res.status(404).json({
        ok: false,
        retryable: true,
        message: isPinAttempt
          ? 'Сотрудник с таким PIN не найден. Проверьте PIN (4-6 цифр) или обратитесь к администратору.'
          : 'Сотрудник с таким кодом не найден. Проверьте код и попробуйте ещё раз.',
      });
    }

    addTelegramDiagnosticLog({
      scope: 'telegram-auth',
      level: 'info',
      event: 'employee-link-by-code.found',
      details: {
        code: rawCode,
        matchBy: matchBy || 'unknown',
        employeeId: match._id ? String(match._id).slice(-8) : '',
        employeeRole: String(match.role || '').slice(0, 80),
        hasTelegramUserId: Boolean(match.telegramUserId),
      },
    });

    const token = getConfiguredBotToken();
    const issuedAt = Date.now();
    const employeeLink = signTelegramEmployeeDirectLink(token, match._id, {
      scope: 'qr-code-employee',
      issuedAt,
    });

    const sessionToken = createTelegramEmployeeSessionToken(token, {
      employeeId: match._id,
      telegramUserId: match.telegramUserId || undefined,
      issuedAt,
    });

    res.json({
      ok: true,
      authPath: 'employee-code',
      employee: {
        _id: match._id,
        fullName: match.fullName,
        role: match.role,
        telegramUsername: match.telegramUsername || '',
        telegramUserId: match.telegramUserId || '',
        code: match.code || match.employeeCode || '',
      },
      employeeLink,
      sessionToken,
      expiresInDays: { employeeLink: 5 * 365, sessionToken: 365 },
    });
  } catch (error) {
    addTelegramDiagnosticLog({
      scope: 'telegram-auth',
      level: 'error',
      event: 'employee-link-by-code.error',
      details: { message: String(error.message || '').slice(0, 255) },
    });
    res.status(error.status || 400).json({ ok: false, message: error.message || 'Не удалось получить доступ по коду сотрудника.' });
  }
});

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

router.post('/telegram/webapp/session', async (req, res) => {
  const token = getConfiguredBotToken();
  if (!token) {
    return res.status(400).json({ message: 'Сначала сохраните токен Telegram-бота.' });
  }

  try {
    let employee = null;
    let telegramUser = null;
    let authPath = 'unknown';
    let authMeta = {};
    const payload = req.body || {};
    const payloadDebug = getTelegramPayloadDebug(payload);
    logTelegramWebAppDebug('session.request', payloadDebug);

    if (payload.employeeLink) {
      try {
        const directLinkPayload = verifyTelegramEmployeeDirectLink(token, payload.employeeLink, { allowGracePeriod: true });
        employee = EmployeeStore.findById(directLinkPayload.employeeId);
        if (!employee) {
          logTelegramWebAppDebug('session.reject.direct-link-employee-not-found', {
            ...payloadDebug,
            employeeId: directLinkPayload.employeeId,
            orderId: directLinkPayload.orderId || '',
            scope: directLinkPayload.scope || '',
          });
          return res.status(403).json({ message: 'Сотрудник по QR не найден. Обновите QR-код через кнопку в боте.' });
        }
        authPath = 'direct-link';
        authMeta = {
          expired: Boolean(directLinkPayload.expired),
          graceAllowed: Boolean(directLinkPayload.graceAllowed),
          scope: directLinkPayload.scope || '',
          orderId: directLinkPayload.orderId || '',
          issuedAt: directLinkPayload.issuedAt || '',
          expiresAt: directLinkPayload.expiresAt || '',
        };
        logTelegramWebAppDebug(authMeta.graceAllowed ? 'session.auth.direct-link-grace' : 'session.auth.direct-link-ok', {
          ...payloadDebug,
          employeeId: employee._id,
          employeeRole: employee.role,
          ...authMeta,
        });
        telegramUser = {
          id: employee.telegramUserId || '',
          username: employee.telegramUsername || '',
          first_name: employee.telegramFirstName || '',
          last_name: employee.telegramLastName || '',
        };
      } catch (directLinkError) {
        logTelegramWebAppDebug('session.auth.direct-link-failed', {
          ...payloadDebug,
          message: directLinkError.message || 'Direct link validation failed.',
          hasSessionToken: Boolean(payload.sessionToken),
          hasInitData: Boolean(String(payload.initData || '').trim()),
          hasUnsafeUserId: Boolean(payload.unsafeUser?.id),
        });
        const hasTelegramAuthPayload = Boolean(String(payload.initData || '').trim() || payload.unsafeUser?.id);
        if (!hasTelegramAuthPayload && !payload.sessionToken) {
          const msg = 'Telegram auth данные ещё не пришли в webview. Повторите попытку или откройте webapp заново через кнопку в боте.';
          return res.status(400).json({ ok: false, needReopen: true, retryable: true, message: msg });
        }
      }
    }

    if (!employee && payload.sessionToken) {
      try {
        const sessionPayload = verifyTelegramEmployeeSessionToken(token, payload.sessionToken, { allowGracePeriod: true });
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
        authPath = 'session-token';
        authMeta = {
          expired: Boolean(sessionPayload.expired),
          graceAllowed: Boolean(sessionPayload.graceAllowed),
        };
        logTelegramWebAppDebug(sessionPayload.graceAllowed ? 'session.auth.session-token-grace' : 'session.auth.session-token-ok', {
          ...payloadDebug,
          employeeId: employee._id,
          employeeRole: employee.role,
          telegramUserId: String(sessionPayload.telegramUserId || ''),
          ...authMeta,
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
          const msg = 'Telegram auth данные ещё не пришли в webview. Повторите попытку или откройте webapp заново через кнопку в боте.';
          return res.status(400).json({ ok: false, needReopen: true, retryable: true, message: msg });
        }
        telegramUser = resolveTelegramWebAppUser(token, payload);
        employee = EmployeeStore.findByTelegramUserId(telegramUser.id);
        authPath = 'payload-fallback';
        logTelegramWebAppDebug('session.auth.payload-fallback', {
          ...payloadDebug,
          resolvedTelegramUserId: String(telegramUser?.id || ''),
          employeeFound: Boolean(employee),
        });
      }
    } else if (!employee) {
      const hasTelegramAuthPayload = Boolean(String(payload.initData || '').trim() || payload.unsafeUser?.id);
      if (!hasTelegramAuthPayload) {
        logTelegramWebAppDebug('session.reject.no-auth-payload', {
          ...payloadDebug,
          hasEmployeeLink: Boolean(payload.employeeLink),
          hasSessionToken: Boolean(payload.sessionToken),
        });
        const msg = 'Telegram auth данные ещё не пришли в webview. Повторите попытку или откройте webapp заново через кнопку в боте.';
        return res.status(400).json({ ok: false, needReopen: true, retryable: true, message: msg });
      }
      telegramUser = resolveTelegramWebAppUser(token, payload);
      employee = EmployeeStore.findByTelegramUserId(telegramUser.id);
      authPath = 'payload-only';
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
        authPath,
      });
      return res.status(403).json({ message: 'Сотрудник Telegram не найден или не авторизован.' });
    }

    EmployeeStore.touchTelegramUser(employee._id, {
      telegramUsername: telegramUser.username ? `@${String(telegramUser.username).replace(/^@+/, '')}` : employee.telegramUsername || '',
      telegramFirstName: telegramUser.first_name || employee.telegramFirstName || '',
      telegramLastName: telegramUser.last_name || employee.telegramLastName || '',
    });

    const nextSessionToken = createTelegramEmployeeSessionToken(token, employee);
    let stableEmployeeLink = String(payload.employeeLink || '').trim();
    if (!stableEmployeeLink) {
      try {
        stableEmployeeLink = signTelegramEmployeeDirectLink(token, employee._id, {
          scope: 'session-return',
          orderId: req.params?.id || req.body?.orderId || undefined,
        });
      } catch { stableEmployeeLink = ''; }
    }
    logTelegramWebAppDebug('session.success', {
      ...payloadDebug,
      authPath,
      employeeId: employee._id,
      employeeRole: employee.role,
      telegramUserId: String(telegramUser?.id || ''),
      issuedSessionTokenTail: maskTelegramValue(nextSessionToken),
      ...authMeta,
    });

    res.json({
      ok: true,
      sessionToken: nextSessionToken,
      employeeLink: stableEmployeeLink || undefined,
      employee: {
        _id: employee._id,
        fullName: employee.fullName,
        role: employee.role,
        telegramUsername: employee.telegramUsername || '',
        telegramUserId: employee.telegramUserId || '',
      },
    });
  } catch (error) {
    logTelegramWebAppDebug('session.error', {
      error: error.message || 'Unknown session resolution error.',
    });
    res.status(error.status || 400).json({ message: error.message || 'Не удалось определить сотрудника.' });
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
