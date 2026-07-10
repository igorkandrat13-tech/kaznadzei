const express = require('express');
const CustomerStore = require('../stores/customerStore');
const OrderStore = require('../stores/orderStore');
const CustomerTelegramAccessStore = require('../stores/customerTelegramAccessStore');
const CustomerTelegramLogStore = require('../stores/customerTelegramLogStore');
const { requireManagerAccess, requireAdminAccess } = require('../middleware/security');
const { addActivityLog, getRequestActor } = require('../services/activityLog');
const { sanitizeCustomerInput } = require('../utils/validators');
const {
  ensureCustomerOrderAccess,
  getCustomerAccessClosedText,
  getCustomerKeyboardReplyMarkup,
  getCustomerOrderShare,
  getCustomerRemoveKeyboardReplyMarkup,
  issueCustomerOrderAccess,
  sendCustomerTelegramMessage,
} = require('../services/customerTelegramService');

const router = express.Router();

function getCustomerOrders(customerId) {
  return CustomerStore.findLinkedOrders(customerId)
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
}

function mapAccessSummary(access = null) {
  if (!access) {
    return {
      hasAccess: false,
      accessId: '',
      pinLast4: '',
      lastIssuedAt: '',
      telegramLinkedAt: '',
      telegramUsername: '',
      telegramChatId: '',
      logCount: 0,
    };
  }

  const logs = CustomerTelegramLogStore.findAll({ accessId: access._id, limit: 200 });
  return {
    hasAccess: true,
    accessId: access._id,
    pinLast4: access.pinLast4 || '',
    lastIssuedAt: access.lastIssuedAt || '',
    telegramLinkedAt: access.telegramLinkedAt || '',
    telegramUsername: access.telegramUsername || '',
    telegramChatId: access.telegramChatId || '',
    logCount: logs.length,
  };
}

function getReadableOrderStatus(order = {}) {
  const status = String(OrderStore.getOrderOverallStatus(order) || '').trim();
  if (String(order?.archivedAt || '').trim()) return 'archived';
  if (status === 'completed') return 'completed';
  if (status === 'in_progress') return 'in_progress';
  return 'pending';
}

function getItemCurrentStageLabel(item = {}) {
  const stages = Array.isArray(item?.stages) ? item.stages : [];
  const activeStage = stages.find((stage) => stage?.status === 'in_progress');
  if (String(activeStage?.stepName || '').trim()) {
    return String(activeStage.stepName).trim();
  }
  const completedStage = [...stages].reverse().find((stage) => stage?.status === 'completed');
  return String(completedStage?.stepName || '').trim();
}

function mapOrderItems(order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.map((item, index) => ({
    itemId: item?.itemId || '',
    itemNumber: String(item?.itemNumber || index + 1).trim() || String(index + 1),
    name: String(item?.name || '').trim() || `Изделие ${index + 1}`,
    room: String(item?.room || '').trim(),
    roomNumber: String(item?.roomNumber || '').trim(),
    status: String(
      item?.overallStatus
        || OrderStore.calculateItemOverallStatus(
          Array.isArray(item?.stages) ? item.stages : [],
          item?.manualStageMarks || {}
        )
        || ''
    ).trim() || 'pending',
    currentStage: getItemCurrentStageLabel(item),
  }));
}

router.get('/customers', requireManagerAccess(), (req, res) => {
  res.json(CustomerStore.findAll());
});

router.get('/customers/:id/telegram-access', requireManagerAccess(), (req, res) => {
  const customer = CustomerStore.findById(req.params.id);
  if (!customer) {
    return res.status(404).json({ message: 'Заказчик не найден.' });
  }

  const orders = getCustomerOrders(customer._id);
  const items = orders.map((order) => {
    const access = CustomerTelegramAccessStore.findByCustomerAndOrder(customer._id, order._id);
    return {
      orderId: order._id,
      orderNumber: order.orderNumber || '',
      orderName: '',
      archivedAt: order.archivedAt || '',
      updatedAt: order.updatedAt || order.createdAt || '',
      status: getReadableOrderStatus(order),
      itemCount: Array.isArray(order.items) ? order.items.length : 0,
      orderItems: mapOrderItems(order),
      access: mapAccessSummary(access),
    };
  });

  res.json({
    ok: true,
    customer: {
      _id: customer._id,
      fullName: customer.fullName || '',
    },
    items,
  });
});

router.post('/customers/:id/telegram-access/:orderId/regenerate', requireManagerAccess(), async (req, res) => {
  try {
    const payload = await issueCustomerOrderAccess({
      customerId: req.params.id,
      orderId: req.params.orderId,
    });
    const order = OrderStore.findById(req.params.orderId);

    addActivityLog({
      action: 'customer.telegram-access.issue',
      entityType: 'order',
      entityId: req.params.orderId,
      entityName: OrderStore.getOrderPrimaryName(order) || '',
      actor: getRequestActor(req),
      message: 'Для заказчика выпущен новый Telegram PIN-доступ.',
      details: {
        customerId: req.params.id,
        accessId: payload.access._id,
        pinLast4: payload.access.pinLast4 || '',
      },
    });

    res.json({
      ok: true,
      access: mapAccessSummary(payload.access),
      pinCode: payload.pinCode,
      deepLinkUrl: payload.deepLinkUrl,
      qrDataUrl: payload.qrDataUrl,
      botUsername: payload.botUsername,
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось выпустить Telegram-доступ.' });
  }
});

router.post('/customers/:id/telegram-access/:orderId/issue', requireManagerAccess(), async (req, res) => {
  try {
    const payload = await ensureCustomerOrderAccess({
      customerId: req.params.id,
      orderId: req.params.orderId,
    });
    const order = OrderStore.findById(req.params.orderId);

    addActivityLog({
      action: 'customer.telegram-access.ensure',
      entityType: 'order',
      entityId: req.params.orderId,
      entityName: order?.orderNumber || '',
      actor: getRequestActor(req),
      message: payload.createdNewCredentials
        ? 'Для заказчика создан Telegram-доступ.'
        : 'Открыт существующий Telegram-доступ заказчика.',
      details: {
        customerId: req.params.id,
        accessId: payload.access._id,
        pinLast4: payload.access.pinLast4 || '',
        createdNewCredentials: payload.createdNewCredentials,
      },
    });

    res.json({
      ok: true,
      access: mapAccessSummary(payload.access),
      pinCode: payload.pinCode,
      deepLinkUrl: payload.deepLinkUrl,
      qrDataUrl: payload.qrDataUrl,
      botUsername: payload.botUsername,
      createdNewCredentials: payload.createdNewCredentials,
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось подготовить Telegram-доступ.' });
  }
});

router.post('/customers/:id/telegram-access/:orderId/revoke', requireManagerAccess(), async (req, res) => {
  const customer = CustomerStore.findById(req.params.id);
  if (!customer) {
    return res.status(404).json({ message: 'Заказчик не найден.' });
  }

  const order = OrderStore.findById(req.params.orderId);
  if (!order) {
    return res.status(404).json({ message: 'Заказ не найден.' });
  }
  if (!CustomerStore.isOrderLinked(req.params.id, order)) {
    return res.status(400).json({ message: 'Этот заказ не привязан к выбранному заказчику.' });
  }

  const accessBeforeRevoke = CustomerTelegramAccessStore.findByCustomerAndOrder(
    req.params.id,
    req.params.orderId,
    { includeRevoked: true }
  );
  const revokedCount = CustomerTelegramAccessStore.revokeByCustomerAndOrder(req.params.id, req.params.orderId);
  if (!revokedCount) {
    return res.status(400).json({ message: 'Активный Telegram-доступ для этого заказа не найден.' });
  }

  const linkedByUser = accessBeforeRevoke?.telegramUserId
    ? CustomerTelegramAccessStore.findLinkedByTelegramUserId(accessBeforeRevoke.telegramUserId)
    : [];
  const linkedByChat = accessBeforeRevoke?.telegramChatId
    ? CustomerTelegramAccessStore.findLinkedByTelegramChatId(accessBeforeRevoke.telegramChatId)
    : [];
  const remainingActiveAccesses = Array.from(
    new Map(
      [...linkedByUser, ...linkedByChat]
        .filter((access) => String(access?._id || '').trim() !== String(accessBeforeRevoke?._id || '').trim())
        .map((access) => [access._id, access])
    ).values()
  );

  if (accessBeforeRevoke?.telegramChatId || accessBeforeRevoke?.pendingLinkChatId) {
    await sendCustomerTelegramMessage({
      access: accessBeforeRevoke,
      chatId: accessBeforeRevoke.telegramChatId || accessBeforeRevoke.pendingLinkChatId || '',
      telegramUserId: accessBeforeRevoke.telegramUserId || accessBeforeRevoke.pendingLinkTelegramUserId || '',
      type: 'customer.access.revoked',
      text: getCustomerAccessClosedText(order, {
        hasOtherAccesses: remainingActiveAccesses.length > 0,
      }),
      meta: {
        event: 'access-revoked',
        orderNumber: order.orderNumber || '',
      },
      extra: {
        reply_markup: remainingActiveAccesses.length > 0
          ? getCustomerKeyboardReplyMarkup()
          : getCustomerRemoveKeyboardReplyMarkup(),
      },
    }).catch(() => null);
  }

  addActivityLog({
    action: 'customer.telegram-access.revoke',
    entityType: 'order',
    entityId: req.params.orderId,
    entityName: order?.orderNumber || '',
    actor: getRequestActor(req),
    message: 'Telegram-доступ заказчика закрыт.',
    details: {
      customerId: req.params.id,
      orderId: req.params.orderId,
    },
  });

  return res.json({ ok: true });
});

router.get('/customers/:id/telegram-access/:orderId/share', requireManagerAccess(), async (req, res) => {
  try {
    const customer = CustomerStore.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Заказчик не найден.' });
    }

    const order = OrderStore.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ message: 'Заказ не найден.' });
    }
    if (!CustomerStore.isOrderLinked(req.params.id, order)) {
      return res.status(400).json({ message: 'Этот заказ не привязан к выбранному заказчику.' });
    }

    const payload = await getCustomerOrderShare(req.params.orderId);
    res.json({
      ok: true,
      access: mapAccessSummary(payload.access),
      deepLinkUrl: payload.deepLinkUrl,
      qrDataUrl: payload.qrDataUrl,
      botUsername: payload.botUsername,
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Не удалось получить Telegram-ссылку.' });
  }
});

router.get('/customers/:id/telegram-access/:orderId/logs', requireManagerAccess(), (req, res) => {
  const customer = CustomerStore.findById(req.params.id);
  if (!customer) {
    return res.status(404).json({ message: 'Заказчик не найден.' });
  }

  const order = OrderStore.findById(req.params.orderId);
  if (!order) {
    return res.status(404).json({ message: 'Заказ не найден.' });
  }
  if (!CustomerStore.isOrderLinked(req.params.id, order)) {
    return res.status(400).json({ message: 'Этот заказ не привязан к выбранному заказчику.' });
  }

  const access = CustomerTelegramAccessStore.findByCustomerAndOrder(req.params.id, req.params.orderId);
  const logs = CustomerTelegramLogStore.findAll({
    customerId: req.params.id,
    orderId: req.params.orderId,
    accessId: access?._id || '',
    limit: Math.max(1, Math.min(Number(req.query?.limit) || 100, 300)),
  });

  res.json({
    ok: true,
    access: mapAccessSummary(access),
    logs,
  });
});

router.post('/customers', requireManagerAccess(), (req, res) => {
  try {
    const customer = CustomerStore.create(sanitizeCustomerInput(req.body || {}));
    addActivityLog({
      action: 'customer.create',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.fullName || '',
      actor: getRequestActor(req),
      message: 'Карточка заказчика создана.',
      details: {},
    });
    res.status(201).json(customer);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.put('/customers/:id', requireManagerAccess(), (req, res) => {
  try {
    const updates = sanitizeCustomerInput(req.body || {}, { partial: true });
    const customer = CustomerStore.update(req.params.id, updates);
    if (!customer) {
      return res.status(404).json({ message: 'Заказчик не найден.' });
    }
    addActivityLog({
      action: 'customer.update',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.fullName || '',
      actor: getRequestActor(req),
      message: 'Карточка заказчика обновлена.',
      details: { changedFields: Object.keys(updates) },
    });
    res.json(customer);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.delete('/customers/:id', requireAdminAccess(), (req, res) => {
  const customer = CustomerStore.findById(req.params.id);
  if (!customer) {
    return res.status(404).json({ message: 'Заказчик не найден.' });
  }
  CustomerTelegramAccessStore.revokeByCustomerId(req.params.id);
  const deleted = CustomerStore.delete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: 'Заказчик не найден.' });
  }
  addActivityLog({
    action: 'customer.delete',
    entityType: 'customer',
    entityId: customer._id,
    entityName: customer.fullName || '',
    actor: getRequestActor(req),
    message: 'Карточка заказчика удалена.',
    details: {},
  });
  res.json({ ok: true });
});

module.exports = router;
