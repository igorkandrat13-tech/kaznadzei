function getOrderItems(order) {
  return Array.isArray(order?.items) ? order.items : [];
}

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

function getOrderPrimaryItem(order) {
  return getOrderItems(order)[0] || null;
}

function getOrderStages(order) {
  const primaryItem = getOrderPrimaryItem(order);
  if (Array.isArray(primaryItem?.stages)) return primaryItem.stages;
  return Array.isArray(order?.stages) ? order.stages : [];
}

function getOrderComments(order) {
  const primaryItem = getOrderPrimaryItem(order);
  if (Array.isArray(primaryItem?.comments)) return primaryItem.comments;
  return Array.isArray(order?.comments) ? order.comments : [];
}

function normalizeOrderManualDateOverrides(source = {}) {
  return {
    startDate: String(source?.startDate || '').trim(),
    endDate: String(source?.endDate || '').trim(),
  };
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

function getItemActiveRoleStage(item, role) {
  return (item?.stages || []).find((stage) => stage.role === role && stage.status === 'in_progress') || null;
}

function getItemActiveStage(item) {
  return (item?.stages || []).find((stage) => stage.status === 'in_progress') || null;
}

function getItemAssignedStage(item) {
  const stages = Array.isArray(item?.stages) ? item.stages : [];
  const stagesWithEmployee = stages.filter((stage) => String(stage.employeeName || '').trim());
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

function getItemEffectiveManufacturingTimestamp(item, columnKey, manualStageMarks = {}, manualStageClears = {}) {
  if (manualStageClears[columnKey]) return '';

  const updatedAt = String(manualStageMarks[columnKey]?.updatedAt || '').trim();
  if (updatedAt) return updatedAt;

  if (columnKey === 'orderAttachments' || columnKey === 'paintAttachments' || columnKey === 'orderCard' || columnKey === 'paint') {
    const fieldName = columnKey === 'paintAttachments' || columnKey === 'paint'
      ? 'paintAttachments'
      : 'attachments';
    const attachments = Array.isArray(item?.[fieldName]) ? item[fieldName] : [];
    return getLatestTimestamp(
      ...attachments.map((attachment) => attachment?.uploadedAt || attachment?.createdAt || attachment?.updatedAt || ''),
    );
  }

  if (columnKey === 'packageName') {
    const packageItems = Array.isArray(item?.packageItems) ? item.packageItems : [];
    if (packageItems.length === 0 || packageItems.some((packageItem) => !packageItem?.isCompleted)) return '';
    return getLatestTimestamp(
      ...packageItems.map((packageItem) => packageItem?.completedAt || packageItem?.updatedAt || ''),
    );
  }

  if (columnKey !== 'carpenter') return '';

  const carpenterAssignment = item?.workerAssignments?.carpenter || null;
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

function getItemManufacturingTimelineTimestamps(item, manualStageMarks = {}, manualStageClears = {}) {
  const marks = manualStageMarks && typeof manualStageMarks === 'object' ? manualStageMarks : {};
  const clears = manualStageClears && typeof manualStageClears === 'object' ? manualStageClears : {};
  const timestamps = [];

  Object.entries(marks).forEach(([columnKey, mark]) => {
    const normalizedKey = String(columnKey || '').trim();
    if (!normalizedKey || ORDER_MANUFACTURING_EXCLUDED_COLUMN_KEYS.has(normalizedKey)) return;
    if (clears[normalizedKey]) return;
    const updatedAt = String(mark?.updatedAt || '').trim();
    if (updatedAt) timestamps.push(updatedAt);
  });

  const orderAttachments = Array.isArray(item?.attachments) ? item.attachments : [];
  orderAttachments.forEach((attachment) => {
    const uploadedAt = String(attachment?.uploadedAt || attachment?.createdAt || attachment?.updatedAt || '').trim();
    if (uploadedAt) timestamps.push(uploadedAt);
  });

  const paintAttachments = Array.isArray(item?.paintAttachments) ? item.paintAttachments : [];
  paintAttachments.forEach((attachment) => {
    const uploadedAt = String(attachment?.uploadedAt || attachment?.createdAt || attachment?.updatedAt || '').trim();
    if (uploadedAt) timestamps.push(uploadedAt);
  });

  if (!clears.carpenter) {
    const carpenterAssignment = item?.workerAssignments?.carpenter || null;
    const carpenterActiveStage = getItemActiveRoleStage(item, 'carpenter');
    const activeStage = getItemActiveStage(item);
    const assignedStage = getItemAssignedStage(item);
    const workerStageForText = assignedStage || carpenterActiveStage || activeStage || null;
    [
      carpenterAssignment?.scannedAt,
      carpenterActiveStage?.startedAt,
      workerStageForText?.startedAt,
    ].forEach((value) => {
      const ts = String(value || '').trim();
      if (ts) timestamps.push(ts);
    });
  }

  return timestamps;
}

function getOrderOverallStatus(order) {
  const items = getOrderItems(order);
  if (items.length === 0) {
    const primaryItem = getOrderPrimaryItem(order);
    return primaryItem?.overallStatus || order?.overallStatus || 'pending';
  }
  if (items.every((item) => item?.overallStatus === 'completed')) return 'completed';
  if (items.every((item) => (item?.overallStatus || 'pending') === 'pending')) return 'pending';
  return 'in_progress';
}

function getOrderPrimaryName(order) {
  const primaryItem = getOrderPrimaryItem(order);
  return primaryItem?.name || order?.name || '';
}

function getOrderPrimaryQuantity(order) {
  const primaryItem = getOrderPrimaryItem(order);
  return primaryItem?.quantity || order?.quantity || 1;
}

function getOrderPrimaryMaterial(order) {
  const primaryItem = getOrderPrimaryItem(order);
  return primaryItem?.material || order?.material || '';
}

function getOrderPrimaryNotes(order) {
  const primaryItem = getOrderPrimaryItem(order);
  return primaryItem?.notes || order?.notes || '';
}

function getItemManufacturingMeta(item) {
  const sourceItem = item && typeof item === 'object' ? item : {};
  const manualStageMarks = sourceItem.manualStageMarks && typeof sourceItem.manualStageMarks === 'object'
    ? sourceItem.manualStageMarks
    : {};
  const manualStageClears = sourceItem.manualStageClears && typeof sourceItem.manualStageClears === 'object'
    ? sourceItem.manualStageClears
    : {};
  const explicitStartAt = getItemEffectiveManufacturingTimestamp(sourceItem, 'itemStartDate', manualStageMarks, manualStageClears);
  const triggerStartAt = getItemEffectiveManufacturingTimestamp(sourceItem, ORDER_MANUFACTURING_START_TRIGGER_COLUMN_KEY, manualStageMarks, manualStageClears);
  const startAt = explicitStartAt || triggerStartAt || '';
  const explicitEndAt = getItemEffectiveManufacturingTimestamp(sourceItem, 'itemEndDate', manualStageMarks, manualStageClears);
  const completionTimestamps = ORDER_MANUFACTURING_REQUIRED_COLUMN_KEYS.map((columnKey) => (
    getItemEffectiveManufacturingTimestamp(sourceItem, columnKey, manualStageMarks, manualStageClears)
  ));
  const isCompleted = completionTimestamps.every(Boolean);
  const endAt = explicitEndAt || (isCompleted ? getLatestTimestamp(...completionTimestamps) : '');

  return {
    startAt,
    endAt,
    startDate: startAt ? startAt.split('T')[0] : '',
    endDate: endAt ? endAt.split('T')[0] : '',
    isCompleted,
  };
}

function getOrderManufacturingMeta(order) {
  const items = getOrderItems(order);
  const startTimestamps = [];
  const endTimestamps = [];
  const manualDateOverrides = normalizeOrderManualDateOverrides(order?.manualDateOverrides);

  items.forEach((item) => {
    const manualStageMarks = item?.manualStageMarks && typeof item.manualStageMarks === 'object'
      ? item.manualStageMarks
      : {};
    const manualStageClears = item?.manualStageClears && typeof item.manualStageClears === 'object'
      ? item.manualStageClears
      : {};
    const explicitStartAt = getItemEffectiveManufacturingTimestamp(item, 'itemStartDate', manualStageMarks, manualStageClears);
    const triggerStartAt = getItemEffectiveManufacturingTimestamp(item, ORDER_MANUFACTURING_START_TRIGGER_COLUMN_KEY, manualStageMarks, manualStageClears);
    const itemStartAt = explicitStartAt || triggerStartAt || '';
    if (itemStartAt) {
      startTimestamps.push(itemStartAt);
    }

    const explicitEndAt = getItemEffectiveManufacturingTimestamp(item, 'itemEndDate', manualStageMarks, manualStageClears);
    const completionTimestamps = ORDER_MANUFACTURING_REQUIRED_COLUMN_KEYS.map((columnKey) => (
      getItemEffectiveManufacturingTimestamp(item, columnKey, manualStageMarks, manualStageClears)
    ));
    if (explicitEndAt) {
      endTimestamps.push(explicitEndAt);
    } else if (completionTimestamps.every(Boolean)) {
      endTimestamps.push(getLatestTimestamp(...completionTimestamps));
    }
  });

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

function isOrderArchived(order) {
  return Boolean(String(order?.archivedAt || '').trim());
}

function getOrderArchiveEligibility(order) {
  if (!order || typeof order !== 'object') {
    return {
      isEligible: false,
      reason: 'Заказ не найден.',
    };
  }

  if (isOrderArchived(order)) {
    return {
      isEligible: false,
      reason: 'Заказ уже находится в архиве.',
    };
  }

  if (!String(order.orderNumber || '').trim()) {
    return {
      isEligible: false,
      reason: 'Укажите номер заказа.',
    };
  }

  if (!String(order.orderDate || '').trim()) {
    return {
      isEligible: false,
      reason: 'Укажите дату заказа.',
    };
  }

  const items = getOrderItems(order);
  if (items.length === 0) {
    return {
      isEligible: false,
      reason: 'В заказе пока нет изделий.',
    };
  }

  const hasIncompleteItems = items.some((item) => !getItemManufacturingMeta(item).isCompleted);
  if (hasIncompleteItems || !getOrderManufacturingMeta(order).isCompleted) {
    return {
      isEligible: false,
      reason: 'Не все обязательные ячейки заполнены, закрашены и исполнены по счетчикам.',
    };
  }

  return {
    isEligible: true,
    reason: '',
  };
}

export {
  getOrderArchiveEligibility,
  getOrderComments,
  getItemManufacturingMeta,
  getOrderManufacturingMeta,
  getOrderItems,
  getOrderOverallStatus,
  getOrderPrimaryItem,
  getOrderPrimaryMaterial,
  getOrderPrimaryName,
  getOrderPrimaryNotes,
  getOrderPrimaryQuantity,
  getOrderStages,
  isOrderArchived,
};

