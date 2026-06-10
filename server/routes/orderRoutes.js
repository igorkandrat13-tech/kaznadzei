const express = require('express');
const QRCode = require('qrcode');
const OrderStore = require('../stores/orderStore');
const router = express.Router();

router.get('/orders', (req, res) => {
  try {
    const orders = OrderStore.findAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(orders);
  } catch (error) {
    res.json([]);
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

router.post('/orders/:id/comments', (req, res) => {
  try {
    const { role, text } = req.body;
    if (!role || !text) return res.status(400).json({ message: 'role and text required' });
    const comments = OrderStore.addComment(req.params.id, role, text);
    if (!comments) return res.status(404).json({ message: 'Order not found' });
    res.status(201).json(comments);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/orders', (req, res) => {
  try {
    const { customer, name, quantity, material, notes, startDate, endDate } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    const stages = OrderStore.buildInitialStages();
    const order = OrderStore.create({
      customer: customer || '',
      name: name.trim(),
      quantity: quantity || 1,
      material: material || '',
      notes: notes || '',
      orderDate: new Date().toISOString().split('T')[0],
      startDate: startDate || null,
      endDate: endDate || null,
      comments: [],
      stages,
      overallStatus: OrderStore.calculateOverallStatus(stages),
    });
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/orders/:id', (req, res) => {
  try {
    const db = require('../stores/store');
    const data = db.load();
    const idx = data.orders.findIndex(o => o._id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Order not found' });
    const { customer, name, quantity, material, notes, startDate, endDate } = req.body;
    if (name !== undefined) data.orders[idx].name = name;
    if (customer !== undefined) data.orders[idx].customer = customer;
    if (quantity !== undefined) data.orders[idx].quantity = quantity;
    if (material !== undefined) data.orders[idx].material = material;
    if (notes !== undefined) data.orders[idx].notes = notes;
    if (startDate !== undefined) data.orders[idx].startDate = startDate;
    if (endDate !== undefined) data.orders[idx].endDate = endDate;
    db.save();
    res.json(data.orders[idx]);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/orders/:id', (req, res) => {
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

router.patch('/orders/:id/stages/:stepId', (req, res) => {
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
    const host = req.get('host');
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const url = `${proto}://${host}/order/${order._id}`;
    const png = await QRCode.toBuffer(url, { width: 400, margin: 2 });
    res.type('image/png').send(png);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
