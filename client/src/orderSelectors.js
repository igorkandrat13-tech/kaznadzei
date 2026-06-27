function getOrderItems(order) {
  return Array.isArray(order?.items) ? order.items : [];
}

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
  const primaryItem = getOrderPrimaryItem(order);
  return primaryItem?.overallStatus || order?.overallStatus || 'pending';
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

export {
  getOrderComments,
  getOrderItems,
  getOrderOverallStatus,
  getOrderPrimaryItem,
  getOrderPrimaryMaterial,
  getOrderPrimaryName,
  getOrderPrimaryNotes,
  getOrderPrimaryQuantity,
  getOrderStages,
};
