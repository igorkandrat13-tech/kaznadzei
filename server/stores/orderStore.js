const { load, save, id } = require('./store');
const ProcessStepStore = require('./processStepStore');
const RoleStore = require('./roleStore');
const EmployeeStore = require('./employeeStore');

const MANUAL_STAGE_ORDER = ['unprocessed', 'brief', 'drafting', 'stock', 'assembly', 'paint', 'postpaint', 'ready'];
const MANUAL_STAGE_STATUS = {
  unprocessed: 'pending',
  ready: 'completed',
};
const ORDER_MANUFACTURING_STAGE_COLUMN_KEYS = [
  'room',
  'roomNumber',
  'itemNumber',
  'quantity',
  'name',
  'deliveryDate',
  'material',
  'packageName',
  'paint',
  'photoLink',
  'notes',
  'carpenter',
];

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

function normalizeWorkerAssignments(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};

  return Object.entries(source).reduce((acc, [role, assignment]) => {
    const roleKey = String(role || '').trim();
    if (!roleKey || !assignment || typeof assignment !== 'object') return acc;

    const employeeId = String(assignment.employeeId || assignment._id || '').trim();
    const employeeName = String(assignment.employeeName || assignment.fullName || assignment.name || '').trim();
    const scannedAt = assignment.scannedAt || assignment.startedAt || assignment.takenAt || null;
    if (!employeeId && !employeeName && !scannedAt) return acc;

    acc[roleKey] = {
      employeeId,
      employeeName,
      scannedAt,
    };
    return acc;
  }, {});
}

function getWorkerAssignmentsFromStages(stages = []) {
  if (!Array.isArray(stages) || stages.length === 0) return {};

  return stages.reduce((acc, stage) => {
    const role = String(stage?.role || '').trim();
    if (!role) return acc;

    const employeeId = String(stage?.employeeId || '').trim();
    const employeeName = getStageEmployeeName(stage);
    const scannedAt = stage?.startedAt || null;
    if (!employeeId && !employeeName && !scannedAt) return acc;

    const current = acc[role];
    const nextAssignment = { employeeId, employeeName, scannedAt };
    const currentHasName = Boolean(String(current?.employeeName || '').trim());
    const nextHasName = Boolean(String(employeeName || '').trim());
    const currentIsActive = Boolean(current?.scannedAt);
    const nextIsActive = stage?.status === 'in_progress' || Boolean(scannedAt);

    if (!current || (!currentHasName && nextHasName) || (!currentIsActive && nextIsActive)) {
      acc[role] = nextAssignment;
    }

    return acc;
  }, {});
}

function mergeWorkerAssignments(sourceAssignments = {}, stages = []) {
  return {
    ...getWorkerAssignmentsFromStages(stages),
    ...normalizeWorkerAssignments(sourceAssignments),
  };
}

function normalizeManualStageMarks(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};

  return Object.entries(source).reduce((acc, [columnKey, mark]) => {
    const normalizedColumnKey = String(columnKey || '').trim();
    if (!normalizedColumnKey || !mark || typeof mark !== 'object') return acc;

    const legendKey = String(mark.legendKey || '').trim();
    if (!legendKey || !MANUAL_STAGE_ORDER.includes(legendKey)) return acc;

    acc[normalizedColumnKey] = {
      legendKey,
      updatedAt: mark.updatedAt || new Date().toISOString(),
      updatedBy: String(mark.updatedBy || '').trim(),
    };
    return acc;
  }, {});
}

function normalizeManualStageClears(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};

  return Object.entries(source).reduce((acc, [columnKey, clearMeta]) => {
    const normalizedColumnKey = String(columnKey || '').trim();
    if (!normalizedColumnKey || !clearMeta || typeof clearMeta !== 'object') return acc;

    acc[normalizedColumnKey] = {
      updatedAt: clearMeta.updatedAt || new Date().toISOString(),
      updatedBy: String(clearMeta.updatedBy || '').trim(),
    };
    return acc;
  }, {});
}

function normalizeOrderAttachments(source = []) {
  if (!Array.isArray(source)) return [];

  return source.reduce((acc, attachment) => {
    if (!attachment || typeof attachment !== 'object') return acc;

    const rawName = String(attachment.name || '').trim();
    const name = /[ÐÑÃ]/.test(rawName)
      ? (() => {
          try {
            const decoded = Buffer.from(rawName, 'latin1').toString('utf8').trim();
            return /[А-Яа-яЁё]/.test(decoded) ? decoded : rawName;
          } catch {
            return rawName;
          }
        })()
      : rawName;
    const content = String(attachment.content || '').trim();
    const relativePath = String(attachment.relativePath || '').trim().replace(/\\/g, '/');
    if (!name || (!content && !relativePath)) return acc;

    acc.push({
      attachmentId: String(attachment.attachmentId || attachment._id || id()).trim(),
      name,
      type: String(attachment.type || '').trim(),
      size: Number(attachment.size) || 0,
      storedName: String(attachment.storedName || '').trim(),
      relativePath,
      content,
      uploadedAt: attachment.uploadedAt || new Date().toISOString(),
    });
    return acc;
  }, []);
}

function getAttachmentNameKey(fileName = '') {
  return String(fileName || '').trim().toLowerCase();
}

function findAttachmentIndexByName(attachments = [], attachmentName = '') {
  const targetKey = getAttachmentNameKey(attachmentName);
  if (!targetKey) return -1;
  return normalizeOrderAttachments(attachments).findIndex((attachment) => (
    getAttachmentNameKey(attachment.name) === targetKey
  ));
}

function getManualStageLegendKey(manualStageMarks = {}) {
  const marks = Object.values(normalizeManualStageMarks(manualStageMarks));
  if (marks.length === 0) return '';

  return marks.reduce((currentKey, mark) => {
    if (!currentKey) return mark.legendKey;
    return MANUAL_STAGE_ORDER.indexOf(mark.legendKey) > MANUAL_STAGE_ORDER.indexOf(currentKey)
      ? mark.legendKey
      : currentKey;
  }, '');
}

function getManualStageStatus(manualStageMarks = {}) {
  const legendKey = getManualStageLegendKey(manualStageMarks);
  if (!legendKey) return '';
  return MANUAL_STAGE_STATUS[legendKey] || 'in_progress';
}

function calculateItemOverallStatus(stages, manualStageMarks = {}) {
  const manualStatus = getManualStageStatus(manualStageMarks);
  if (manualStatus) return manualStatus;
  return calculateOverallStatus(stages);
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
  const workerAssignments = mergeWorkerAssignments(source.workerAssignments, stages);
  const manualStageMarks = normalizeManualStageMarks(source.manualStageMarks);
  const manualStageClears = normalizeManualStageClears(source.manualStageClears);
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
    workerAssignments,
    manualStageMarks,
    manualStageClears,
    stages,
    overallStatus: calculateItemOverallStatus(stages, manualStageMarks),
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || source.createdAt || new Date().toISOString(),
  };
}

function getOrderPrimaryItem(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items[0] || null;
}

function getOrderStages(order) {
  const primaryItem = getOrderPrimaryItem(order);
  if (Array.isArray(primaryItem?.stages)) return primaryItem.stages;
  return Array.isArray(order?.stages) ? cloneStages(order.stages) : [];
}

function getOrderComments(order) {
  const primaryItem = getOrderPrimaryItem(order);
  if (Array.isArray(primaryItem?.comments)) return normalizeComments(primaryItem.comments);
  return normalizeComments(order?.comments);
}

function getOrderOverallStatus(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length === 0) {
    return calculateOverallStatus(getOrderStages(order));
  }
  if (items.every(item => item?.overallStatus === 'completed')) return 'completed';
  if (items.every(item => (item?.overallStatus || 'pending') === 'pending')) return 'pending';
  return 'in_progress';
}

function getOrderPrimaryName(order) {
  const primaryItem = getOrderPrimaryItem(order);
  return String(primaryItem?.name || order?.name || '').trim();
}

function getOrderPrimaryQuantity(order) {
  const primaryItem = getOrderPrimaryItem(order);
  return Number(primaryItem?.quantity || order?.quantity) || 1;
}

function getOrderPrimaryMaterial(order) {
  const primaryItem = getOrderPrimaryItem(order);
  return String(primaryItem?.material || order?.material || '').trim();
}

function getOrderPrimaryNotes(order) {
  const primaryItem = getOrderPrimaryItem(order);
  return String(primaryItem?.notes || order?.notes || '').trim();
}

function hasLegacyPrimaryItemData(order = {}) {
  return Boolean(
    String(order?.name || '').trim()
    || Number(order?.quantity)
    || String(order?.material || '').trim()
    || String(order?.notes || '').trim()
    || (Array.isArray(order?.comments) && order.comments.length > 0)
    || (Array.isArray(order?.stages) && order.stages.length > 0)
    || (order?.manualStageMarks && Object.keys(order.manualStageMarks).length > 0)
    || (order?.manualStageClears && Object.keys(order.manualStageClears).length > 0)
  );
}

function deriveOrderManufacturingMeta(order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const markTimestamps = [];
  let isCompleted = items.length > 0;

  for (const item of items) {
    const manualStageMarks = normalizeManualStageMarks(item?.manualStageMarks);

    for (const columnKey of ORDER_MANUFACTURING_STAGE_COLUMN_KEYS) {
      const mark = manualStageMarks[columnKey];
      if (mark?.updatedAt) {
        markTimestamps.push(String(mark.updatedAt));
      } else {
        isCompleted = false;
      }
    }
  }

  const sortedTimestamps = markTimestamps.slice().sort();
  const startAt = sortedTimestamps[0] || '';
  const endAt = isCompleted ? (sortedTimestamps.at(-1) || '') : '';

  return {
    startAt,
    endAt,
    startDate: startAt ? startAt.split('T')[0] : '',
    endDate: endAt ? endAt.split('T')[0] : '',
    isCompleted,
  };
}

function cleanupLegacyOrderFields(order) {
  const legacyKeys = ['name', 'quantity', 'material', 'notes', 'comments', 'stages', 'overallStatus'];
  let changed = false;

  for (const key of legacyKeys) {
    if (Object.prototype.hasOwnProperty.call(order, key)) {
      delete order[key];
      changed = true;
    }
  }

  return changed;
}

function ensureOrderShape(order) {
  if (!order || typeof order !== 'object') return false;

  let changed = false;
  const sourceItems = Array.isArray(order.items) ? order.items : [];

  if (!Array.isArray(order.items) || order.items.length === 0) {
    const normalizedItems = hasLegacyPrimaryItemData(order)
      ? [
          buildOrderItem({
            itemNumber: '1',
            quantity: order.quantity,
            name: order.name,
            material: order.material,
            notes: order.notes,
            comments: order.comments,
            manualStageMarks: order.manualStageMarks,
            manualStageClears: order.manualStageClears,
            stages: order.stages,
            overallStatus: order.overallStatus,
            createdAt: order.createdAt,
          }, { defaultItemNumber: '1', index: 0 }),
        ]
      : [];

    if (JSON.stringify(sourceItems) !== JSON.stringify(normalizedItems)) {
      order.items = normalizedItems;
      changed = true;
    }
  } else {
    const normalizedItems = order.items.map((item, index) => buildOrderItem({
      ...item,
      name: item?.name || (index === 0 ? order.name : item?.name),
      quantity: item?.quantity || (index === 0 ? order.quantity : item?.quantity),
      material: item?.material || (index === 0 ? order.material : item?.material),
      notes: item?.notes || (index === 0 ? order.notes : item?.notes),
      comments: Array.isArray(item?.comments) ? item.comments : (index === 0 ? order.comments : []),
      manualStageMarks: item?.manualStageMarks || (index === 0 ? order.manualStageMarks : {}),
      manualStageClears: item?.manualStageClears || (index === 0 ? order.manualStageClears : {}),
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
  const normalizedAttachments = normalizeOrderAttachments(order.attachments);
  if (JSON.stringify(order.attachments || []) !== JSON.stringify(normalizedAttachments)) {
    order.attachments = normalizedAttachments;
    changed = true;
  }
  const manufacturingMeta = deriveOrderManufacturingMeta(order);
  const nextStartDate = manufacturingMeta.startDate || '';
  const nextEndDate = manufacturingMeta.endDate || '';
  if (order.startDate !== nextStartDate) {
    order.startDate = nextStartDate;
    changed = true;
  }
  if (order.endDate !== nextEndDate) {
    order.endDate = nextEndDate;
    changed = true;
  }

  if (cleanupLegacyOrderFields(order)) {
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
    const sourceItems = Array.isArray(data?.items)
      ? data.items
      : (hasLegacyPrimaryItemData(data)
        ? [{
            itemNumber: '1',
            quantity: data.quantity,
            name: data.name,
            material: data.material,
            notes: data.notes,
            comments: data.comments,
            stages: data.stages,
          }]
        : []);
    const items = sourceItems.map((item, index) => buildOrderItem(item, {
      defaultItemNumber: getDefaultItemNumber(index),
      index,
    }));
    const order = {
      _id: id(),
      orderNumber: data.orderNumber || '',
      customer: data.customer || '',
      orderDate: data.orderDate || '',
      startDate: '',
      endDate: '',
      createdAt,
      attachments: normalizeOrderAttachments(data.attachments),
      items,
    };
    syncOrderStatus(order);
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

  markItemRoleInProgress(orderId, itemId, role, employee = {}) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find(o => o._id === orderId);
    if (!order) return null;
    const item = getOrderItem(order, itemId);
    if (!item) return false;
    let changed = false;
    const employeeId = String(employee.employeeId || employee._id || '').trim();
    const employeeName = String(employee.employeeName || employee.fullName || '').trim();
    const scannedAt = new Date().toISOString();

    item.workerAssignments = mergeWorkerAssignments(item.workerAssignments, item.stages);
    const currentAssignment = item.workerAssignments[role] || {};
    const nextAssignment = {
      employeeId,
      employeeName,
      scannedAt,
    };
    if (JSON.stringify(currentAssignment) !== JSON.stringify(nextAssignment)) {
      item.workerAssignments[role] = nextAssignment;
      changed = true;
    }

    const roleStages = (item.stages || []).filter(stage => stage.role === role);
    const stageToActivate = roleStages.find(stage => stage.status === 'in_progress')
      || roleStages.find(stage => stage.status === 'pending')
      || null;
    if (stageToActivate) {
      if (stageToActivate.status !== 'in_progress') {
        stageToActivate.status = 'in_progress';
        stageToActivate.completedAt = null;
        changed = true;
      }
      if (employeeId && stageToActivate.employeeId !== employeeId) {
        stageToActivate.employeeId = employeeId;
        changed = true;
      }
      if (employeeName && stageToActivate.employeeName !== employeeName) {
        stageToActivate.employeeName = employeeName;
        changed = true;
      }
      if (!stageToActivate.startedAt) {
        stageToActivate.startedAt = scannedAt;
        changed = true;
      }
    }
    if (changed) {
      item.overallStatus = calculateItemOverallStatus(item.stages, item.manualStageMarks);
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
    if (updates.attachments !== undefined) {
      order.attachments = normalizeOrderAttachments(updates.attachments);
    }

    if (Array.isArray(updates.items)) {
      const currentItems = Array.isArray(order.items) ? order.items : [];
      order.items = updates.items.map((item, index) => {
        const currentItem = currentItems.find(existingItem => existingItem.itemId === String(item?.itemId || '').trim())
          || currentItems[index]
          || {};
        return buildOrderItem({
          ...currentItem,
          ...item,
          workerAssignments: item?.workerAssignments || currentItem?.workerAssignments || {},
          manualStageMarks: item?.manualStageMarks || currentItem?.manualStageMarks || {},
          manualStageClears: item?.manualStageClears || currentItem?.manualStageClears || {},
        }, {
          defaultItemNumber: getDefaultItemNumber(index),
          index,
        });
      });
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

  setManualStageMarks(entries = [], legendKey = '', actor = '') {
    const db = load();
    ensureOrders(db);
    const normalizedLegendKey = String(legendKey || '').trim();
    const shouldClear = !normalizedLegendKey;
    if (!shouldClear && !MANUAL_STAGE_ORDER.includes(normalizedLegendKey)) {
      return false;
    }

    let changed = false;
    const touchedOrderIds = new Set();

    for (const entry of Array.isArray(entries) ? entries : []) {
      const orderId = String(entry?.orderId || '').trim();
      const itemId = String(entry?.itemId || '').trim();
      const columnKey = String(entry?.columnKey || '').trim();
      if (!orderId || !itemId || !columnKey) continue;

      const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
      if (!order) continue;
      const item = getOrderItem(order, itemId);
      if (!item) continue;

      const currentMarks = normalizeManualStageMarks(item.manualStageMarks);
      const currentClears = normalizeManualStageClears(item.manualStageClears);
      item.manualStageMarks = { ...currentMarks };
      item.manualStageClears = { ...currentClears };
      const currentMark = item.manualStageMarks[columnKey];
      const currentClear = item.manualStageClears[columnKey];
      let itemChanged = false;

      if (shouldClear) {
        const nextClear = {
          updatedAt: new Date().toISOString(),
          updatedBy: String(actor || '').trim(),
        };
        if (currentMark) {
          delete item.manualStageMarks[columnKey];
          itemChanged = true;
        }
        if (JSON.stringify({ ...currentClear, updatedAt: undefined }) !== JSON.stringify({ ...nextClear, updatedAt: undefined })) {
          item.manualStageClears[columnKey] = nextClear;
          itemChanged = true;
        } else if (!currentClear?.updatedAt) {
          item.manualStageClears[columnKey] = nextClear;
          itemChanged = true;
        }
      } else {
        const nextMark = {
          legendKey: normalizedLegendKey,
          updatedAt: new Date().toISOString(),
          updatedBy: String(actor || '').trim(),
        };
        if (currentClear) {
          delete item.manualStageClears[columnKey];
          itemChanged = true;
        }
        if (JSON.stringify({ ...currentMark, updatedAt: undefined }) !== JSON.stringify({ ...nextMark, updatedAt: undefined })) {
          item.manualStageMarks[columnKey] = nextMark;
          itemChanged = true;
        } else if (!currentMark?.updatedAt) {
          item.manualStageMarks[columnKey] = nextMark;
          itemChanged = true;
        }
      }

      if (itemChanged) {
        item.manualStageMarks = normalizeManualStageMarks(item.manualStageMarks);
        item.manualStageClears = normalizeManualStageClears(item.manualStageClears);
        item.overallStatus = calculateItemOverallStatus(item.stages, item.manualStageMarks);
        item.updatedAt = new Date().toISOString();
        touchedOrderIds.add(orderId);
        changed = true;
      }
    }

    if (!changed) return [];

    for (const orderId of touchedOrderIds) {
      const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
      if (order) {
        syncOrderStatus(order);
      }
    }

    save();
    return db.orders.filter(order => touchedOrderIds.has(order._id));
  },

  syncStagesWithProcessSteps() {
    const db = load();
    ensureOrders(db);
    const steps = ProcessStepStore.findAll().slice().sort(compareSteps);
    let changed = false;

    for (const order of db.orders) {
      for (const item of order.items || []) {
        const nextStages = syncSingleOrderStages(item, steps);
        const nextOverallStatus = calculateItemOverallStatus(nextStages, item.manualStageMarks);
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
      if (cleanupLegacyOrderFields(order)) {
        changed = true;
      }
      const currentAttachments = JSON.stringify(order.attachments || []);
      const nextAttachments = JSON.stringify(normalizeOrderAttachments(order.attachments));
      if (currentAttachments !== nextAttachments) {
        order.attachments = JSON.parse(nextAttachments);
        changed = true;
      }
      const manufacturingMeta = deriveOrderManufacturingMeta(order);
      if (order.startDate !== manufacturingMeta.startDate) {
        order.startDate = manufacturingMeta.startDate;
        changed = true;
      }
      if (order.endDate !== manufacturingMeta.endDate) {
        order.endDate = manufacturingMeta.endDate;
        changed = true;
      }
    }

    if (changed) {
      save();
    }

    return changed;
  },

  count() {
    return this.findAll().length;
  },

  saveAttachment(orderId, attachment = {}, { overwrite = false } = {}) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) {
      return { status: 'order_not_found' };
    }

    const normalizedAttachment = normalizeOrderAttachments([attachment])[0];
    if (!normalizedAttachment) {
      return { status: 'invalid' };
    }

    const currentAttachments = normalizeOrderAttachments(order.attachments);
    const duplicateIndex = findAttachmentIndexByName(currentAttachments, normalizedAttachment.name);

    if (duplicateIndex !== -1) {
      const existingAttachment = currentAttachments[duplicateIndex];
      if (!overwrite) {
        return {
          status: 'conflict',
          existingAttachment,
        };
      }

      const overwrittenAttachment = {
        ...normalizedAttachment,
        attachmentId: existingAttachment.attachmentId,
      };
      currentAttachments[duplicateIndex] = overwrittenAttachment;
      order.attachments = normalizeOrderAttachments(currentAttachments);
      save();
      return {
        status: 'overwritten',
        attachment: overwrittenAttachment,
        replacedAttachment: existingAttachment,
      };
    }

    order.attachments = normalizeOrderAttachments([...(order.attachments || []), normalizedAttachment]);
    save();
    return {
      status: 'created',
      attachment: normalizedAttachment,
      replacedAttachment: null,
    };
  },

  deleteAttachment(orderId, attachmentId) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) return null;

    const normalizedAttachmentId = String(attachmentId || '').trim();
    const currentAttachments = normalizeOrderAttachments(order.attachments);
    const deletedAttachment = currentAttachments.find((attachment) => attachment.attachmentId === normalizedAttachmentId) || null;
    const nextAttachments = currentAttachments.filter((attachment) => attachment.attachmentId !== normalizedAttachmentId);
    if (!deletedAttachment) return false;

    order.attachments = nextAttachments;
    save();
    return deletedAttachment;
  },

  getAttachment(orderId, attachmentId) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) return null;

    const normalizedAttachmentId = String(attachmentId || '').trim();
    return normalizeOrderAttachments(order.attachments).find((attachment) => attachment.attachmentId === normalizedAttachmentId) || false;
  },

  buildInitialStages,
  calculateOverallStatus,
  calculateItemOverallStatus,
  getOrderComments,
  getOrderItem,
  getOrderOverallStatus,
  getOrderPrimaryItem,
  getOrderPrimaryMaterial,
  getOrderPrimaryName,
  getOrderPrimaryNotes,
  getOrderPrimaryQuantity,
  getOrderStages,
  deriveOrderManufacturingMeta,
  getManualStageLegendKey,
  ensureOrders,
};

module.exports = OrderStore;
