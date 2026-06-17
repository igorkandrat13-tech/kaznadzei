export const STAGE_STATUS_CYCLE = {
  pending: 'in_progress',
  in_progress: 'completed',
  completed: 'pending',
};

export const STAGE_STATUS_META = {
  pending: { className: 'badge badge-neutral', label: 'Ожидание' },
  in_progress: { className: 'badge badge-progress', label: 'В работе' },
  completed: { className: 'badge badge-success', label: 'Готов' },
};

export const ORDER_STATUS_META = {
  pending: { className: 'badge badge-neutral', label: 'Ожидание' },
  in_progress: { className: 'badge badge-progress', label: 'В работе' },
  completed: { className: 'badge badge-success', label: 'Завершен' },
};

export const ORDER_STATUS_OPTIONS = [
  { value: 'pending', label: ORDER_STATUS_META.pending.label },
  { value: 'in_progress', label: ORDER_STATUS_META.in_progress.label },
  { value: 'completed', label: ORDER_STATUS_META.completed.label },
];

export function getStageStatusMeta(status) {
  return STAGE_STATUS_META[status] || STAGE_STATUS_META.pending;
}

export function getNextStageStatusMeta(status) {
  return getStageStatusMeta(STAGE_STATUS_CYCLE[status] || 'pending');
}

export function getOrderStatusMeta(status) {
  return ORDER_STATUS_META[status] || ORDER_STATUS_META.pending;
}
