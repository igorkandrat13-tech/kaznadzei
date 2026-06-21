const express = require('express');
const QRCode = require('qrcode');
const OrderStore = require('../stores/orderStore');
const SettingsStore = require('../stores/settingsStore');
const EmployeeStore = require('../stores/employeeStore');
const { requireManagerAccess, requireWriteAccess } = require('../middleware/security');
const { sanitizeCommentInput, sanitizeOrderInput } = require('../utils/validators');
const { addTelegramDiagnosticLog } = require('../services/telegramDiagnostics');
const {
  resolveTelegramWebAppUser,
  verifyTelegramEmployeeSessionToken,
} = require('../services/telegramWebAppAuth');
const router = express.Router();

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

function logTelegramOrderDebug(event, details = {}) {
  addTelegramDiagnosticLog('telegram-order', event, details);
  console.log(`[telegram-order] ${event}`, JSON.stringify(details));
}

function resolveTelegramEmployee(token, payload, context = {}) {
  const payloadDebug = getTelegramPayloadDebug(payload);
  if (payload?.sessionToken) {
    try {
      const sessionPayload = verifyTelegramEmployeeSessionToken(token, payload.sessionToken);
      const employeeBySession = EmployeeStore.findById(sessionPayload.employeeId);
      if (!employeeBySession || String(employeeBySession.telegramUserId || '') !== String(sessionPayload.telegramUserId || '')) {
        logTelegramOrderDebug('resolve.session-mismatch', {
          ...context,
          ...payloadDebug,
          employeeId: sessionPayload.employeeId,
          telegramUserId: String(sessionPayload.telegramUserId || ''),
          employeeFound: Boolean(employeeBySession),
          employeeTelegramUserId: String(employeeBySession?.telegramUserId || ''),
        });
        throw new Error('Сотрудник Telegram не найден или session token устарел.');
      }
      logTelegramOrderDebug('resolve.session-token-ok', {
        ...context,
        ...payloadDebug,
        employeeId: employeeBySession._id,
        employeeRole: employeeBySession.role,
      });
      return employeeBySession;
    } catch (sessionError) {
      const hasTelegramAuthPayload = Boolean(String(payload?.initData || '').trim() || payload?.unsafeUser?.id);
      logTelegramOrderDebug('resolve.session-token-failed', {
        ...context,
        ...payloadDebug,
        hasTelegramAuthPayload,
        message: sessionError.message || 'Session token validation failed.',
      });
      if (!hasTelegramAuthPayload) {
        throw sessionError;
      }
    }
  }

  const telegramUser = resolveTelegramWebAppUser(token, payload || {});
  const employee = EmployeeStore.findByTelegramUserId(telegramUser.id);
  logTelegramOrderDebug('resolve.payload', {
    ...context,
    ...payloadDebug,
    resolvedTelegramUserId: String(telegramUser?.id || ''),
    employeeFound: Boolean(employee),
    employeeId: employee?._id || '',
    employeeRole: employee?.role || '',
  });
  return employee;
}

router.get('/orders', (req, res) => {
  try {
    const orders = OrderStore.findAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Не удалось загрузить заказы.' });
  }
});

router.get('/orders/:id', (req, res) => {
  try {
    const order = OrderStore.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/orders/:id/comments', requireWriteAccess, (req, res) => {
  try {
    const { role, text } = sanitizeCommentInput(req.body || {});
    const comments = OrderStore.addComment(req.params.id, role, text);
    if (!comments) return res.status(404).json({ message: 'Order not found' });
    res.status(201).json(comments);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.post('/orders/:id/telegram-comment', (req, res) => {
  try {
    const token = String(SettingsStore.get().telegramBotToken || '').trim();
    if (!token) {
      return res.status(400).json({ message: 'Токен Telegram-бота не настроен.' });
    }

    const context = {
      route: 'telegram-comment',
      orderId: String(req.params.id || ''),
    };
    const employee = resolveTelegramEmployee(token, req.body || {}, context);
    if (!employee) {
      logTelegramOrderDebug('telegram-comment.reject.employee-not-found', context);
      return res.status(403).json({ message: 'Сотрудник Telegram не найден или не авторизован.' });
    }

    const { role, text } = sanitizeCommentInput({
      role: employee.role,
      text: req.body?.text,
    });

    const comments = OrderStore.addComment(req.params.id, role, text);
    if (!comments) return res.status(404).json({ message: 'Order not found' });

    logTelegramOrderDebug('telegram-comment.success', {
      ...context,
      employeeId: employee._id,
      employeeRole: employee.role,
    });

    res.status(201).json({
      ok: true,
      comments,
      employee: {
        _id: employee._id,
        fullName: employee.fullName,
        role: employee.role,
      },
    });
  } catch (error) {
    logTelegramOrderDebug('telegram-comment.error', {
      route: 'telegram-comment',
      orderId: String(req.params.id || ''),
      ...getTelegramPayloadDebug(req.body || {}),
      message: error.message || 'Не удалось сохранить комментарий из Telegram.',
    });
    res.status(error.status || 400).json({ message: error.message || 'Не удалось сохранить комментарий из Telegram.' });
  }
});

router.post('/orders/:id/telegram-stage-status', (req, res) => {
  try {
    const token = String(SettingsStore.get().telegramBotToken || '').trim();
    if (!token) {
      return res.status(400).json({ message: 'Токен Telegram-бота не настроен.' });
    }

    const context = {
      route: 'telegram-stage-status',
      orderId: String(req.params.id || ''),
      stepId: String(req.body?.stepId || '').trim(),
      requestedStatus: String(req.body?.status || '').trim(),
    };
    const employee = resolveTelegramEmployee(token, req.body || {}, context);
    if (!employee) {
      logTelegramOrderDebug('telegram-stage-status.reject.employee-not-found', context);
      return res.status(403).json({ message: 'Сотрудник Telegram не найден или не авторизован.' });
    }

    const order = OrderStore.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const stepId = String(req.body?.stepId || '').trim();
    const status = String(req.body?.status || '').trim();
    const allowedStatuses = ['pending', 'in_progress', 'completed'];

    if (!stepId) {
      return res.status(400).json({ message: 'Не указан этап заказа.' });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Некорректный статус этапа.' });
    }

    const stage = (order.stages || []).find(item => item.stepId === stepId);
    if (!stage) {
      return res.status(404).json({ message: 'Этап заказа не найден.' });
    }

    if (stage.role !== employee.role) {
      return res.status(403).json({ message: 'Можно менять только статус этапа своей роли.' });
    }

    const updatedOrder = OrderStore.updateStageStatus(req.params.id, stepId, status);
    if (!updatedOrder) {
      return res.status(404).json({ message: 'Не удалось обновить статус этапа.' });
    }

    logTelegramOrderDebug('telegram-stage-status.success', {
      ...context,
      employeeId: employee._id,
      employeeRole: employee.role,
    });

    res.json({
      ok: true,
      order: updatedOrder,
      stage: (updatedOrder.stages || []).find(item => item.stepId === stepId) || null,
      employee: {
        _id: employee._id,
        fullName: employee.fullName,
        role: employee.role,
      },
    });
  } catch (error) {
    logTelegramOrderDebug('telegram-stage-status.error', {
      route: 'telegram-stage-status',
      orderId: String(req.params.id || ''),
      stepId: String(req.body?.stepId || '').trim(),
      requestedStatus: String(req.body?.status || '').trim(),
      ...getTelegramPayloadDebug(req.body || {}),
      message: error.message || 'Не удалось обновить статус этапа из Telegram.',
    });
    res.status(error.status || 400).json({ message: error.message || 'Не удалось обновить статус этапа из Telegram.' });
  }
});

router.delete('/orders/:id/comments/:role', requireWriteAccess, (req, res) => {
  try {
    const role = String(req.params.role || '').trim();
    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }
    const comments = OrderStore.deleteComment(req.params.id, role);
    if (comments === null) return res.status(404).json({ message: 'Order not found' });
    if (comments === false) return res.status(404).json({ message: 'Comment not found' });
    res.json(comments);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.post('/orders', requireManagerAccess(), (req, res) => {
  try {
    const { customer, name, quantity, material, notes, startDate, endDate } = sanitizeOrderInput(req.body || {});
    const stages = OrderStore.buildInitialStages();
    const order = OrderStore.create({
      customer,
      name,
      quantity,
      material,
      notes,
      orderDate: new Date().toISOString().split('T')[0],
      startDate,
      endDate,
      comments: [],
      stages,
      overallStatus: OrderStore.calculateOverallStatus(stages),
    });
    res.status(201).json(order);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.put('/orders/:id', requireManagerAccess(), (req, res) => {
  try {
    const db = require('../stores/store');
    const data = db.load();
    const idx = data.orders.findIndex(o => o._id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Order not found' });
    const updates = sanitizeOrderInput(req.body || {}, { partial: true });
    data.orders[idx] = { ...data.orders[idx], ...updates };
    db.save();
    res.json(data.orders[idx]);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.delete('/orders/:id', requireManagerAccess(), (req, res) => {
  try {
    const db = require('../stores/store');
    const data = db.load();
    const idx = data.orders.findIndex(o => o._id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Order not found' });
    data.orders.splice(idx, 1);
    db.save();
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/orders/:id/stages/:stepId', requireWriteAccess, (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ['pending', 'in_progress', 'completed'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const order = OrderStore.updateStageStatus(req.params.id, req.params.stepId, status);
    if (order === null) return res.status(404).json({ message: 'Order not found' });
    if (order === false) return res.status(404).json({ message: 'Stage not found' });
    res.json(order);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/orders/:id/qrcode', async (req, res) => {
  try {
    const order = OrderStore.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const publicBaseUrl = SettingsStore.get().publicBaseUrl;
    const url = new URL(`/order/${order._id}`, publicBaseUrl).toString();
    const png = await QRCode.toBuffer(url, { width: 400, margin: 2 });
    res.type('image/png').send(png);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
