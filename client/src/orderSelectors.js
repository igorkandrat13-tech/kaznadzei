function getOrderItems(order) {
  return Array.isArray(order?.items) ? order.items : [];
}

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
  const updatedAt = String(manualStageMarks[columnKey]?.updatedAt || '').trim();
  if (updatedAt) return updatedAt;

  if (columnKey !== 'carpenter') return '';

  const carpenterAssignment = item?.workerAssignments?.carpenter || null;
  const carpenterActiveStage = getItemActiveRoleStage(item, 'carpenter');
  const activeStage = getItemActiveStage(item);
  const assignedStage = getItemAssignedStage(item);
  const workerStageForText = assignedStage || carpenterActiveStage || activeStage || null;
  const latestAutoAt = getLatestTimestamp(
    carpenterAssignment?.scannedAt,
    carpenterActiveStage?.startedAt,
    workerStageForText?.startedAt,
  );
  const isAutoHighlightSuppressed = Boolean(
    manualStageClears[columnKey]?.updatedAt
    && (!latestAutoAt || manualStageClears[columnKey].updatedAt >= latestAutoAt)
  );

  return ((carpenterAssignment || workerStageForText) && !isAutoHighlightSuppressed)
    ? latestAutoAt
    : '';
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

function getOrderManufacturingMeta(order) {
  const items = getOrderItems(order);
  const timestamps = [];
  let isCompleted = items.length > 0;

  items.forEach((item) => {
    const manualStageMarks = item?.manualStageMarks && typeof item.manualStageMarks === 'object'
      ? item.manualStageMarks
      : {};
    const manualStageClears = item?.manualStageClears && typeof item.manualStageClears === 'object'
      ? item.manualStageClears
      : {};

    ORDER_MANUFACTURING_STAGE_COLUMN_KEYS.forEach((columnKey) => {
      const updatedAt = getItemEffectiveManufacturingTimestamp(
        item,
        columnKey,
        manualStageMarks,
        manualStageClears,
      );
      if (updatedAt) {
        timestamps.push(updatedAt);
      } else {
        isCompleted = false;
      }
    });
  });

  const sorted = timestamps.slice().sort();
  const startAt = sorted[0] || '';
  const endAt = isCompleted ? (sorted.at(-1) || '') : '';

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
