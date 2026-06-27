function getOrderItems(order) {
  return Array.isArray(order?.items) ? order.items : [];
}

const ORDER_MANUAL_STAGE_COLUMN_KEYS = [
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

    ORDER_MANUAL_STAGE_COLUMN_KEYS.forEach((columnKey) => {
      const updatedAt = String(manualStageMarks[columnKey]?.updatedAt || '').trim();
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
