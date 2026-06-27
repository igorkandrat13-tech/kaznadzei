const { load, save, id } = require('./store');
const ProcessStepStore = require('./processStepStore');
const RoleStore = require('./roleStore');
const EmployeeStore = require('./employeeStore');

function compareSteps(a, b) {
  const roleOrder = RoleStore.findAll({ includeDeleted: true }).map(role => role.key);
  const aIndex = roleOrder.indexOf(a.role);
  const bIndex = roleOrder.indexOf(b.role);
  const roleDiff = (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
  if (roleDiff !== 0) return roleDiff;
  return a.order - b.order;
}

function getEmployeeDisplayName(employee) {
  const fullName = String(employee?.fullName || '').trim();
  if (fullName) return fullName;

  const telegramName = [
    String(employee?.telegramFirstName || '').trim(),
    String(employee?.telegramLastName || '').trim(),
  ].filter(Boolean).join(' ').trim();
  if (telegramName) return telegramName;

  const username = String(employee?.telegramUsername || '').trim();
  if (username) {
    return username.startsWith('@') ? username : `@${username}`;
  }

  return '';
}

function getStageEmployeeName(stage = {}) {
  const currentName = String(stage.employeeName || '').trim();
  if (currentName) return currentName;

  const employeeId = String(stage.employeeId || '').trim();
  if (!employeeId) return '';

  return getEmployeeDisplayName(EmployeeStore.findById(employeeId));
}

function buildInitialStages() {
  const activateFirstStage = arguments[0]?.activateFirstStage === true;
  const steps = ProcessStepStore.findAll().slice().sort(compareSteps);
  return steps.map((step, index) => ({
    stepId: step._id,
    stepName: step.stepName,
    role: step.role,
    status: activateFirstStage && index === 0 ? 'in_progress' : 'pending',
    completedAt: null,
    employeeId: '',
    employeeName: '',
    startedAt: activateFirstStage && index === 0 ? new Date().toISOString() : null,
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
        employeeId: '',
        employeeName: '',
        startedAt: null,
      };
    }

    const [matchedStage] = remainingStages.splice(matchIndex, 1);
    return {
      ...matchedStage,
      stepId: step._id,
      stepName: step.stepName,
      role: step.role,
      employeeId: String(matchedStage?.employeeId || '').trim(),
      employeeName: getStageEmployeeName(matchedStage),
      startedAt: matchedStage?.startedAt || null,
    };
  });

  if (sourceStages.length === 0 && nextStages.length > 0 && nextStages.every((stage) => stage.status === 'pending')) {
    nextStages[0].status = 'in_progress';
  }

  return nextStages;
}

function normalizeComments(source = []) {
  if (!Array.isArray(source)) return [];
  return source
    .map(comment => ({
      role: String(comment?.role || '').trim(),
      text: String(comment?.text || '').trim(),
      createdAt: comment?.createdAt || new Date().toISOString(),
    }))
    .filter(comment => comment.role && comment.text);
}

function cloneStages(stages = []) {
  return Array.isArray(stages)
    ? stages.map(stage => ({
      stepId: stage.stepId,
      stepName: stage.stepName,
      role: stage.role,
      status: stage.status,
      completedAt: stage.completedAt || null,
      employeeId: stage.employeeId || '',
      employeeName: getStageEmployeeName(stage),
      startedAt: stage.startedAt || null,
    }))
    : [];
}

function getDefaultItemNumber(index = 0) {
  return String(index + 1);
}

function buildOrderItem(source = {}, options = {}) {
  const steps = ProcessStepStore.findAll().slice().sort(compareSteps);
  const hasSourceStages = Array.isArray(source.stages) && source.stages.length > 0;
  const stages = hasSourceStages
    ? syncSingleOrderStages({ stages: source.stages }, steps)
    : buildInitialStages({ activateFirstStage: options.activateFirstStage === true });
  const quantity = Number(source.quantity) || 1;
  return {
    itemId: String(source.itemId || source._id || id()).trim(),
    itemNumber: String(source.itemNumber || source.orderItemNumber || options.defaultItemNumber || '').trim() || getDefaultItemNumber(options.index || 0),
    productNumber: String(source.productNumber || source.productCode || '').trim(),
    room: String(source.room || '').trim(),
    roomNumber: String(source.roomNumber || '').trim(),
    quantity: quantity > 0 ? quantity : 1,
    name: String(source.name || '').trim(),
    deliveryDate: String(source.deliveryDate || source.shipmentDate || '').trim(),
    material: String(source.material || '').trim(),
    packageName: String(source.packageName || source.package || '').trim(),
    photoLink: String(source.photoLink || source.link || '').trim(),
    notes: String(source.notes || '').trim(),
    comments: normalizeComments(source.comments),
    stages,
    overallStatus: calculateOverallStatus(stages),
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || source.createdAt || new Date().toISOString(),
  };
}

function syncLegacyFields(order) {
  const primaryItem = Array.isArray(order.items) && order.items.length > 0 ? order.items[0] : null;
  if (!primaryItem) {
    order.name = order.name || '';
    order.quantity = Number(order.quantity) || 1;
    order.material = order.material || '';
    order.notes = order.notes || '';
    order.comments = normalizeComments(order.comments);
    order.stages = cloneStages(order.stages);
    order.overallStatus = calculateOverallStatus(order.stages);
    return;
  }

  order.name = primaryItem.name || '';
  order.quantity = primaryItem.quantity || 1;
  order.material = primaryItem.material || '';
  order.notes = primaryItem.notes || '';
  order.comments = normalizeComments(primaryItem.comments);
  order.stages = cloneStages(primaryItem.stages);
  order.overallStatus = primaryItem.overallStatus || calculateOverallStatus(primaryItem.stages);
}

function ensureOrderShape(order) {
  if (!order || typeof order !== 'object') return false;

  let changed = false;
  const sourceItems = Array.isArray(order.items) ? order.items : [];

  if (!Array.isArray(order.items) || order.items.length === 0) {
    order.items = [
      buildOrderItem({
        itemNumber: '1',
        quantity: order.quantity,
        name: order.name,
        material: order.material,
        notes: order.notes,
        comments: order.comments,
        stages: order.stages,
        overallStatus: order.overallStatus,
        createdAt: order.createdAt,
      }, { defaultItemNumber: '1', index: 0 }),
    ];
    changed = true;
  } else {
    const normalizedItems = order.items.map((item, index) => buildOrderItem({
      ...item,
      name: item?.name || (index === 0 ? order.name : item?.name),
      quantity: item?.quantity || (index === 0 ? order.quantity : item?.quantity),
      material: item?.material || (index === 0 ? order.material : item?.material),
      notes: item?.notes || (index === 0 ? order.notes : item?.notes),
      comments: Array.isArray(item?.comments) ? item.comments : (index === 0 ? order.comments : []),
      stages: Array.isArray(item?.stages) ? item.stages : (index === 0 ? order.stages : []),
      createdAt: item?.createdAt || order.createdAt,
    }, { defaultItemNumber: getDefaultItemNumber(index), index }));

    if (JSON.stringify(sourceItems) !== JSON.stringify(normalizedItems)) {
      order.items = normalizedItems;
      changed = true;
    }
  }

  if (!order.orderDate) {
    order.orderDate = order.createdAt ? String(order.createdAt).split('T')[0] : '';
    changed = true;
  }
  if (!order.customer) {
    order.customer = '';
    changed = true;
  }
  if (!order.startDate) {
    order.startDate = '';
    changed = true;
  }
  if (!order.endDate) {
    order.endDate = '';
    changed = true;
  }

  const snapshotBeforeSync = JSON.stringify({
    name: order.name,
    quantity: order.quantity,
    material: order.material,
    notes: order.notes,
    comments: order.comments,
    stages: order.stages,
    overallStatus: order.overallStatus,
  });
  syncLegacyFields(order);
  if (snapshotBeforeSync !== JSON.stringify({
    name: order.name,
    quantity: order.quantity,
    material: order.material,
    notes: order.notes,
    comments: order.comments,
    stages: order.stages,
    overallStatus: order.overallStatus,
  })) {
    changed = true;
  }

  return changed;
}

function ensureOrders(db) {
  let changed = false;
  db.orders = Array.isArray(db.orders) ? db.orders : [];
  for (const order of db.orders) {
    if (ensureOrderShape(order)) {
      changed = true;
    }
  }
  return changed;
}

function getOrderItem(order, itemId) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return null;
  const normalizedItemId = String(itemId || '').trim();
  if (!normalizedItemId) return items[0];
  return items.find(item => item.itemId === normalizedItemId) || null;
}

function syncOrderStatus(order) {
  if (!order) return;
  ensureOrderShape(order);
  syncLegacyFields(order);
}

const OrderStore = {
  findAll() {
    const db = load();
    ensureOrders(db);
    return db.orders;
  },

  findById(orderId) {
    const db = load();
    ensureOrders(db);
    return db.orders.find(o => o._id === orderId);
  },

  create(data) {
    const db = load();
    const createdAt = new Date().toISOString();
    const sourceItems = Array.isArray(data?.items) && data.items.length > 0
      ? data.items
      : [{
          itemNumber: '1',
          quantity: data.quantity,
          name: data.name,
          material: data.material,
          notes: data.notes,
          comments: data.comments,
          stages: data.stages,
        }];
    const items = sourceItems.map((item, index) => buildOrderItem(item, {
      defaultItemNumber: getDefaultItemNumber(index),
      index,
    }));
    const order = {
      _id: id(),
      orderNumber: data.orderNumber || '',
      customer: data.customer || '',
      orderDate: data.orderDate || '',
      startDate: data.startDate || '',
      endDate: data.endDate || '',
      createdAt,
      items,
    };
    syncLegacyFields(order);
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

  addComment(orderId, itemIdOrRole, roleOrText, maybeText) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find(o => o._id === orderId);
    if (!order) return null;
    const hasItemId = maybeText !== undefined;
    const item = getOrderItem(order, hasItemId ? itemIdOrRole : '');
    if (!item) return null;
    const role = hasItemId ? roleOrText : itemIdOrRole;
    const text = hasItemId ? maybeText : roleOrText;
    item.comments = normalizeComments(item.comments).filter(c => c.role !== role);
    item.comments.push({ role, text, createdAt: new Date().toISOString() });
    item.updatedAt = new Date().toISOString();
    syncOrderStatus(order);
    save();
    return item.comments;
  },

  deleteComment(orderId, itemIdOrRole, maybeRole) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find(o => o._id === orderId);
    if (!order) return null;
    const hasItemId = maybeRole !== undefined;
    const item = getOrderItem(order, hasItemId ? itemIdOrRole : '');
    if (!item || !Array.isArray(item.comments)) {
      return false;
    }
    const role = hasItemId ? maybeRole : itemIdOrRole;
    const nextComments = item.comments.filter(comment => comment.role !== role);
    if (nextComments.length === item.comments.length) {
      return false;
    }
    item.comments = nextComments;
    item.updatedAt = new Date().toISOString();
    syncOrderStatus(order);
    save();
    return item.comments;
  },

  updateStageStatus(orderId, itemIdOrStepId, stepIdOrStatus, maybeStatus) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find(o => o._id === orderId);
    if (!order) return null;
    const hasItemId = maybeStatus !== undefined;
    const item = getOrderItem(order, hasItemId ? itemIdOrStepId : '');
    if (!item) return null;
    const stepId = hasItemId ? stepIdOrStatus : itemIdOrStepId;
    const status = hasItemId ? maybeStatus : stepIdOrStatus;
    const stage = (item.stages || []).find(s => s.stepId === stepId);
    if (!stage) return false;
    stage.status = status;
    stage.completedAt = status === 'completed' ? new Date().toISOString() : null;
    if (status === 'pending') {
      stage.employeeId = '';
      stage.employeeName = '';
      stage.startedAt = null;
    } else if (status === 'in_progress' && !stage.startedAt) {
      stage.startedAt = new Date().toISOString();
    }
    item.overallStatus = calculateOverallStatus(item.stages);
    item.updatedAt = new Date().toISOString();
    syncOrderStatus(order);
    save();
    return order;
  },

  markItemRoleInProgress(orderId, itemId, role, employee = {}) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find(o => o._id === orderId);
    if (!order) return null;
    const item = getOrderItem(order, itemId);
    if (!item) return false;
    const roleStages = (item.stages || []).filter(stage => stage.role === role);
    if (roleStages.length === 0) return false;
    const stageToActivate = roleStages.find(stage => stage.status === 'in_progress')
      || roleStages.find(stage => stage.status === 'pending');
    if (!stageToActivate) {
      return order;
    }
    let changed = false;
    if (stageToActivate.status !== 'in_progress') {
      stageToActivate.status = 'in_progress';
      stageToActivate.completedAt = null;
      changed = true;
    }
    const employeeId = String(employee.employeeId || employee._id || '').trim();
    const employeeName = String(employee.employeeName || employee.fullName || '').trim();
    if (employeeId && stageToActivate.employeeId !== employeeId) {
      stageToActivate.employeeId = employeeId;
      changed = true;
    }
    if (employeeName && stageToActivate.employeeName !== employeeName) {
      stageToActivate.employeeName = employeeName;
      changed = true;
    }
    if (!stageToActivate.startedAt) {
      stageToActivate.startedAt = new Date().toISOString();
      changed = true;
    }
    if (changed) {
      item.overallStatus = calculateOverallStatus(item.stages);
      item.updatedAt = new Date().toISOString();
      syncOrderStatus(order);
      save();
    }
    return order;
  },

  update(orderId, updates = {}) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find(o => o._id === orderId);
    if (!order) return null;

    if (updates.orderNumber !== undefined) order.orderNumber = updates.orderNumber;
    if (updates.customer !== undefined) order.customer = updates.customer;
    if (updates.orderDate !== undefined) order.orderDate = updates.orderDate;
    if (updates.startDate !== undefined) order.startDate = updates.startDate;
    if (updates.endDate !== undefined) order.endDate = updates.endDate;

    if (Array.isArray(updates.items)) {
      order.items = updates.items.map((item, index) => buildOrderItem(item, {
        defaultItemNumber: getDefaultItemNumber(index),
        index,
      }));
    } else {
      const primaryItem = getOrderItem(order);
      if (primaryItem) {
        if (updates.name !== undefined) primaryItem.name = updates.name;
        if (updates.quantity !== undefined) primaryItem.quantity = Number(updates.quantity) || 1;
        if (updates.material !== undefined) primaryItem.material = updates.material;
        if (updates.notes !== undefined) primaryItem.notes = updates.notes;
        primaryItem.updatedAt = new Date().toISOString();
      }
    }

    ensureOrderShape(order);
    save();
    return order;
  },

  syncStagesWithProcessSteps() {
    const db = load();
    ensureOrders(db);
    const steps = ProcessStepStore.findAll().slice().sort(compareSteps);
    let changed = false;

    for (const order of db.orders) {
      for (const item of order.items || []) {
        const nextStages = syncSingleOrderStages(item, steps);
        const nextOverallStatus = calculateOverallStatus(nextStages);
        const currentStages = JSON.stringify(item.stages || []);

        if (currentStages !== JSON.stringify(nextStages)) {
          item.stages = nextStages;
          changed = true;
        }

        if (item.overallStatus !== nextOverallStatus) {
          item.overallStatus = nextOverallStatus;
          changed = true;
        }
      }
      syncLegacyFields(order);
    }

    if (changed) {
      save();
    }

    return changed;
  },

  count() {
    return this.findAll().length;
  },

  buildInitialStages,
  calculateOverallStatus,
  getOrderItem,
  ensureOrders,
};

module.exports = OrderStore;
