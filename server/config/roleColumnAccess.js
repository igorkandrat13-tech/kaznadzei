const ROLE_COLUMN_ACCESS_OPTIONS = [
  { key: 'orderNumber', label: 'Номер заказа', description: 'Основной номер заказа в объединенной колонке.' },
  { key: 'customer', label: 'Заказчик', description: 'Колонка заказчика и карточки клиента.' },
  { key: 'room', label: 'Помещение', description: 'Наименование помещения.' },
  { key: 'roomNumber', label: 'Номер помещения', description: 'Порядковый номер помещения.' },
  { key: 'itemNumber', label: 'Номер изделия', description: 'Номер изделия внутри заказа.' },
  { key: 'quantity', label: 'Количество', description: 'Количество изделий в строке.' },
  { key: 'name', label: 'Наименование', description: 'Название изделия.' },
  { key: 'orderCard', label: 'Карточка заказа', description: 'Файлы и карточка заказа.' },
  { key: 'packageName', label: 'Комплектация заказа', description: 'Комплектация и готовность комплектовки.' },
  { key: 'notes', label: 'Примечания', description: 'Текстовые примечания по изделию.' },
  { key: 'deliveryDate', label: 'Отгрузка до', description: 'Плановая дата отгрузки.' },
  { key: 'materialRequests', label: 'Заявки на расходники', description: 'Заявки на расходники по изделию с чекбоксами исполнения.' },
  { key: 'carpenter', label: 'Столяр', description: 'Работа столярного этапа.' },
  { key: 'paint', label: 'Покраска', description: 'Работа по покраске и файлы покраски.' },
  { key: 'itemStartDate', label: 'Начало изготовления изделия', description: 'Дата начала изготовления изделия.' },
  { key: 'itemEndDate', label: 'Окончание изготовления изделия', description: 'Дата окончания изготовления изделия.' },
  { key: 'itemDuration', label: 'Время изготовления изделий', description: 'Длительность изготовления конкретного изделия.' },
  { key: 'duration', label: 'Время изготовления заказа', description: 'Сводная длительность изготовления заказа.' },
];

const ROLE_COLUMN_ACCESS_KEY_SET = new Set(ROLE_COLUMN_ACCESS_OPTIONS.map((item) => item.key));
const DEFAULT_ROLE_ALLOWED_COLUMNS = ROLE_COLUMN_ACCESS_OPTIONS.map((item) => item.key);
const ROLE_COLUMN_ACCESS_LEGACY_KEY_MAP = {
  photoLink: 'materialRequests',
};

function normalizeAllowedColumns(source, options = {}) {
  const fallbackToAll = options.fallbackToAll !== false;
  if (!Array.isArray(source)) {
    return fallbackToAll ? [...DEFAULT_ROLE_ALLOWED_COLUMNS] : [];
  }

  const seen = new Set();
  const normalized = [];
  for (const rawKey of source) {
    const rawNormalizedKey = String(rawKey || '').trim();
    const key = ROLE_COLUMN_ACCESS_LEGACY_KEY_MAP[rawNormalizedKey] || rawNormalizedKey;
    if (!ROLE_COLUMN_ACCESS_KEY_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }

  return normalized.length > 0 || !fallbackToAll
    ? normalized
    : [...DEFAULT_ROLE_ALLOWED_COLUMNS];
}

function isAllowedColumnKey(columnKey = '') {
  return ROLE_COLUMN_ACCESS_KEY_SET.has(String(columnKey || '').trim());
}

module.exports = {
  DEFAULT_ROLE_ALLOWED_COLUMNS,
  ROLE_COLUMN_ACCESS_OPTIONS,
  isAllowedColumnKey,
  normalizeAllowedColumns,
};
