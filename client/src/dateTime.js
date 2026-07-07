const DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function normalizeDateTimeValue(value) {
  return String(value || '').trim();
}

export function formatDateDisplay(value) {
  const normalized = normalizeDateTimeValue(value);
  if (!normalized) return '—';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? normalized : DATE_FORMATTER.format(date);
}

export function formatDateTimeDisplay(value) {
  const normalized = normalizeDateTimeValue(value);
  if (!normalized) return '';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? normalized : DATE_TIME_FORMATTER.format(date);
}
