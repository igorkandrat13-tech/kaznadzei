const express = require('express');
const QRCode = require('qrcode');
const OrderStore = require('../stores/orderStore');
const SettingsStore = require('../stores/settingsStore');
const EmployeeStore = require('../stores/employeeStore');
const { requireAdminAccess, requireManagerAccess, requireWriteAccess } = require('../middleware/security');
const { sanitizeCommentInput, sanitizeOrderInput, sanitizeOrderItemInput } = require('../utils/validators');
const { addTelegramDiagnosticLog } = require('../services/telegramDiagnostics');
const { addActivityLog, getRequestActor } = require('../services/activityLog');
const { notifyOrderCreated } = require('../services/orderNotifications');
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

function getTelegramEmployeeDisplayName(employee, telegramUser = null) {
  const fullName = String(employee?.fullName || '').trim();
  if (fullName) return fullName;

  const employeeTelegramName = [
    String(employee?.telegramFirstName || '').trim(),
    String(employee?.telegramLastName || '').trim(),
  ].filter(Boolean).join(' ').trim();
  if (employeeTelegramName) return employeeTelegramName;

  const telegramUserName = [
    String(telegramUser?.first_name || '').trim(),
    String(telegramUser?.last_name || '').trim(),
  ].filter(Boolean).join(' ').trim();
  if (telegramUserName) return telegramUserName;

  const username = String(employee?.telegramUsername || telegramUser?.username || '').trim();
  if (username) {
    return username.startsWith('@') ? username : `@${username}`;
  }

  return '';
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
      return {
        ...employeeBySession,
        fullName: getTelegramEmployeeDisplayName(employeeBySession),
      };
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
  if (!employee) return employee;

  return {
    ...employee,
    fullName: getTelegramEmployeeDisplayName(employee, telegramUser),
  };
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function sanitizeOrderItemsPayload(payload) {
  if (payload === undefined) return undefined;
  if (!Array.isArray(payload) || payload.length === 0) {
    fail('Добавьте хотя бы одно изделие в заказ.');
  }
  return payload.map((item, index) => ({
    ...sanitizeOrderItemInput(item || {}),
    itemNumber: String(item?.itemNumber || index + 1).trim() || String(index + 1),
  }));
}

function getOrderItemOrFail(order, itemId) {
  const item = OrderStore.getOrderItem(order, itemId);
  if (!item) {
    fail('Изделие заказа не найдено.', 404);
  }
  return item;
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
    const itemId = String(req.body?.itemId || '').trim();
    const { role, text } = sanitizeCommentInput(req.body || {});
    const comments = itemId
      ? OrderStore.addComment(req.params.id, itemId, role, text)
      : OrderStore.addComment(req.params.id, role, text);
    if (!comments) return res.status(404).json({ message: 'Order not found' });
    const order = OrderStore.findById(req.params.id);
    const item = OrderStore.getOrderItem(order, itemId);
    addActivityLog({
      action: 'order.comment.upsert',
      entityType: 'order',
      entityId: req.params.id,
      entityName: item?.name || order?.name || '',
      actor: getRequestActor(req, { label: 'Сотрудник' }),
      message: `Комментарий по роли "${role}" сохранен.`,
      details: { role, itemId: item?.itemId || '', textLength: text.length },
    });
    res.status(201).json(comments);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

function handleManualStageMarks(req, res) {
  try {
    const legendKey = String(req.body?.legendKey || '').trim();
    const selections = Array.isArray(req.body?.selections) ? req.body.selections : [];

    if (selections.length === 0) {
      return res.status(400).json({ message: 'Не выбраны ячейки для обновления.' });
    }

    const normalizedSelections = selections.map((selection) => ({
      orderId: String(selection?.orderId || '').trim(),
      itemId: String(selection?.itemId || '').trim(),
      columnKey: String(selection?.columnKey || '').trim(),
    })).filter(selection => selection.orderId && selection.itemId && selection.columnKey);

    if (normalizedSelections.length === 0) {
      return res.status(400).json({ message: 'Некорректный список ячеек.' });
    }

    const updatedOrders = OrderStore.setManualStageMarks(
      normalizedSelections,
      legendKey,
      req.auth?.role || 'admin'
    );

    if (updatedOrders === false) {
      return res.status(400).json({ message: 'Не удалось обновить ручные этапные отметки.' });
    }

    addActivityLog({
      action: legendKey ? 'order.manual-stage.apply' : 'order.manual-stage.clear',
      entityType: 'order',
      entityId: normalizedSelections[0]?.orderId || '',
      entityName: normalizedSelections.length === 1
        ? (OrderStore.getOrderPrimaryName(updatedOrders[0]) || '')
        : `Массовое обновление (${normalizedSelections.length} ячеек)`,
      actor: getRequestActor(req, { label: 'Администратор' }),
      message: legendKey
        ? `Ручной этап "${legendKey}" применен к ${normalizedSelections.length} ячейкам таблицы.`
        : `Ручные этапные отметки очищены для ${normalizedSelections.length} ячеек таблицы.`,
      details: {
        legendKey,
        selections: normalizedSelections.length,
      },
    });

    res.json({
      ok: true,
      updatedOrders,
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось обновить ручные этапные отметки.' });
  }
}

router.patch('/orders/manual-stage-marks', requireAdminAccess(), handleManualStageMarks);
router.post('/orders/manual-stage-marks', requireAdminAccess(), handleManualStageMarks);

router.post('/orders/:id/telegram-comment', (req, res) => {
  try {
    const token = String(SettingsStore.get().telegramBotToken || '').trim();
    if (!token) {
      return res.status(400).json({ message: 'Токен Telegram-бота не настроен.' });
    }

    const context = {
      route: 'telegram-comment',
      orderId: String(req.params.id || ''),
      itemId: String(req.body?.itemId || '').trim(),
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

    const comments = context.itemId
      ? OrderStore.addComment(req.params.id, context.itemId, role, text)
      : OrderStore.addComment(req.params.id, role, text);
    if (!comments) return res.status(404).json({ message: 'Order not found' });
    const order = OrderStore.findById(req.params.id);
    const item = getOrderItemOrFail(order, context.itemId);

    logTelegramOrderDebug('telegram-comment.success', {
      ...context,
      employeeId: employee._id,
      employeeRole: employee.role,
    });

    addActivityLog({
      action: 'order.comment.telegram',
      entityType: 'order',
      entityId: req.params.id,
      entityName: item.name || order?.name || '',
      actor: {
        type: 'telegram',
        role: employee.role,
        name: employee.fullName,
        label: `TG: ${employee.fullName}`,
      },
      message: 'Комментарий сохранен из Telegram.',
      details: { role: employee.role, itemId: item.itemId, textLength: text.length },
    });

    res.status(201).json({
      ok: true,
      comments,
      item,
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
      itemId: String(req.body?.itemId || '').trim(),
      ...getTelegramPayloadDebug(req.body || {}),
      message: error.message || 'Не удалось сохранить комментарий из Telegram.',
    });
    res.status(error.status || 400).json({ message: error.message || 'Не удалось сохранить комментарий из Telegram.' });
  }
});

router.post('/orders/:id/telegram-item-scan', (req, res) => {
  try {
    const token = String(SettingsStore.get().telegramBotToken || '').trim();
    if (!token) {
      return res.status(400).json({ message: 'Токен Telegram-бота не настроен.' });
    }

    const context = {
      route: 'telegram-item-scan',
      orderId: String(req.params.id || ''),
      itemId: String(req.body?.itemId || '').trim(),
    };
    const employee = resolveTelegramEmployee(token, req.body || {}, context);
    if (!employee) {
      logTelegramOrderDebug('telegram-item-scan.reject.employee-not-found', context);
      return res.status(403).json({ message: 'Сотрудник Telegram не найден или не авторизован.' });
    }
    if (!context.itemId) {
      return res.status(400).json({ message: 'Не указан идентификатор изделия.' });
    }

    const updatedOrder = OrderStore.markItemRoleInProgress(req.params.id, context.itemId, employee.role, {
      _id: employee._id,
      fullName: employee.fullName,
    });
    if (!updatedOrder) {
      return res.status(404).json({ message: 'Заказ не найден.' });
    }
    if (updatedOrder === false) {
      return res.status(404).json({ message: 'Изделие заказа не найдено.' });
    }

    const updatedItem = getOrderItemOrFail(updatedOrder, context.itemId);
    logTelegramOrderDebug('telegram-item-scan.success', {
      ...context,
      employeeId: employee._id,
      employeeRole: employee.role,
    });

    addActivityLog({
      action: 'order.item.scan.telegram',
      entityType: 'orderItem',
      entityId: updatedItem.itemId,
      entityName: updatedItem.name || '',
      actor: {
        type: 'telegram',
        role: employee.role,
        name: employee.fullName,
        label: `TG: ${employee.fullName}`,
      },
      message: 'Изделие открыто сотрудником по QR-коду.',
      details: {
        orderId: req.params.id,
        itemId: updatedItem.itemId,
        role: employee.role,
      },
    });

    res.json({
      ok: true,
      order: updatedOrder,
      item: updatedItem,
      employee: {
        _id: employee._id,
        fullName: employee.fullName,
        role: employee.role,
      },
    });
  } catch (error) {
    logTelegramOrderDebug('telegram-item-scan.error', {
      route: 'telegram-item-scan',
      orderId: String(req.params.id || ''),
      itemId: String(req.body?.itemId || '').trim(),
      ...getTelegramPayloadDebug(req.body || {}),
      message: error.message || 'Не удалось отметить изделие как взятое в работу.',
    });
    res.status(error.status || 400).json({ message: error.message || 'Не удалось отметить изделие как взятое в работу.' });
  }
});

router.delete('/orders/:id/comments/:role', requireWriteAccess, (req, res) => {
  try {
    const itemId = String(req.query?.itemId || '').trim();
    const role = String(req.params.role || '').trim();
    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }
    const comments = itemId
      ? OrderStore.deleteComment(req.params.id, itemId, role)
      : OrderStore.deleteComment(req.params.id, role);
    if (comments === null) return res.status(404).json({ message: 'Order not found' });
    if (comments === false) return res.status(404).json({ message: 'Comment not found' });
    const order = OrderStore.findById(req.params.id);
    const item = OrderStore.getOrderItem(order, itemId);
    addActivityLog({
      action: 'order.comment.delete',
      entityType: 'order',
      entityId: req.params.id,
      entityName: item?.name || order?.name || '',
      actor: getRequestActor(req, { label: 'Сотрудник' }),
      message: `Комментарий по роли "${role}" удален.`,
      details: { role, itemId: item?.itemId || '' },
    });
    res.json(comments);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.post('/orders', requireManagerAccess(), (req, res) => {
  try {
    const { orderNumber, customer, name, quantity, material, notes, orderDate, startDate, endDate } = sanitizeOrderInput(req.body || {});
    const items = sanitizeOrderItemsPayload(req.body?.items) || [{
      itemNumber: '1',
      quantity,
      name,
      material,
      notes,
    }];
    const order = OrderStore.create({
      orderNumber,
      customer,
      orderDate: orderDate || new Date().toISOString().split('T')[0],
      startDate,
      endDate,
      items,
    });
    addActivityLog({
      action: 'order.create',
      entityType: 'order',
      entityId: order._id,
      entityName: OrderStore.getOrderPrimaryName(order) || '',
      actor: getRequestActor(req),
      message: 'Создан новый заказ.',
      details: {
        orderNumber: order.orderNumber || '',
        customer: order.customer || '',
        items: (order.items || []).length,
      },
    });
    notifyOrderCreated(order).catch(() => {});
    res.status(201).json(order);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.put('/orders/:id', requireManagerAccess(), (req, res) => {
  try {
    const updates = sanitizeOrderInput(req.body || {}, { partial: true });
    const items = sanitizeOrderItemsPayload(req.body?.items);
    const previousOrder = OrderStore.findById(req.params.id);
    if (!previousOrder) return res.status(404).json({ message: 'Order not found' });
    const nextOrder = OrderStore.update(req.params.id, {
      ...updates,
      ...(items ? { items } : {}),
    });
    addActivityLog({
      action: 'order.update',
      entityType: 'order',
      entityId: req.params.id,
      entityName: OrderStore.getOrderPrimaryName(nextOrder) || '',
      actor: getRequestActor(req),
      message: 'Заказ обновлен.',
      details: {
        changedFields: Object.keys({ ...updates, ...(items ? { items: true } : {}) }),
        orderNumber: nextOrder?.orderNumber || '',
        notesChanged: OrderStore.getOrderPrimaryNotes(previousOrder) !== OrderStore.getOrderPrimaryNotes(nextOrder),
      },
    });
    res.json(nextOrder);
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
    const deletedOrder = data.orders[idx];
    data.orders.splice(idx, 1);
    db.save();
    addActivityLog({
      action: 'order.delete',
      entityType: 'order',
      entityId: req.params.id,
      entityName: OrderStore.getOrderPrimaryName(deletedOrder) || '',
      actor: getRequestActor(req),
      message: 'Заказ удален.',
      details: {
        orderNumber: deletedOrder?.orderNumber || '',
        customer: deletedOrder?.customer || '',
      },
    });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/orders/:id/items/:itemId/qrcode', async (req, res) => {
  try {
    const order = OrderStore.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const item = OrderStore.getOrderItem(order, req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Order item not found' });
    const publicBaseUrl = SettingsStore.get().publicBaseUrl;
    const url = new URL(`/order/${order._id}/item/${item.itemId}`, publicBaseUrl).toString();
    const png = await QRCode.toBuffer(url, { width: 400, margin: 2 });
    res.type('image/png').send(png);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/orders/:id/qrcode', async (req, res) => {
  try {
    const order = OrderStore.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const item = OrderStore.getOrderItem(order);
    if (!item) return res.status(404).json({ message: 'Order item not found' });
    const publicBaseUrl = SettingsStore.get().publicBaseUrl;
    const url = new URL(`/order/${order._id}/item/${item.itemId}`, publicBaseUrl).toString();
    const png = await QRCode.toBuffer(url, { width: 400, margin: 2 });
    res.type('image/png').send(png);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
