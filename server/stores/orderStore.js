const { load, save, id } = require('./store');
const ProcessStepStore = require('./processStepStore');

const ROLE_ORDER = ['carpenter', 'assembler', 'painter', 'designer'];

function compareSteps(a, b) {
  const roleDiff = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
  if (roleDiff !== 0) return roleDiff;
  return a.order - b.order;
}

function buildInitialStages() {
  const steps = ProcessStepStore.findAll().slice().sort(compareSteps);
  return steps.map((step, index) => ({
    stepId: step._id,
    stepName: step.stepName,
    role: step.role,
    status: index === 0 ? 'in_progress' : 'pending',
    completedAt: null,
  }));
}

function calculateOverallStatus(stages) {
  if (!Array.isArray(stages) || stages.length === 0) return 'pending';
  if (stages.every(stage => stage.status === 'completed')) return 'completed';
  if (stages.every(stage => stage.status === 'pending')) return 'pending';
  return 'in_progress';
}

const OrderStore = {
  findAll() {
    return load().orders;
  },

  findById(orderId) {
    return load().orders.find(o => o._id === orderId);
  },

  create(data) {
    const db = load();
    const order = { _id: id(), ...data, createdAt: new Date().toISOString() };
    db.orders.push(order);
    save();
    return order;
  },

  insertMany(arr) {
    const db = load();
    const orders = arr.map(d => ({ _id: id(), ...d, createdAt: new Date().toISOString() }));
    db.orders.push(...orders);
    save();
    return orders;
  },

  deleteMany() {
    const db = load();
    db.orders = [];
    save();
  },

  addComment(orderId, role, text) {
    const db = load();
    const order = db.orders.find(o => o._id === orderId);
    if (!order) return null;
    if (!order.comments) order.comments = [];
    order.comments = order.comments.filter(c => c.role !== role);
    order.comments.push({ role, text, createdAt: new Date().toISOString() });
    save();
    return order.comments;
  },

  updateStageStatus(orderId, stepId, status) {
    const db = load();
    const order = db.orders.find(o => o._id === orderId);
    if (!order) return null;
    const stage = (order.stages || []).find(s => s.stepId === stepId);
    if (!stage) return false;
    stage.status = status;
    stage.completedAt = status === 'completed' ? new Date().toISOString() : null;
    order.overallStatus = calculateOverallStatus(order.stages);
    save();
    return order;
  },

  count() {
    return load().orders.length;
  },

  buildInitialStages,
  calculateOverallStatus,
};

module.exports = OrderStore;
