const DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
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

function padDatePart(value) {
  return String(value || '').padStart(2, '0');
}

function buildUtcDateParts(day, month, year) {
  const normalizedDay = Number(day);
  const normalizedMonth = Number(month);
  const normalizedYear = Number(year);
  if (!Number.isInteger(normalizedDay) || !Number.isInteger(normalizedMonth) || !Number.isInteger(normalizedYear)) {
    return null;
  }
  const date = new Date(Date.UTC(normalizedYear, normalizedMonth - 1, normalizedDay));
  if (
    date.getUTCFullYear() !== normalizedYear
    || date.getUTCMonth() !== normalizedMonth - 1
    || date.getUTCDate() !== normalizedDay
  ) {
    return null;
  }
  return {
    date,
    iso: `${normalizedYear}-${padDatePart(normalizedMonth)}-${padDatePart(normalizedDay)}`,
  };
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

export function formatDateShortDisplay(value) {
  const normalized = normalizeDateTimeValue(value);
  if (!normalized) return '—';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? normalized
    : SHORT_DATE_FORMATTER.formatToParts(date)
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

export function maskDateInputValue(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

export function parseDateInputValue(value) {
  const normalized = normalizeDateTimeValue(value);
  if (!normalized) return '';

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildUtcDateParts(day, month, year)?.iso || null;
  }

  const displayMatch = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (displayMatch) {
    const [, day, month, year] = displayMatch;
    return buildUtcDateParts(day, month, year)?.iso || null;
  }

  const maskedValue = maskDateInputValue(normalized);
  const maskedMatch = maskedValue.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!maskedMatch) return null;
  const [, day, month, year] = maskedMatch;
  return buildUtcDateParts(day, month, year)?.iso || null;
}

export function formatDateInputValue(value) {
  const normalized = normalizeDateTimeValue(value);
  if (!normalized) return '';

  const parsedIso = parseDateInputValue(normalized);
  if (parsedIso) {
    const isoMatch = parsedIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return `${day}.${month}.${year}`;
    }
  }

  return maskDateInputValue(normalized);
}
