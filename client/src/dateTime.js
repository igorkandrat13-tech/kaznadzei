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

const TIME_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
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
  return Number.isNaN(date.getTime())
    ? normalized
    : DATE_FORMATTER.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => part.value)
      .join('.');
}

export function formatTimeDisplay(value) {
  const normalized = normalizeDateTimeValue(value);
  if (!normalized) return '—';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? normalized
    : TIME_FORMATTER.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => part.value)
      .join(':');
}

export function formatDateTimeDisplay(value) {
  const normalized = normalizeDateTimeValue(value);
  if (!normalized) return '';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? normalized
    : `${formatDateDisplay(normalized)} ${formatTimeDisplay(normalized)}`;
}
