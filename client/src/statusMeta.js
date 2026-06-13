export const STAGE_STATUS_CYCLE = {
  pending: 'in_progress',
  in_progress: 'completed',
  completed: 'pending',
};

export const STAGE_STATUS_META = {
  pending: { className: 'badge', label: 'Ожидание' },
  in_progress: { className: 'badge badge-pending', label: 'В работе' },
  completed: { className: 'badge badge-active', label: 'Готов' },
};

export const ORDER_STATUS_META = {
  pending: { className: 'badge', label: 'Ожидание' },
  in_progress: { className: 'badge badge-pending', label: 'В работе' },
  completed: { className: 'badge badge-active', label: 'Завершен' },
};

export const ORDER_STATUS_OPTIONS = [
  { value: 'pending', label: ORDER_STATUS_META.pending.label },
  { value: 'in_progress', label: ORDER_STATUS_META.in_progress.label },
  { value: 'completed', label: ORDER_STATUS_META.completed.label },
];

export function getStageStatusMeta(status) {
  return STAGE_STATUS_META[status] || STAGE_STATUS_META.pending;
}

export function getOrderStatusMeta(status) {
  return ORDER_STATUS_META[status] || ORDER_STATUS_META.pending;
}
