export const ROLE_COLUMN_ACCESS_OPTIONS = [
  { key: 'orderNumber', label: 'Номер заказа', description: 'Основной номер заказа в объединенной колонке.', primaryColumnIndex: 0 },
  { key: 'customer', label: 'Заказчик', description: 'Колонка заказчика и карточки клиента.', primaryColumnIndex: 1 },
  { key: 'room', label: 'Помещение', description: 'Наименование помещения.', primaryColumnIndex: 2 },
  { key: 'roomNumber', label: 'Номер помещения', description: 'Порядковый номер помещения.', primaryColumnIndex: 3 },
  { key: 'itemNumber', label: 'Номер изделия', description: 'Номер изделия внутри заказа.', primaryColumnIndex: 4 },
  { key: 'quantity', label: 'Количество', description: 'Количество изделий в строке.', primaryColumnIndex: 5 },
  { key: 'name', label: 'Наименование', description: 'Название изделия.', primaryColumnIndex: 6 },
  { key: 'orderCard', label: 'Карточка заказа', description: 'Файлы и карточка заказа.', primaryColumnIndex: 7 },
  { key: 'packageName', label: 'Комплектация заказа', description: 'Комплектация и готовность комплектовки.', primaryColumnIndex: 8 },
  { key: 'notes', label: 'Примечания', description: 'Текстовые примечания по изделию.', primaryColumnIndex: 9 },
  { key: 'deliveryDate', label: 'Отгрузка до', description: 'Плановая дата отгрузки.', primaryColumnIndex: 10 },
  { key: 'photoLink', label: 'Фото/ссылка', description: 'Колонка ссылки или фото изделия.', primaryColumnIndex: 11 },
  { key: 'carpenter', label: 'Столяр', description: 'Работа столярного этапа.', primaryColumnIndex: 12 },
  { key: 'paint', label: 'Покраска', description: 'Работа по покраске и файлы покраски.', primaryColumnIndex: 14 },
  { key: 'itemStartDate', label: 'Начало изготовления изделия', description: 'Дата начала изготовления изделия.', primaryColumnIndex: 15 },
  { key: 'itemEndDate', label: 'Окончание изготовления изделия', description: 'Дата окончания изготовления изделия.', primaryColumnIndex: 16 },
  { key: 'itemDuration', label: 'Время изготовления изделий', description: 'Длительность изготовления конкретного изделия.', primaryColumnIndex: 17 },
  { key: 'duration', label: 'Время изготовления заказа', description: 'Сводная длительность изготовления заказа.', primaryColumnIndex: 18 },
];

export const DEFAULT_ROLE_ALLOWED_COLUMNS = ROLE_COLUMN_ACCESS_OPTIONS.map((item) => item.key);

const ROLE_COLUMN_ACCESS_KEY_SET = new Set(DEFAULT_ROLE_ALLOWED_COLUMNS);

export function normalizeAllowedColumns(source, options = {}) {
  const fallbackToAll = options.fallbackToAll !== false;
  if (!Array.isArray(source)) {
    return fallbackToAll ? [...DEFAULT_ROLE_ALLOWED_COLUMNS] : [];
  }

  const seen = new Set();
  const normalized = [];
  for (const rawKey of source) {
    const key = String(rawKey || '').trim();
    if (!ROLE_COLUMN_ACCESS_KEY_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }

  return normalized.length > 0 || !fallbackToAll
    ? normalized
    : [...DEFAULT_ROLE_ALLOWED_COLUMNS];
}

export function isAllowedColumnKey(columnKey = '') {
  return ROLE_COLUMN_ACCESS_KEY_SET.has(String(columnKey || '').trim());
}
