const { load, save, id } = require('./store');
const ProcessStepStore = require('./processStepStore');
const RoleStore = require('./roleStore');
const EmployeeStore = require('./employeeStore');

const MANUAL_STAGE_ORDER = ['unprocessed', 'brief', 'drafting', 'stock', 'assembly', 'paint', 'postpaint', 'ready'];
const MANUAL_STAGE_STATUS = {
  unprocessed: 'pending',
  ready: 'completed',
};
const ORDER_MANUFACTURING_EXCLUDED_COLUMN_KEYS = new Set([
  'orderNumber',
  'customer',
]);
const ORDER_MANUFACTURING_START_TRIGGER_COLUMN_KEY = 'room';
const ORDER_MANUFACTURING_REQUIRED_COLUMN_KEYS = [
  'room',
  'roomNumber',
  'itemNumber',
  'quantity',
  'name',
  'orderCard',
  'packageName',
  'notes',
  'deliveryDate',
  'carpenter',
  'materialRequests',
  'paint',
];
const LEGACY_ORDER_COLUMN_KEY_MAP = {
  photoLink: 'materialRequests',
};

function normalizeOrderColumnKey(columnKey = '') {
  const normalizedColumnKey = String(columnKey || '').trim();
  return LEGACY_ORDER_COLUMN_KEY_MAP[normalizedColumnKey] || normalizedColumnKey;
}

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

function compareNaturalTextAsc(leftValue = '', rightValue = '') {
  const left = String(leftValue || '').trim();
  const right = String(rightValue || '').trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, 'ru', {
    numeric: true,
    sensitivity: 'base',
  });
}

function compareOrderItemsByRoomNumberAsc(leftItem = {}, rightItem = {}) {
  const roomNumberDiff = compareNaturalTextAsc(leftItem?.roomNumber, rightItem?.roomNumber);
  if (roomNumberDiff !== 0) return roomNumberDiff;

  const roomDiff = compareNaturalTextAsc(leftItem?.room, rightItem?.room);
  if (roomDiff !== 0) return roomDiff;

  const itemNumberDiff = compareNaturalTextAsc(leftItem?.itemNumber, rightItem?.itemNumber);
  if (itemNumberDiff !== 0) return itemNumberDiff;

  return compareNaturalTextAsc(leftItem?.name, rightItem?.name);
}

function sortOrderItemsByRoomNumber(items = []) {
  return (Array.isArray(items) ? items : []).slice().sort(compareOrderItemsByRoomNumberAsc);
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
    const normalizedColumnKey = normalizeOrderColumnKey(columnKey);
    if (!normalizedColumnKey || !mark || typeof mark !== 'object') return acc;

    const allowsEmptyLegendKey = normalizedColumnKey === 'itemStartDate' || normalizedColumnKey === 'itemEndDate';
    const legendKey = allowsEmptyLegendKey ? '' : String(mark.legendKey || '').trim();
    if ((!legendKey || !MANUAL_STAGE_ORDER.includes(legendKey)) && !allowsEmptyLegendKey) return acc;

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
    const normalizedColumnKey = normalizeOrderColumnKey(columnKey);
    if (!normalizedColumnKey || !clearMeta || typeof clearMeta !== 'object') return acc;

    acc[normalizedColumnKey] = {
      updatedAt: clearMeta.updatedAt || new Date().toISOString(),
      updatedBy: String(clearMeta.updatedBy || '').trim(),
    };
    return acc;
  }, {});
}

function getLatestTimestamp(...timestamps) {
  return timestamps
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort()
    .at(-1) || '';
}

function getEarliestTimestamp(...timestamps) {
  return timestamps
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort()
    .at(0) || '';
}

function getItemActiveRoleStage(item = {}, role = '') {
  return (Array.isArray(item?.stages) ? item.stages : []).find((stage) => stage.role === role && stage.status === 'in_progress') || null;
}

function getItemActiveStage(item = {}) {
  return (Array.isArray(item?.stages) ? item.stages : []).find((stage) => stage.status === 'in_progress') || null;
}

function getItemAssignedStage(item = {}) {
  const stages = Array.isArray(item?.stages) ? item.stages : [];
  const stagesWithEmployee = stages.filter((stage) => getStageEmployeeName(stage));
  if (stagesWithEmployee.length === 0) return null;

  const inProgressStages = stagesWithEmployee.filter((stage) => stage.status === 'in_progress');
  const candidates = inProgressStages.length > 0 ? inProgressStages : stagesWithEmployee;

  return candidates.reduce((currentStage, stage) => {
    if (!currentStage) return stage;
    const currentTs = Date.parse(currentStage.startedAt || currentStage.completedAt || '') || 0;
    const nextTs = Date.parse(stage.startedAt || stage.completedAt || '') || 0;
    return nextTs >= currentTs ? stage : currentStage;
  }, null);
}

function getItemEffectiveManufacturingTimestamp(item = {}, columnKey = '', helpers = {}) {
  const manualStageMarks = helpers.manualStageMarks || normalizeManualStageMarks(item?.manualStageMarks);
  const manualStageClears = helpers.manualStageClears || normalizeManualStageClears(item?.manualStageClears);
  if (manualStageClears[columnKey]) return '';

  const manualMark = manualStageMarks[columnKey] || null;
  const manualMarkLegendKey = String(manualMark?.legendKey || '').trim();
  if ((columnKey === 'itemStartDate' || columnKey === 'itemEndDate') && manualMarkLegendKey) {
    return '';
  }

  const updatedAt = String(manualMark?.updatedAt || '').trim();
  if (updatedAt) return updatedAt;

  if (columnKey === 'orderAttachments' || columnKey === 'paintAttachments' || columnKey === 'orderCard' || columnKey === 'paint') {
    const fieldName = columnKey === 'paintAttachments' || columnKey === 'paint'
      ? 'paintAttachments'
      : 'attachments';
    const attachments = Array.isArray(item?.[fieldName]) ? item[fieldName] : [];
    return getLatestTimestamp(
      ...attachments.map((attachment) => attachment?.uploadedAt || ''),
    );
  }

  if (columnKey === 'packageName' || columnKey === 'materialRequests') return '';

  if (columnKey !== 'carpenter') return '';

  const workerAssignments = helpers.workerAssignments || mergeWorkerAssignments(item?.workerAssignments, item?.stages);
  const carpenterAssignment = workerAssignments.carpenter || null;
  const carpenterActiveStage = getItemActiveRoleStage(item, 'carpenter');
  const activeStage = getItemActiveStage(item);
  const assignedStage = getItemAssignedStage(item);
  const workerStageForText = assignedStage || carpenterActiveStage || activeStage || null;
  const earliestAutoAt = getEarliestTimestamp(
    carpenterAssignment?.scannedAt,
    carpenterActiveStage?.startedAt,
    workerStageForText?.startedAt,
  );
  return (carpenterAssignment || workerStageForText)
    ? earliestAutoAt
    : '';
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
    const url = String(attachment.url || '').trim();
    if (!name || (!content && !relativePath && !url)) return acc;

    acc.push({
      attachmentId: String(attachment.attachmentId || attachment._id || id()).trim(),
      name,
      type: String(attachment.type || '').trim(),
      size: Number(attachment.size) || 0,
      storedName: String(attachment.storedName || '').trim(),
      relativePath,
      content,
      url,
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

function getAttachmentFieldName(scope = '') {
  return String(scope || '').trim().toLowerCase() === 'paint'
    ? 'paintAttachments'
    : 'attachments';
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

function isIsoAfter(left = '', right = '') {
  const leftValue = String(left || '').trim();
  const rightValue = String(right || '').trim();
  if (!leftValue || !rightValue) return false;
  const leftTime = Date.parse(leftValue);
  const rightTime = Date.parse(rightValue);
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return leftValue > rightValue;
  }
  return leftTime > rightTime;
}

function clearOutdatedAutoStageClears(order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const primaryItem = items[0] || null;
  if (!primaryItem) return false;

  let changed = false;
  const manufacturingMeta = deriveOrderManufacturingMeta(order);
  const metaClears = normalizeManualStageClears(primaryItem.manualStageClears);

  if (metaClears.startDate && isIsoAfter(manufacturingMeta.startAt, metaClears.startDate.updatedAt)) {
    delete metaClears.startDate;
    changed = true;
  }
  if (metaClears.endDate && isIsoAfter(manufacturingMeta.endAt, metaClears.endDate.updatedAt)) {
    delete metaClears.endDate;
    changed = true;
  }
  if (metaClears.duration && isIsoAfter(manufacturingMeta.endAt || manufacturingMeta.startAt, metaClears.duration.updatedAt)) {
    delete metaClears.duration;
    changed = true;
  }
  if (changed) {
    primaryItem.manualStageClears = normalizeManualStageClears(metaClears);
  }

  return changed;
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

function normalizeChecklistItems(source = [], legacyValue = '', options = {}) {
  const sourceItems = Array.isArray(source) ? source : [];
  const mapExtraFields = typeof options.mapExtraFields === 'function'
    ? options.mapExtraFields
    : null;
  const normalizedItems = sourceItems.reduce((acc, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return acc;
    const name = String(item.name || '').trim();
    if (!name) return acc;
    acc.push({
      id: String(item.id || item.packageItemId || id()).trim(),
      name,
      isCompleted: Boolean(item.isCompleted),
      completedAt: item.isCompleted ? (item.completedAt || new Date().toISOString().split('T')[0]) : null,
      ...(mapExtraFields ? mapExtraFields(item) : {}),
    });
    return acc;
  }, []);
  if (normalizedItems.length > 0) {
    return normalizedItems;
  }

  const legacyTokens = String(legacyValue || '')
    .split(/[\n,;]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
  if (legacyTokens.length === 0) return [];

  return legacyTokens.map((token) => {
    const isCompleted = /^(\+|\[x\]|x\s+|✓\s+|✔\s+)/i.test(token);
    const normalizedName = token
      .replace(/^(\+|\-|\[x\]|\[\s\]|x\s+|✓\s+|✔\s+)/i, '')
      .trim();
    return {
      id: id(),
      name: normalizedName || token,
      isCompleted,
      completedAt: isCompleted ? new Date().toISOString().split('T')[0] : null,
    };
  }).filter((item) => item.name).map((item) => ({
    id: id(),
    ...item,
  }));
}

function normalizePackageItems(source = [], legacyPackageName = '') {
  return normalizeChecklistItems(source, legacyPackageName);
}

function normalizeMaterialRequestItems(source = [], legacyRequests = '') {
  return normalizeChecklistItems(source, legacyRequests, {
    mapExtraFields: (item) => ({
      kind: String(item.kind || (Array.isArray(item.attachments) && item.attachments.length > 0 ? 'photo' : 'text')).trim() || 'text',
      comment: String(item.comment || '').trim(),
      attachments: normalizeOrderAttachments(item.attachments),
    }),
  });
}

function getChecklistSummary(items = []) {
  return normalizeChecklistItems(items)
    .map((item) => `${item.isCompleted ? '+' : '-'} ${item.name}`)
    .join('; ');
}

function getPackageSummary(packageItems = []) {
  return getChecklistSummary(packageItems);
}

function getMaterialRequestSummary(materialRequestItems = []) {
  return normalizeMaterialRequestItems(materialRequestItems)
    .map((item) => {
      const summaryName = item.kind === 'photo'
        ? (item.comment || 'Фото')
        : item.name;
      return `${item.isCompleted ? '+' : '-'} ${summaryName}`;
    })
    .join('; ');
}

function updateItemChecklistState(item, nextItems = [], {
  itemsField,
  legacyField,
  clearColumnKey,
  normalizeItems,
  getSummary,
} = {}) {
  const normalizedNextItems = normalizeItems(nextItems);
  const currentItems = normalizeItems(item?.[itemsField], item?.[legacyField]);
  if (JSON.stringify(currentItems) === JSON.stringify(normalizedNextItems)) {
    return false;
  }

  item[itemsField] = normalizedNextItems;
  item[legacyField] = getSummary(normalizedNextItems);

  const nextManualStageClears = normalizeManualStageClears(item?.manualStageClears);
  if (
    normalizedNextItems.length > 0
    && normalizedNextItems.every((entry) => entry.isCompleted)
    && nextManualStageClears[clearColumnKey]
  ) {
    delete nextManualStageClears[clearColumnKey];
    item.manualStageClears = normalizeManualStageClears(nextManualStageClears);
  }

  item.updatedAt = new Date().toISOString();
  return true;
}

function updateItemPackageState(item, nextPackageItems = []) {
  return updateItemChecklistState(item, nextPackageItems, {
    itemsField: 'packageItems',
    legacyField: 'packageName',
    clearColumnKey: 'packageName',
    normalizeItems: normalizePackageItems,
    getSummary: getPackageSummary,
  });
}

function updateItemMaterialRequestState(item, nextMaterialRequestItems = []) {
  return updateItemChecklistState(item, nextMaterialRequestItems, {
    itemsField: 'materialRequestItems',
    legacyField: 'materialRequests',
    clearColumnKey: 'materialRequests',
    normalizeItems: normalizeMaterialRequestItems,
    getSummary: getMaterialRequestSummary,
  });
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
  const packageItems = normalizePackageItems(source.packageItems, source.packageName || source.package);
  const materialRequestItems = normalizeMaterialRequestItems(source.materialRequestItems, source.materialRequests || source.photoLink);
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
    packageName: getPackageSummary(packageItems),
    packageItems,
    materialRequests: getMaterialRequestSummary(materialRequestItems),
    materialRequestItems,
    notes: String(source.notes || '').trim(),
    attachments: normalizeOrderAttachments(source.attachments),
    paintAttachments: normalizeOrderAttachments(source.paintAttachments),
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

function normalizeOrderManualDateOverrides(source = {}) {
  return {
    startDate: String(source?.startDate || '').trim(),
    endDate: String(source?.endDate || '').trim(),
  };
}

function normalizeArchivedBy(source = {}) {
  return {
    role: String(source?.role || '').trim(),
    name: String(source?.name || '').trim(),
  };
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
  const startTimestamps = [];
  const endTimestamps = [];
  const manualDateOverrides = normalizeOrderManualDateOverrides(order?.manualDateOverrides);

  for (const item of items) {
    const manualStageMarks = normalizeManualStageMarks(item?.manualStageMarks);
    const manualStageClears = normalizeManualStageClears(item?.manualStageClears);
    const workerAssignments = mergeWorkerAssignments(item?.workerAssignments, item?.stages);

    const explicitStartAt = getItemEffectiveManufacturingTimestamp(item, 'itemStartDate', {
      manualStageMarks,
      manualStageClears,
      workerAssignments,
    });
    const triggerStartAt = getItemEffectiveManufacturingTimestamp(item, ORDER_MANUFACTURING_START_TRIGGER_COLUMN_KEY, {
      manualStageMarks,
      manualStageClears,
      workerAssignments,
    });
    const itemStartAt = explicitStartAt || triggerStartAt || '';
    if (itemStartAt) {
      startTimestamps.push(itemStartAt);
    }

    const explicitEndAt = getItemEffectiveManufacturingTimestamp(item, 'itemEndDate', {
      manualStageMarks,
      manualStageClears,
      workerAssignments,
    });
    const completionTimestamps = ORDER_MANUFACTURING_REQUIRED_COLUMN_KEYS.map((columnKey) => (
      getItemEffectiveManufacturingTimestamp(item, columnKey, {
        manualStageMarks,
        manualStageClears,
        workerAssignments,
      })
    ));
    if (explicitEndAt) {
      endTimestamps.push(explicitEndAt);
    } else if (completionTimestamps.every(Boolean)) {
      endTimestamps.push(getLatestTimestamp(...completionTimestamps));
    }
  }

  let startAt = getEarliestTimestamp(...startTimestamps);
  const autoCompleted = items.length > 0 && endTimestamps.length === items.length;
  let endAt = autoCompleted ? getLatestTimestamp(...endTimestamps) : '';

  if (manualDateOverrides.startDate) {
    startAt = `${manualDateOverrides.startDate}T00:00:00.000Z`;
  }
  if (manualDateOverrides.endDate) {
    endAt = `${manualDateOverrides.endDate}T00:00:00.000Z`;
  }

  const isCompleted = Boolean(startAt && endAt);

  return {
    startAt,
    endAt,
    startDate: startAt ? startAt.split('T')[0] : '',
    endDate: endAt ? endAt.split('T')[0] : '',
    isCompleted,
  };
}

function isOrderArchived(order = {}) {
  return Boolean(String(order?.archivedAt || '').trim());
}

function getOrderArchiveEligibility(order = {}) {
  if (!order || typeof order !== 'object') {
    return { isEligible: false, reason: 'Заказ не найден.' };
  }
  if (isOrderArchived(order)) {
    return { isEligible: false, reason: 'Заказ уже находится в архиве.' };
  }
  if (!String(order.orderNumber || '').trim()) {
    return { isEligible: false, reason: 'Укажите номер заказа.' };
  }
  if (!String(order.orderDate || '').trim()) {
    return { isEligible: false, reason: 'Укажите дату заказа.' };
  }
  if (!Array.isArray(order.items) || order.items.length === 0) {
    return { isEligible: false, reason: 'В заказе пока нет изделий.' };
  }
  if (!deriveOrderManufacturingMeta(order).isCompleted) {
    return {
      isEligible: false,
      reason: 'Не все обязательные ячейки заполнены, закрашены и исполнены по счетчикам.',
    };
  }
  return { isEligible: true, reason: '' };
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

  const normalizedManualDateOverrides = normalizeOrderManualDateOverrides(order.manualDateOverrides);
  if (JSON.stringify(order.manualDateOverrides || {}) !== JSON.stringify(normalizedManualDateOverrides)) {
    order.manualDateOverrides = normalizedManualDateOverrides;
    changed = true;
  }

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

  const legacyOrderAttachments = normalizeOrderAttachments(order.attachments);
  if (legacyOrderAttachments.length > 0 && Array.isArray(order.items) && order.items.length > 0) {
    const primaryItem = order.items[0];
    const primaryAttachments = normalizeOrderAttachments(primaryItem.attachments);
    if (primaryAttachments.length === 0) {
      primaryItem.attachments = legacyOrderAttachments;
      primaryItem.updatedAt = new Date().toISOString();
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
  const normalizedCustomerId = String(order.customerId || '').trim();
  if (order.customerId !== normalizedCustomerId) {
    order.customerId = normalizedCustomerId;
    changed = true;
  }
  if (JSON.stringify(order.attachments || []) !== JSON.stringify([])) {
    order.attachments = [];
    changed = true;
  }
  const normalizedArchivedAt = String(order.archivedAt || '').trim();
  if (order.archivedAt !== normalizedArchivedAt) {
    order.archivedAt = normalizedArchivedAt;
    changed = true;
  }
  const nextArchivedBy = normalizeArchivedBy(order.archivedBy);
  if (JSON.stringify(order.archivedBy || {}) !== JSON.stringify(nextArchivedBy)) {
    order.archivedBy = nextArchivedBy;
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
  if (clearOutdatedAutoStageClears(order)) {
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
    const items = sortOrderItemsByRoomNumber(sourceItems.map((item, index) => buildOrderItem(item, {
      defaultItemNumber: getDefaultItemNumber(index),
      index,
    })));
    const order = {
      _id: id(),
      orderNumber: data.orderNumber || '',
      customer: data.customer || '',
      customerId: String(data.customerId || '').trim(),
      orderDate: data.orderDate || '',
      startDate: '',
      endDate: '',
      manualDateOverrides: { startDate: '', endDate: '' },
      archivedAt: '',
      archivedBy: { role: '', name: '' },
      createdAt,
      attachments: [],
      items,
    };
    if (Array.isArray(order.items) && order.items.length > 0 && Array.isArray(data.attachments) && data.attachments.length > 0) {
      order.items[0].attachments = normalizeOrderAttachments(data.attachments);
    }
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
      const currentClears = normalizeManualStageClears(item.manualStageClears);
      if (role === 'carpenter' && currentClears.carpenter) {
        delete currentClears.carpenter;
        item.manualStageClears = normalizeManualStageClears(currentClears);
      }
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
    if (updates.customerId !== undefined) order.customerId = String(updates.customerId || '').trim();
    if (updates.orderDate !== undefined) order.orderDate = updates.orderDate;
    if (updates.manualDateOverrides !== undefined) {
      order.manualDateOverrides = normalizeOrderManualDateOverrides(updates.manualDateOverrides);
    }
    if (updates.attachments !== undefined) {
      const primaryItem = getOrderItem(order);
      if (primaryItem) {
        primaryItem.attachments = normalizeOrderAttachments(updates.attachments);
        primaryItem.updatedAt = new Date().toISOString();
      }
    }

    if (Array.isArray(updates.items)) {
      const currentItems = Array.isArray(order.items) ? order.items : [];
      order.items = sortOrderItemsByRoomNumber(updates.items.map((item, index) => {
        const currentItem = currentItems.find(existingItem => existingItem.itemId === String(item?.itemId || '').trim())
          || currentItems[index]
          || {};
        const nextManualStageClears = normalizeManualStageClears(item?.manualStageClears || currentItem?.manualStageClears || {});
        return buildOrderItem({
          ...currentItem,
          ...item,
          workerAssignments: item?.workerAssignments || currentItem?.workerAssignments || {},
          manualStageMarks: item?.manualStageMarks || currentItem?.manualStageMarks || {},
          manualStageClears: nextManualStageClears,
        }, {
          defaultItemNumber: getDefaultItemNumber(index),
          index,
        });
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

  addPackageItem(orderId, itemId, packageItem = {}) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) return null;
    const item = getOrderItem(order, itemId);
    if (!item) return false;

    const itemName = String(packageItem?.name || '').trim();
    if (!itemName) return 'invalid';

    const nextPackageItems = [
      ...normalizePackageItems(item.packageItems, item.packageName),
      {
        id: String(packageItem?.id || id()).trim(),
        name: itemName,
        isCompleted: Boolean(packageItem?.isCompleted),
        completedAt: packageItem?.isCompleted
          ? (String(packageItem?.completedAt || '').trim() || new Date().toISOString().split('T')[0])
          : null,
      },
    ];

    if (!updateItemPackageState(item, nextPackageItems)) {
      return order;
    }

    syncOrderStatus(order);
    save();
    return order;
  },

  togglePackageItem(orderId, itemId, packageItemId) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) return null;
    const item = getOrderItem(order, itemId);
    if (!item) return false;

    const normalizedPackageItemId = String(packageItemId || '').trim();
    if (!normalizedPackageItemId) return 'invalid';

    const currentPackageItems = normalizePackageItems(item.packageItems, item.packageName);
    const hasTargetItem = currentPackageItems.some((packageItem) => packageItem.id === normalizedPackageItemId);
    if (!hasTargetItem) return 'package_item_not_found';

    const nextPackageItems = currentPackageItems.map((packageItem) => (
      packageItem.id === normalizedPackageItemId
        ? {
            ...packageItem,
            isCompleted: !packageItem.isCompleted,
            completedAt: !packageItem.isCompleted ? new Date().toISOString().split('T')[0] : null,
          }
        : packageItem
    ));

    if (!updateItemPackageState(item, nextPackageItems)) {
      return order;
    }

    syncOrderStatus(order);
    save();
    return order;
  },

  addMaterialRequestItem(orderId, itemId, materialRequestItem = {}) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) return null;
    const item = getOrderItem(order, itemId);
    if (!item) return false;

    const attachmentList = normalizeOrderAttachments(materialRequestItem?.attachments);
    const normalizedKind = String(materialRequestItem?.kind || (attachmentList.length > 0 ? 'photo' : 'text')).trim().toLowerCase() === 'photo'
      ? 'photo'
      : 'text';
    const itemName = String(materialRequestItem?.name || '').trim() || (normalizedKind === 'photo' ? 'Фото' : '');
    if (!itemName) return 'invalid';

    const nextMaterialRequestItems = [
      ...normalizeMaterialRequestItems(item.materialRequestItems, item.materialRequests),
      {
        id: String(materialRequestItem?.id || id()).trim(),
        name: itemName,
        kind: normalizedKind,
        comment: String(materialRequestItem?.comment || '').trim(),
        isCompleted: Boolean(materialRequestItem?.isCompleted),
        completedAt: materialRequestItem?.isCompleted
          ? (String(materialRequestItem?.completedAt || '').trim() || new Date().toISOString().split('T')[0])
          : null,
        attachments: attachmentList,
      },
    ];

    if (!updateItemMaterialRequestState(item, nextMaterialRequestItems)) {
      return order;
    }

    syncOrderStatus(order);
    save();
    return order;
  },

  updateMaterialRequestItemComment(orderId, itemId, materialRequestItemId, comment = '') {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) return null;
    const item = getOrderItem(order, itemId);
    if (!item) return false;

    const normalizedMaterialRequestItemId = String(materialRequestItemId || '').trim();
    if (!normalizedMaterialRequestItemId) return 'invalid';

    const currentMaterialRequestItems = normalizeMaterialRequestItems(item.materialRequestItems, item.materialRequests);
    const hasTargetItem = currentMaterialRequestItems.some((requestItem) => requestItem.id === normalizedMaterialRequestItemId);
    if (!hasTargetItem) return 'material_request_item_not_found';

    const normalizedComment = String(comment || '').trim();
    const nextMaterialRequestItems = currentMaterialRequestItems.map((requestItem) => (
      requestItem.id === normalizedMaterialRequestItemId
        ? {
            ...requestItem,
            comment: normalizedComment,
          }
        : requestItem
    ));

    if (!updateItemMaterialRequestState(item, nextMaterialRequestItems)) {
      return order;
    }

    syncOrderStatus(order);
    save();
    return order;
  },

  saveMaterialRequestAttachment(orderId, itemId, materialRequestItemId, attachment = {}) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) return { status: 'order_not_found' };
    const item = getOrderItem(order, itemId);
    if (!item) return { status: 'item_not_found' };

    const normalizedMaterialRequestItemId = String(materialRequestItemId || '').trim();
    if (!normalizedMaterialRequestItemId) return { status: 'invalid_material_request_item' };

    const currentMaterialRequestItems = normalizeMaterialRequestItems(item.materialRequestItems, item.materialRequests);
    const materialRequestItemIndex = currentMaterialRequestItems.findIndex((requestItem) => requestItem.id === normalizedMaterialRequestItemId);
    if (materialRequestItemIndex === -1) {
      return { status: 'material_request_item_not_found' };
    }

    const normalizedAttachment = normalizeOrderAttachments([attachment])[0];
    if (!normalizedAttachment) {
      return { status: 'invalid_attachment' };
    }

    const nextMaterialRequestItems = currentMaterialRequestItems.map((requestItem, index) => {
      if (index !== materialRequestItemIndex) return requestItem;
      return {
        ...requestItem,
        attachments: normalizeOrderAttachments([...(requestItem.attachments || []), normalizedAttachment]),
      };
    });

    if (!updateItemMaterialRequestState(item, nextMaterialRequestItems)) {
      return { status: 'unchanged' };
    }

    syncOrderStatus(order);
    save();
    return {
      status: 'created',
      attachment: normalizedAttachment,
      materialRequestItem: normalizeMaterialRequestItems(item.materialRequestItems, item.materialRequests)
        .find((requestItem) => requestItem.id === normalizedMaterialRequestItemId) || null,
      item,
      order,
    };
  },

  getMaterialRequestAttachment(orderId, itemId, materialRequestItemId, attachmentId) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) return null;
    const item = getOrderItem(order, itemId);
    if (!item) return 'item_not_found';

    const normalizedMaterialRequestItemId = String(materialRequestItemId || '').trim();
    if (!normalizedMaterialRequestItemId) return 'invalid_material_request_item';

    const materialRequestItem = normalizeMaterialRequestItems(item.materialRequestItems, item.materialRequests)
      .find((requestItem) => requestItem.id === normalizedMaterialRequestItemId);
    if (!materialRequestItem) return 'material_request_item_not_found';

    const normalizedAttachmentId = String(attachmentId || '').trim();
    if (!normalizedAttachmentId) return false;

    return normalizeOrderAttachments(materialRequestItem.attachments)
      .find((attachment) => attachment.attachmentId === normalizedAttachmentId) || false;
  },

  toggleMaterialRequestItem(orderId, itemId, materialRequestItemId) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) return null;
    const item = getOrderItem(order, itemId);
    if (!item) return false;

    const normalizedMaterialRequestItemId = String(materialRequestItemId || '').trim();
    if (!normalizedMaterialRequestItemId) return 'invalid';

    const currentMaterialRequestItems = normalizeMaterialRequestItems(item.materialRequestItems, item.materialRequests);
    const hasTargetItem = currentMaterialRequestItems.some((requestItem) => requestItem.id === normalizedMaterialRequestItemId);
    if (!hasTargetItem) return 'material_request_item_not_found';

    const nextMaterialRequestItems = currentMaterialRequestItems.map((requestItem) => (
      requestItem.id === normalizedMaterialRequestItemId
        ? {
            ...requestItem,
            isCompleted: !requestItem.isCompleted,
            completedAt: !requestItem.isCompleted ? new Date().toISOString().split('T')[0] : null,
          }
        : requestItem
    ));

    if (!updateItemMaterialRequestState(item, nextMaterialRequestItems)) {
      return order;
    }

    syncOrderStatus(order);
    save();
    return order;
  },

  getArchiveEligibility(order) {
    return getOrderArchiveEligibility(order);
  },

  archive(orderId, actor = {}) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) return null;

    const eligibility = getOrderArchiveEligibility(order);
    if (!eligibility.isEligible) {
      return {
        status: 'invalid',
        message: eligibility.reason,
        order,
      };
    }

    order.archivedAt = new Date().toISOString();
    order.archivedBy = normalizeArchivedBy(actor);
    save();

    return {
      status: 'archived',
      order,
    };
  },

  restore(orderId) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) return null;
    if (!isOrderArchived(order)) {
      return {
        status: 'invalid',
        message: 'Заказ уже находится в работе.',
        order,
      };
    }

    order.archivedAt = '';
    order.archivedBy = normalizeArchivedBy({});
    save();

    return {
      status: 'restored',
      order,
    };
  },

  setManualStageMarks(entries = [], legendKey = '', actor = '') {
    const db = load();
    ensureOrders(db);
    const normalizedLegendKey = String(legendKey || '').trim();
    const hasGlobalLegendKey = Boolean(normalizedLegendKey);
    if (hasGlobalLegendKey && !MANUAL_STAGE_ORDER.includes(normalizedLegendKey)) {
      return false;
    }

    let changed = false;
    const touchedOrderIds = new Set();

    for (const entry of Array.isArray(entries) ? entries : []) {
      const orderId = String(entry?.orderId || '').trim();
      const itemId = String(entry?.itemId || '').trim();
      const displayColumnKey = String(entry?.columnKey || '').trim();
      const columnKey = String(entry?.storageColumnKey || entry?.columnKey || '').trim();
      const entryLegendKey = String(entry?.legendKey || '').trim();
      const effectiveLegendKey = entryLegendKey || normalizedLegendKey;
      const shouldClear = !effectiveLegendKey;
      if (!shouldClear && !MANUAL_STAGE_ORDER.includes(effectiveLegendKey)) {
        continue;
      }
      if (!orderId || !itemId || !displayColumnKey || !columnKey) continue;

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
      const isManualDateColumn = displayColumnKey === 'itemStartDate' || displayColumnKey === 'itemEndDate';
      let itemChanged = false;

      if (isManualDateColumn && columnKey === displayColumnKey) {
        continue;
      }

      if (shouldClear) {
        if (currentMark) {
          delete item.manualStageMarks[columnKey];
          itemChanged = true;
        }
        if (!currentClear) {
          item.manualStageClears[columnKey] = {
            updatedAt: new Date().toISOString(),
            updatedBy: String(actor || '').trim(),
          };
          itemChanged = true;
        } else if (!currentClear.updatedAt || currentClear.updatedBy !== String(actor || '').trim()) {
          item.manualStageClears[columnKey] = {
            ...currentClear,
            updatedAt: currentClear.updatedAt || new Date().toISOString(),
            updatedBy: String(actor || '').trim(),
          };
          itemChanged = true;
        }
      } else {
        const nextMark = {
          legendKey: effectiveLegendKey,
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

  setManualDateOverrides(entries = [], payload = {}) {
    const db = load();
    ensureOrders(db);
    const columnKey = String(payload?.columnKey || '').trim();
    const date = String(payload?.date || '').trim();
    const startDate = String(payload?.startDate || '').trim();
    const endDate = String(payload?.endDate || '').trim();
    const actor = String(payload?.actor || '').trim();
    const touchedOrderIds = new Set();
    let changed = false;

    for (const entry of Array.isArray(entries) ? entries : []) {
      const orderId = String(entry?.orderId || '').trim();
      const itemId = String(entry?.itemId || '').trim();
      if (!orderId) continue;

      const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
      if (!order) continue;

      if (columnKey === 'duration') {
        const currentOverrides = normalizeOrderManualDateOverrides(order.manualDateOverrides);
        const nextOverrides = {
          startDate: startDate || '',
          endDate: endDate || '',
        };
        if (JSON.stringify(currentOverrides) !== JSON.stringify(nextOverrides)) {
          order.manualDateOverrides = nextOverrides;
          changed = true;
        }
        touchedOrderIds.add(orderId);
        continue;
      }

      if ((columnKey !== 'itemStartDate' && columnKey !== 'itemEndDate') || !itemId || !date) {
        continue;
      }

      const item = getOrderItem(order, itemId);
      if (!item) continue;
      const currentOverrides = normalizeOrderManualDateOverrides(order.manualDateOverrides);
      const currentMarks = normalizeManualStageMarks(item.manualStageMarks);
      const currentClears = normalizeManualStageClears(item.manualStageClears);
      const nextLegendKey = (columnKey === 'itemStartDate' || columnKey === 'itemEndDate')
        ? ''
        : String(entry?.legendKey || currentMarks[columnKey]?.legendKey || '').trim();
      const nextMark = {
        ...(currentMarks[columnKey] || {}),
        legendKey: nextLegendKey,
        updatedAt: new Date(`${date}T00:00:00.000Z`).toISOString(),
        updatedBy: actor,
      };

      if (JSON.stringify(currentMarks[columnKey] || {}) !== JSON.stringify(nextMark)) {
        item.manualStageMarks = {
          ...currentMarks,
          [columnKey]: nextMark,
        };
        changed = true;
      }
      if (currentClears[columnKey]) {
        const nextClears = { ...currentClears };
        delete nextClears[columnKey];
        item.manualStageClears = nextClears;
        changed = true;
      }
      if (currentOverrides.startDate || currentOverrides.endDate) {
        order.manualDateOverrides = { startDate: '', endDate: '' };
        changed = true;
      }
      item.updatedAt = new Date().toISOString();
      touchedOrderIds.add(orderId);
    }

    if (!changed) return db.orders.filter(order => touchedOrderIds.has(order._id));

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
      for (const item of order.items || []) {
        const currentAttachments = JSON.stringify(item.attachments || []);
        const nextAttachments = JSON.stringify(normalizeOrderAttachments(item.attachments));
        if (currentAttachments !== nextAttachments) {
          item.attachments = JSON.parse(nextAttachments);
          changed = true;
        }
        const currentPaintAttachments = JSON.stringify(item.paintAttachments || []);
        const nextPaintAttachments = JSON.stringify(normalizeOrderAttachments(item.paintAttachments));
        if (currentPaintAttachments !== nextPaintAttachments) {
          item.paintAttachments = JSON.parse(nextPaintAttachments);
          changed = true;
        }
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

  saveAttachment(orderId, itemId, attachment = {}, { overwrite = false, scope = '' } = {}) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) {
      return { status: 'order_not_found' };
    }
    const item = getOrderItem(order, itemId);
    if (!item) {
      return { status: 'item_not_found' };
    }

    const normalizedAttachment = normalizeOrderAttachments([attachment])[0];
    if (!normalizedAttachment) {
      return { status: 'invalid' };
    }

    const attachmentFieldName = getAttachmentFieldName(scope);
    const currentAttachments = normalizeOrderAttachments(item[attachmentFieldName]);
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
      item[attachmentFieldName] = normalizeOrderAttachments(currentAttachments);
      item.updatedAt = new Date().toISOString();
      syncOrderStatus(order);
      save();
      return {
        status: 'overwritten',
        attachment: overwrittenAttachment,
        replacedAttachment: existingAttachment,
      };
    }

    item[attachmentFieldName] = normalizeOrderAttachments([...(item[attachmentFieldName] || []), normalizedAttachment]);
    item.updatedAt = new Date().toISOString();
    syncOrderStatus(order);
    save();
    return {
      status: 'created',
      attachment: normalizedAttachment,
      replacedAttachment: null,
    };
  },

  deleteAttachment(orderId, itemId, attachmentId, { scope = '' } = {}) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) return null;
    const item = getOrderItem(order, itemId);
    if (!item) return 'item_not_found';

    const normalizedAttachmentId = String(attachmentId || '').trim();
    const attachmentFieldName = getAttachmentFieldName(scope);
    const currentAttachments = normalizeOrderAttachments(item[attachmentFieldName]);
    const deletedAttachment = currentAttachments.find((attachment) => attachment.attachmentId === normalizedAttachmentId) || null;
    const nextAttachments = currentAttachments.filter((attachment) => attachment.attachmentId !== normalizedAttachmentId);
    if (!deletedAttachment) return false;

    item[attachmentFieldName] = nextAttachments;
    item.updatedAt = new Date().toISOString();
    syncOrderStatus(order);
    save();
    return deletedAttachment;
  },

  getAttachment(orderId, itemId, attachmentId, { scope = '' } = {}) {
    const db = load();
    ensureOrders(db);
    const order = db.orders.find((currentOrder) => currentOrder._id === orderId);
    if (!order) return null;
    const item = getOrderItem(order, itemId);
    if (!item) return 'item_not_found';

    const normalizedAttachmentId = String(attachmentId || '').trim();
    const attachmentFieldName = getAttachmentFieldName(scope);
    return normalizeOrderAttachments(item[attachmentFieldName]).find((attachment) => attachment.attachmentId === normalizedAttachmentId) || false;
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
