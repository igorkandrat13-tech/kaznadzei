const {
  ORDER_COLUMN_KEY_TO_PRIMARY_INDEX,
  PRIMARY_INDEX_TO_ORDER_COLUMN_KEY,
  normalizeOrderColumnKey,
  getSecondaryHeaderForPrimaryColumn,
} = require('./stageMapping');
const SettingsStore = require('../../stores/settingsStore');

function hasValidMark(mark = null) {
  if (!mark || typeof mark !== 'object') return false;
  return Boolean(String(mark.legendKey || '').trim() && String(mark.updatedAt || '').trim());
}

function isCleared(item, markKey) {
  const clears = (item && item.manualStageClears && typeof item.manualStageClears === 'object')
    ? item.manualStageClears
    : {};
  if (!clears || typeof clears !== 'object') return false;
  const normKey = String(markKey || '').trim();
  if (!normKey) return false;
  if (Object.prototype.hasOwnProperty.call(clears, normKey)) return Boolean(clears[normKey]);
  return false;
}

function isPrimaryCellHighlighted(item = {}, columnPrimaryIndex) {
  const settings = SettingsStore.get();
  const secondaryHeaders = Array.isArray(settings?.orderStageLegendConfig?.secondaryHeaders)
    ? settings.orderStageLegendConfig.secondaryHeaders
    : [];
  const itemObj = (item && typeof item === 'object') ? item : {};
  const columnKey = normalizeOrderColumnKey(PRIMARY_INDEX_TO_ORDER_COLUMN_KEY[Number(columnPrimaryIndex)] || '');
  const manualStageMarks = (itemObj.manualStageMarks && typeof itemObj.manualStageMarks === 'object')
    ? itemObj.manualStageMarks
    : {};
  const cellHeader = getSecondaryHeaderForPrimaryColumn(Number(columnPrimaryIndex), secondaryHeaders);
  const cellLegendKey = String(cellHeader?.legendKey || '').trim();
  void cellLegendKey;

  function isClearedMarkKey(k) { return isCleared(itemObj, k); }
  function hasValidMarkOn(m) { return hasValidMark(m); }
  const rawMarkKeys = Object.keys(manualStageMarks || {});
  const normCellKey = normalizeOrderColumnKey(columnKey);
  function markKeyToPrimaryIndex(rawKey) {
    const explicit = Number(ORDER_COLUMN_KEY_TO_PRIMARY_INDEX[rawKey]);
    if (Number.isInteger(explicit)) return explicit;
    const norm = normalizeOrderColumnKey(rawKey);
    const implicit = Number(ORDER_COLUMN_KEY_TO_PRIMARY_INDEX[norm]);
    if (Number.isInteger(implicit)) return implicit;
    const mark = manualStageMarks[rawKey] || null;
    const legend = String(mark && (mark.legendKey || mark.key || '')).trim();
    if (legend) {
      const viaLegend = Number(ORDER_COLUMN_KEY_TO_PRIMARY_INDEX[legend]);
      if (Number.isInteger(viaLegend)) return viaLegend;
      const normLegend = normalizeOrderColumnKey(legend);
      const viaNormLegend = Number(ORDER_COLUMN_KEY_TO_PRIMARY_INDEX[normLegend]);
      if (Number.isInteger(viaNormLegend)) return viaNormLegend;
    }
    return null;
  }
  for (let i = 0; i < rawMarkKeys.length; i += 1) {
    const rawKey = rawMarkKeys[i];
    if (isClearedMarkKey(rawKey)) continue;
    const mark = manualStageMarks[rawKey];
    if (!hasValidMarkOn(mark)) continue;
    const normKey = normalizeOrderColumnKey(rawKey);
    if (normCellKey && normKey === normCellKey) return true;
    const orderColIndex = markKeyToPrimaryIndex(rawKey);
    const markPrimaryIndex = Number.isInteger(orderColIndex) ? orderColIndex : ORDER_COLUMN_KEY_TO_PRIMARY_INDEX[normKey];
    if (Number.isInteger(markPrimaryIndex) && Number.isInteger(Number(columnPrimaryIndex)) && markPrimaryIndex === Number(columnPrimaryIndex)) return true;
  }
  if (columnKey === 'orderCard') {
    if (isClearedMarkKey('orderCard')) return false;
    const hasManual = hasValidMarkOn(manualStageMarks?.orderCard) || hasValidMarkOn(manualStageMarks?.card) || hasValidMarkOn(manualStageMarks?.attachments) || hasValidMarkOn(manualStageMarks?.orderFiles);
    return Boolean(hasManual);
  }
  if (columnKey === 'paint') {
    if (isClearedMarkKey('paint') || isClearedMarkKey('paintAttachments')) return false;
    const hasManual = hasValidMarkOn(manualStageMarks?.paint) || hasValidMarkOn(manualStageMarks?.painting) || hasValidMarkOn(manualStageMarks?.color);
    return Boolean(hasManual);
  }
  if (columnKey === 'packageName') {
    if (isClearedMarkKey('packageName')) return false;
    const hasManual = hasValidMarkOn(manualStageMarks?.packageName) || hasValidMarkOn(manualStageMarks?.package) || hasValidMarkOn(manualStageMarks?.kitting) || hasValidMarkOn(manualStageMarks?.packageItems);
    return Boolean(hasManual);
  }
  if (columnKey === 'materialRequests') {
    if (isClearedMarkKey('materialRequests')) return false;
    const hasManual = hasValidMarkOn(manualStageMarks?.materialRequests) || hasValidMarkOn(manualStageMarks?.materials) || hasValidMarkOn(manualStageMarks?.supply) || hasValidMarkOn(manualStageMarks?.photoLink);
    return Boolean(hasManual);
  }
  if (columnKey === 'carpenter') {
    const carpenterMark = manualStageMarks && (manualStageMarks.carpenter || manualStageMarks.carpenterAssignment || manualStageMarks.assignedCarpenter || manualStageMarks.assignedStage || manualStageMarks.carpenterActiveStage);
    if (hasValidMarkOn(carpenterMark)) return true;
    if (isClearedMarkKey('carpenter') || isClearedMarkKey('carpenterAssignment') || isClearedMarkKey('assignedCarpenter') || isClearedMarkKey('assignedStage') || isClearedMarkKey('activeStage')) return false;
    const { getItemActiveRoleStage, getItemActiveStage, getItemAssignedStage } = require('./stageProgress');
    const carpenterAssignment = itemObj?.workerAssignments?.carpenter || null;
    const carpenterActiveStage = getItemActiveRoleStage(itemObj, 'carpenter');
    const activeStage = getItemActiveStage(itemObj);
    const assignedStage = getItemAssignedStage(itemObj);
    const workerStageForText = assignedStage || carpenterActiveStage || activeStage || null;
    return Boolean(carpenterAssignment || workerStageForText);
  }
  return false;
}

module.exports = {
  hasValidMark,
  isCleared,
  isPrimaryCellHighlighted,
};
