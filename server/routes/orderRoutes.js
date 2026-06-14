const express = require('express');
const QRCode = require('qrcode');
const OrderStore = require('../stores/orderStore');
const SettingsStore = require('../stores/settingsStore');
const { requireWriteAccess } = require('../middleware/security');
const { sanitizeCommentInput, sanitizeOrderInput } = require('../utils/validators');
const router = express.Router();

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

router.post('/orders', requireWriteAccess, (req, res) => {
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

router.put('/orders/:id', requireWriteAccess, (req, res) => {
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

router.delete('/orders/:id', requireWriteAccess, (req, res) => {
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
