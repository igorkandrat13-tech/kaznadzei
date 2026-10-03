function formatDateLabel(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return 'не указана';
  const plainDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plainDateMatch) {
    return `${plainDateMatch[3]}.${plainDateMatch[2]}.${plainDateMatch[1]}`;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleDateString('ru-RU');
}

function truncateTelegramLabel(value = '', maxLength = 26) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function normalizeTelegramButtonText(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function buildTelegramProgressBar(completed = 0, total = 0, { segments = 8 } = {}) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeCompleted = Math.max(0, Math.min(safeTotal, Number(completed) || 0));
  if (!safeTotal) return { bar: '⬜⬜⬜⬜⬜⬜⬜⬜', percent: 0 };
  const percent = Math.round((safeCompleted / safeTotal) * 100);
  const filledSegments = Math.max(0, Math.min(segments, Math.round((safeCompleted / safeTotal) * segments)));
  return {
    bar: `${'🟩'.repeat(filledSegments)}${'⬜'.repeat(Math.max(0, segments - filledSegments))}`,
    percent,
  };
}

function getStageStatusMarker(status = '', legendKey = '') {
  const normalizedStatus = String(status || '').trim();
  const normalizedLegendKey = String(legendKey || '').trim();
  if (normalizedStatus !== 'completed') return '⬜';
  if (normalizedLegendKey === 'stock') return '🟧';
  if (normalizedLegendKey === 'assembly') return '🟧';
  if (normalizedLegendKey === 'kitting') return '🟧';
  if (normalizedLegendKey === 'paint') return '🟪';
  if (normalizedLegendKey === 'postpaint') return '🟥';
  return '🟩';
}

function shortFullName(fullName = '') {
  const normalized = String(fullName || '').trim();
  if (!normalized) return '';
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return normalized;
  const [surname, name, patronymic] = parts;
  const nameInit = name ? `${name.slice(0, 1)}.` : '';
  const patInit = patronymic ? `${patronymic.slice(0, 1)}.` : '';
  return [surname, nameInit, patInit].filter(Boolean).join(' ');
}

function getReadableOrderStatus(order = {}) {
  const s = String(order?.status || order?.orderStatus || '').toLowerCase().trim();
  if (s === 'archived' || s === 'canceled' || s === 'cancelled') return 'В архиве';
  if (s === 'completed' || s === 'ready' || s === 'done') return 'Выполнен';
  if (s === 'in_progress' || s === 'active' || s === 'manufacturing') return 'В производстве';
  if (s === 'planned' || s === 'pending') return 'Запланирован';
  return 'В обработке';
}

function getStatusEmoji(status = '') {
  const s = String(status || '').toLowerCase().trim();
  if (s === 'Выполнен' || s === 'готов' || s === 'completed' || s === 'ready' || s === 'done') return '✅';
  if (s === 'В производстве' || s === 'in_progress' || s === 'active' || s === 'manufacturing') return '🔨';
  if (s === 'В архиве' || s === 'archived') return '📦';
  return '📝';
}

function getReadableItemStatus(item = {}) {
  const s = String(item?.status || item?.itemStatus || '').toLowerCase().trim();
  if (s === 'completed' || s === 'ready' || s === 'done') return 'Готово';
  if (s === 'in_progress' || s === 'active' || s === 'manufacturing') return 'В работе';
  if (s === 'planned' || s === 'pending') return 'Ожидает';
  return 'В обработке';
}

function getOrderItemCount(order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  let total = 0;
  for (let i = 0; i < items.length; i += 1) {
    const q = Number(items[i]?.quantity || 0);
    total += Number.isFinite(q) && q > 0 ? q : 1;
  }
  return total;
}

function getItemCurrentStageLabel(item = {}) {
  const stages = Array.isArray(item?.stages) ? item.stages : [];
  for (let i = 0; i < stages.length; i += 1) {
    const st = stages[i];
    const status = String(st?.status || '').toLowerCase();
    if (status === 'active' || status === 'in_progress') {
      return truncateTelegramLabel(String(st?.label || st?.name || st?.stepName || '').trim());
    }
  }
  return '';
}

function getOrderItemDisplayName(item = {}, index = 0) {
  const explicit = String(item?.displayName || item?.itemName || item?.name || '').trim();
  if (explicit) return explicit;
  const idx = Number.isFinite(Number(index)) ? Number(index) : 0;
  return `Изделие №${idx + 1}`;
}

function getOrderDisplayName(order = {}) {
  const orderNumber = String(order?.orderNumber || order?.number || '').trim();
  const customerName = String(order?.customerName || order?.customer?.displayName || order?.customer || '').trim();
  const parts = [];
  if (orderNumber) parts.push(`Заказ №${orderNumber}`);
  if (customerName) parts.push(customerName);
  if (!parts.length) return 'Заказ';
  return parts.join(' · ');
}

function getCustomerDisplayName(customer = {}) {
  if (!customer || typeof customer !== 'object') return '';
  const short = shortFullName(String(customer?.fullName || customer?.name || customer?.displayName || '').trim());
  if (short) return short;
  const phone = String(customer?.phone || customer?.telephone || customer?.mobile || '').trim();
  if (phone) return phone;
  const email = String(customer?.email || '').trim();
  if (email) return email;
  return '';
}

module.exports = {
  formatDateLabel,
  truncateTelegramLabel,
  normalizeTelegramButtonText,
  buildTelegramProgressBar,
  getStageStatusMarker,
  shortFullName,
  getReadableOrderStatus,
  getStatusEmoji,
  getReadableItemStatus,
  getOrderItemCount,
  getItemCurrentStageLabel,
  getOrderItemDisplayName,
  getOrderDisplayName,
  getCustomerDisplayName,
};
