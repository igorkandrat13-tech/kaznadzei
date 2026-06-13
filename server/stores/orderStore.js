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

function getStageMatchIndex(stages, step) {
  return stages.findIndex((stage) => (
    stage.stepId === step._id
    || (stage.stepName === step.stepName && stage.role === step.role)
    || stage.stepName === step.stepName
  ));
}

function syncSingleOrderStages(order, steps) {
  const sourceStages = Array.isArray(order.stages) ? order.stages.slice() : [];
  const remainingStages = sourceStages.slice();
  const nextStages = steps.map((step) => {
    const matchIndex = getStageMatchIndex(remainingStages, step);
    if (matchIndex === -1) {
      return {
        stepId: step._id,
        stepName: step.stepName,
        role: step.role,
        status: 'pending',
        completedAt: null,
      };
    }

    const [matchedStage] = remainingStages.splice(matchIndex, 1);
    return {
      ...matchedStage,
      stepId: step._id,
      stepName: step.stepName,
      role: step.role,
    };
  });

  if (sourceStages.length === 0 && nextStages.length > 0 && nextStages.every((stage) => stage.status === 'pending')) {
    nextStages[0].status = 'in_progress';
  }

  return nextStages;
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

  syncStagesWithProcessSteps() {
    const db = load();
    const steps = ProcessStepStore.findAll().slice().sort(compareSteps);
    let changed = false;

    for (const order of db.orders) {
      const nextStages = syncSingleOrderStages(order, steps);
      const nextOverallStatus = calculateOverallStatus(nextStages);
      const currentStages = JSON.stringify(order.stages || []);

      if (currentStages !== JSON.stringify(nextStages)) {
        order.stages = nextStages;
        changed = true;
      }

      if (order.overallStatus !== nextOverallStatus) {
        order.overallStatus = nextOverallStatus;
        changed = true;
      }
    }

    if (changed) {
      save();
    }

    return changed;
  },

  count() {
    return load().orders.length;
  },

  buildInitialStages,
  calculateOverallStatus,
};

module.exports = OrderStore;
