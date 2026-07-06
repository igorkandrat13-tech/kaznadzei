const DEFAULT_ORDER_PRIMARY_HEADERS = [
  'Номер заказа',
  'Заказчик',
  'Помещение',
  '№ помещения',
  '№ изделия в заказе',
  'Кол-во изделй',
  'Наименование',
  'Карточка заказа',
  'Комплектация заказа',
  'Примечания',
  'Отгрузка до',
  'СТОЛЯР',
  'Заявки на расходники',
  'Покраска',
  'Начало изготовления изделия',
  'Окончание изготовления изделия',
  'Время изготовления изделий',
  'Время изготовления заказа',
];

const DEFAULT_ORDER_STAGE_LEGEND = [
  {
    key: 'unprocessed',
    storeName: 'Легенда этапов: заказ не обработан',
    label: 'Заказ не обработан',
    description: 'Начальный статус без запуска работ',
    defaultHex: '#FFFFFF',
  },
  {
    key: 'brief',
    storeName: 'Легенда этапов: ТЗ',
    label: 'ТЗ',
    description: 'ТЗ от заказчика, ТЗ для чертежей',
    defaultHex: '#D3EAD9',
  },
  {
    key: 'drafting',
    storeName: 'Легенда этапов: чертежи',
    label: 'Чертежи',
    description: 'Начерчен, Расписан, Размеры, Готово ТЗ',
    defaultHex: '#A8D7B6',
  },
  {
    key: 'stock',
    storeName: 'Легенда этапов: заготовка',
    label: 'Заготовка',
    description: 'Набирается заготовка, Укомплектовано',
    defaultHex: '#99E5FF',
  },
  {
    key: 'assembly',
    storeName: 'Легенда этапов: сборка',
    label: 'Сборка',
    description: 'Собирается, Шлифуется',
    defaultHex: '#F4C2A4',
  },
  {
    key: 'paint',
    storeName: 'Легенда этапов: покраска',
    label: 'Покраска',
    description: 'Красится',
    defaultHex: '#BDA6D5',
  },
  {
    key: 'postpaint',
    storeName: 'Легенда этапов: после покраски',
    label: 'После покраски',
    description: 'Сборка после покраски',
    defaultHex: '#C37C8E',
  },
  {
    key: 'ready',
    storeName: 'Легенда этапов: готово',
    label: 'Готово',
    description: 'Готов, Доставка/монтаж',
    defaultHex: '#1D7638',
  },
];

const DEFAULT_ORDER_STAGE_SECONDARY_HEADERS = [
  { label: '', legendKey: '', colSpan: 1, textHex: '#000000', stickyCol: 'sticky-col-1', hex: '' },
  { label: 'Заказ не обработан', legendKey: 'unprocessed', colSpan: 1, textHex: '#000000', stickyCol: 'sticky-col-2', useTableBackground: true, hex: '' },
  { label: 'ТЗ от заказчика', legendKey: 'brief', colSpan: 1, textHex: '#000000', hex: '#D3EAD9' },
  { label: 'ТЗ для чертежей', legendKey: 'brief', colSpan: 2, textHex: '#000000', hex: '#D3EAD9' },
  { label: 'Начерчен', legendKey: 'drafting', colSpan: 1, textHex: '#1F1F1F', noWrap: true, hex: '#A8D7B6' },
  { label: 'Расписан', legendKey: 'drafting', colSpan: 1, textHex: '#1F1F1F', hex: '#A8D7B6' },
  { label: 'Утверждено заказчиком', legendKey: 'drafting', colSpan: 1, textHex: '#1F1F1F', hex: '#A8D7B6' },
  { label: 'Укомплектовано', legendKey: 'drafting', colSpan: 1, textHex: '#1F1F1F', hex: '#A8D7B6' },
  { label: 'Набирается заготовка', legendKey: 'stock', colSpan: 1, textHex: '#1F1F1F', hex: '#99E5FF' },
  { label: 'Промежуточная шлифовка', legendKey: 'stock', colSpan: 1, textHex: '#1F1F1F', hex: '#99E5FF' },
  { label: 'Собирается', legendKey: 'assembly', colSpan: 1, textHex: '#1F1F1F', hex: '#F4C2A4' },
  { label: 'Шлифуется', legendKey: 'assembly', colSpan: 1, textHex: '#1F1F1F', hex: '#F4C2A4' },
  { label: 'Красится', legendKey: 'paint', colSpan: 1, textHex: '#000000', hex: '#BDA6D5' },
  { label: 'Сборка после покраски', legendKey: 'postpaint', colSpan: 1, textHex: '#000000', hex: '#C37C8E' },
  { label: 'Контроль качества', legendKey: 'postpaint', colSpan: 1, textHex: '#000000', hex: '#C37C8E' },
  { label: 'Доставка/Монтаж', legendKey: 'ready', colSpan: 1, textHex: '#000000', hex: '#1D7638' },
  { label: 'Готово', legendKey: 'ready', colSpan: 1, textHex: '#000000', hex: '#1D7638' },
];

function normalizeStage(source = {}, fallback) {
  const key = String(fallback?.key || source?.key || '').trim();
  return {
    key,
    storeName: String(fallback?.storeName || source?.storeName || '').trim(),
    label: String(source?.label ?? fallback?.label ?? '').trim(),
    description: String(source?.description ?? fallback?.description ?? '').trim(),
    defaultHex: String(source?.defaultHex ?? fallback?.defaultHex ?? '#FFFFFF').trim() || '#FFFFFF',
  };
}

function normalizeSecondaryHeader(source = {}, fallback = {}, stageColorMap = {}) {
  const nextLegendKey = String(source?.legendKey ?? fallback?.legendKey ?? '').trim();
  const fallbackHex = fallback?.useTableBackground
    ? ''
    : (stageColorMap[nextLegendKey] || fallback?.hex || '');
  return {
    label: String(source?.label ?? fallback?.label ?? '').trim(),
    legendKey: nextLegendKey,
    colSpan: Number(fallback?.colSpan) || 1,
    hex: String(source?.hex ?? fallbackHex).trim(),
    textHex: String(fallback?.textHex || '#000000').trim() || '#000000',
    stickyCol: String(fallback?.stickyCol || '').trim(),
    useTableBackground: Boolean(fallback?.useTableBackground),
    noWrap: Boolean(fallback?.noWrap),
  };
}

function normalizeOrderStageLegendConfig(source = {}) {
  const sourceStages = Array.isArray(source?.stages) ? source.stages : [];
  const sourceHeaders = Array.isArray(source?.secondaryHeaders) ? source.secondaryHeaders : [];
  const sourcePrimaryHeaders = Array.isArray(source?.primaryHeaders) ? source.primaryHeaders : [];

  const primaryHeaders = DEFAULT_ORDER_PRIMARY_HEADERS.map((fallbackLabel, index) => {
    const sourceLabel = sourcePrimaryHeaders[index];
    const normalizedSourceLabel = String(sourceLabel ?? '').trim();
    return sourceLabel === undefined || (!normalizedSourceLabel && fallbackLabel)
      ? String(fallbackLabel ?? '').trim()
      : normalizedSourceLabel;
  });

  const stages = DEFAULT_ORDER_STAGE_LEGEND.map((fallbackStage) => {
    const matched = sourceStages.find((item) => String(item?.key || '').trim() === fallbackStage.key) || {};
    return normalizeStage(matched, fallbackStage);
  });

  const validLegendKeys = new Set(stages.map((item) => item.key));
  const stageColorMap = stages.reduce((acc, item) => {
    acc[item.key] = item.defaultHex || '#FFFFFF';
    return acc;
  }, {});

  const secondaryHeaders = DEFAULT_ORDER_STAGE_SECONDARY_HEADERS.map((fallbackHeader, index) => {
    const matched = sourceHeaders[index] || {};
    const nextHeader = normalizeSecondaryHeader(matched, fallbackHeader, stageColorMap);
    if (nextHeader.legendKey && !validLegendKeys.has(nextHeader.legendKey)) {
      nextHeader.legendKey = fallbackHeader.legendKey || '';
    }
    return nextHeader;
  });

  return { primaryHeaders, stages, secondaryHeaders };
}

function getDefaultOrderStageLegendConfig() {
  return normalizeOrderStageLegendConfig({});
}

module.exports = {
  DEFAULT_ORDER_PRIMARY_HEADERS,
  DEFAULT_ORDER_STAGE_LEGEND,
  DEFAULT_ORDER_STAGE_SECONDARY_HEADERS,
  getDefaultOrderStageLegendConfig,
  normalizeOrderStageLegendConfig,
};
