function getOrderItems(order) {
  return Array.isArray(order?.items) ? order.items : [];
}

const ORDER_MANUFACTURING_EXCLUDED_COLUMN_KEYS = new Set([
  'orderNumber',
  'customer',
]);

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
  return stages.find((stage) => stage.status === 'in_progress' && String(stage.employeeName || '').trim())
    || stages.find((stage) => String(stage.employeeName || '').trim())
    || null;
}

function getItemEffectiveManufacturingTimestamp(item, columnKey, manualStageMarks = {}, manualStageClears = {}) {
  if (manualStageClears[columnKey]) return '';

  const updatedAt = String(manualStageMarks[columnKey]?.updatedAt || '').trim();
  if (updatedAt) return updatedAt;

  if (columnKey === 'orderAttachments' || columnKey === 'paintAttachments') {
    const fieldName = columnKey === 'paintAttachments' ? 'paintAttachments' : 'attachments';
    const attachments = Array.isArray(item?.[fieldName]) ? item[fieldName] : [];
    return getEarliestTimestamp(
      ...attachments.map((attachment) => attachment?.uploadedAt || attachment?.createdAt || attachment?.updatedAt || ''),
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
  const timestamps = getItemManufacturingTimelineTimestamps(sourceItem, manualStageMarks, manualStageClears);
  const sorted = timestamps.slice().sort();
  const startAt = sorted[0] || '';
  const endAt = sorted.at(-1) || '';
  const isCompleted = Boolean(startAt && endAt);

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
  const timestamps = [];

  items.forEach((item) => {
    const itemManufacturingMeta = getItemManufacturingMeta(item);
    if (itemManufacturingMeta.startAt) {
      timestamps.push(itemManufacturingMeta.startAt);
    }
    if (itemManufacturingMeta.endAt) {
      timestamps.push(itemManufacturingMeta.endAt);
    }
  });

  const sorted = timestamps.slice().sort();
  const startAt = sorted[0] || '';
  const endAt = sorted.at(-1) || '';
  const isCompleted = Boolean(startAt && endAt);

  return {
    startAt,
    endAt,
    startDate: startAt ? startAt.split('T')[0] : '',
    endDate: endAt ? endAt.split('T')[0] : '',
    isCompleted,
  };
}

export {
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
};
