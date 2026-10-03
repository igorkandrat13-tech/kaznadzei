const {
  ORDER_MANUFACTURING_REQUIRED_COLUMN_KEYS,
  ORDER_TRACKED_PRIMARY_START_INDEX,
  ORDER_TRACKED_PRIMARY_END_INDEX,
  PRIMARY_INDEX_TO_ORDER_COLUMN_KEY,
  normalizeOrderColumnKey,
  getTrackedSecondaryHeaderCells,
  getSecondaryHeaderForPrimaryColumn,
  ORDER_PRIMARY_HEADERS,
} = require('./stageMapping');
const { isPrimaryCellHighlighted, hasValidMark, isCleared } = require('./stageHighlighting');

const ORDER_PROGRESS_STAGE_WEIGHTS = [2, 4, 6, 3, 2, 3, 3, 3, 5, 5, 4, 3, 6, 4, 3, 3, 5, 6];

function getItemActiveRoleStage(item = {}, role = '') {
  const stages = Array.isArray(item?.stages) ? item.stages : [];
  const roleName = String(role || '').trim().toLowerCase();
  for (let i = 0; i < stages.length; i += 1) {
    const stage = stages[i];
    const match = (String(stage?.role || '').toLowerCase() === roleName)
      || (String(stage?.roleName || '').toLowerCase() === roleName)
      || (String(stage?.workerRole || '').toLowerCase() === roleName);
    if (match && stage && String(stage.status || '').toLowerCase() === 'active') return stage;
  }
  for (let i = 0; i < stages.length; i += 1) {
    const stage = stages[i];
    const match = (String(stage?.role || '').toLowerCase() === roleName)
      || (String(stage?.roleName || '').toLowerCase() === roleName)
      || (String(stage?.workerRole || '').toLowerCase() === roleName);
    if (match && stage && String(stage.status || '').toLowerCase() === 'in_progress') return stage;
  }
  return null;
}

function getItemActiveStage(item = {}) {
  const stages = Array.isArray(item?.stages) ? item.stages : [];
  for (let i = 0; i < stages.length; i += 1) {
    const stage = stages[i];
    const s = String(stage?.status || '').toLowerCase();
    if (s === 'active' || s === 'in_progress') return stage;
  }
  return null;
}

function getItemAssignedStage(item = {}) {
  const stages = Array.isArray(item?.stages) ? item.stages : [];
  for (let i = 0; i < stages.length; i += 1) {
    const stage = stages[i];
    if (stage?.workerFullName || stage?.workerId || stage?.assignedTo) return stage;
  }
  return null;
}

function getLatestTimestamp(...timestamps) {
  return timestamps
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .sort()
    .at(-1) || '';
}

function getItemEffectiveColumnTimestamp(item = {}, columnKey = '') {
  const normKey = normalizeOrderColumnKey(columnKey);
  const marks = (item && item.manualStageMarks && typeof item.manualStageMarks === 'object') ? item.manualStageMarks : {};
  const clears = (item && item.manualStageClears && typeof item.manualStageClears === 'object') ? item.manualStageClears : {};
  const mark = marks && (marks[columnKey] || marks[normKey]);
  if (mark && !isCleared(item, columnKey) && !isCleared(item, normKey) && hasValidMark(mark)) {
    return String(mark.updatedAt || mark.date || '').trim();
  }
  const itemValue = item && (item[columnKey] != null ? item[columnKey] : item[normKey]);
  if (itemValue != null) return String(itemValue || '').trim();
  return '';
}

function getItemManufacturingMeta(item = {}) {
  const completionTimestamps = ORDER_MANUFACTURING_REQUIRED_COLUMN_KEYS.map((ck) => (
    getItemEffectiveColumnTimestamp(item, ck)
  ));
  const lastCompleted = getLatestTimestamp(...completionTimestamps);
  const manufacturingStart = (
    String(item?.manufacturingStartedAt || item?.startDate || item?.itemStartDate || '').trim()
    || lastCompleted
  );
  return {
    manufacturingStart,
    lastCompleted,
    estimatedFinish: String(item?.estimatedEndDate || item?.itemEndDate || item?.deliveryDate || '').trim(),
    actualFinish: String(item?.actualEndDate || item?.readyAt || item?.completedAt || '').trim(),
  };
}

function getTrackedStageLabel(header = {}) {
  const explicit = String(header?.trackedLabel || header?.customerLabel || header?.telegramLabel || '').trim();
  if (explicit) return explicit;
  const short = String(header?.shortLabel || header?.label || header?.name || header?.text || '').trim();
  if (short) return short;
  const lk = String(header?.legendKey || header?.key || '').trim();
  if (lk) return lk;
  return '—';
}

function getTrackedStageWeight(stageIndex = -1) {
  if (!Number.isInteger(stageIndex) || stageIndex < 0) return 3;
  if (stageIndex >= 0 && stageIndex < ORDER_PROGRESS_STAGE_WEIGHTS.length) return Number(ORDER_PROGRESS_STAGE_WEIGHTS[stageIndex]) || 3;
  return 3;
}

function getItemTrackedStageProgress(order = {}, item = {}) {
  const cells = getTrackedSecondaryHeaderCells();
  const results = [];
  for (let i = 0; i < cells.length; i += 1) {
    const header = cells[i];
    const primaryIndexes = Array.isArray(header?.primaryIndexes) ? header.primaryIndexes : [];
    if (!primaryIndexes.length) continue;
    let completedCount = 0;
    let totalCount = primaryIndexes.length;
    const statusMarkers = [];
    for (let j = 0; j < primaryIndexes.length; j += 1) {
      const pi = primaryIndexes[j];
      const highlighted = isPrimaryCellHighlighted(item, pi);
      if (highlighted) completedCount += 1;
      statusMarkers.push(Boolean(highlighted));
    }
    let status = 'pending';
    if (completedCount <= 0) status = 'pending';
    else if (completedCount >= totalCount) status = 'completed';
    else status = 'in_progress';
    results.push({
      stageIndex: i,
      legendKey: String(header?.legendKey || '').trim(),
      label: getTrackedStageLabel(header),
      header,
      status,
      completedCount,
      totalCount,
      statusMarkers,
      weight: getTrackedStageWeight(i),
    });
  }
  return results;
}

function getItemProgressSnapshot(order = {}, item = {}) {
  const stages = getItemTrackedStageProgress(order, item);
  if (!stages.length) return { completedCount: 0, totalCount: 0, percent: 0, weightSum: 0 };
  let weightSum = 0;
  let weightedDone = 0;
  let completedStages = 0;
  for (let i = 0; i < stages.length; i += 1) {
    const st = stages[i];
    const w = Number(st.weight) > 0 ? Number(st.weight) : 3;
    const ratio = st.totalCount > 0 ? (st.completedCount / st.totalCount) : 0;
    weightSum += w;
    weightedDone += (w * ratio);
    if (st.status === 'completed') completedStages += 1;
  }
  const percent = weightSum > 0 ? Math.max(0, Math.min(100, Math.round((weightedDone / weightSum) * 100))) : 0;
  return {
    completedCount: completedStages,
    totalCount: stages.length,
    percent,
    weightSum,
    stages,
  };
}

function getOrderProgressSnapshot(order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return { completedCount: 0, totalCount: 0, percent: 0 };
  let totalWeight = 0;
  let done = 0;
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const snap = getItemProgressSnapshot(order, it);
    const w = 1;
    totalWeight += w;
    done += w * (snap.percent / 100);
  }
  const percent = totalWeight > 0 ? Math.max(0, Math.min(100, Math.round((done / totalWeight) * 100))) : 0;
  return {
    completedCount: Math.round(done),
    totalCount: items.length,
    percent,
  };
}

module.exports = {
  ORDER_PROGRESS_STAGE_WEIGHTS,
  getItemActiveRoleStage,
  getItemActiveStage,
  getItemAssignedStage,
  getLatestTimestamp,
  getEarliestTimestamp: function getEarliestTimestamp(...ts) {
    return ts.map((v) => String(v || '').trim()).filter(Boolean).sort().at(0) || '';
  },
  getItemEffectiveColumnTimestamp,
  getItemManufacturingMeta,
  getTrackedStageLabel,
  getTrackedStageWeight,
  getItemTrackedStageProgress,
  getItemProgressSnapshot,
  getOrderProgressSnapshot,
};
