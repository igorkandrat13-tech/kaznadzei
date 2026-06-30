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
  { label: '', legendKey: '', colSpan: 1, textHex: '#000000', stickyCol: 'sticky-col-1' },
  { label: 'Заказ не обработан', legendKey: 'unprocessed', colSpan: 1, textHex: '#000000', stickyCol: 'sticky-col-2', useTableBackground: true },
  { label: 'ТЗ от заказчика', legendKey: 'brief', colSpan: 1, textHex: '#000000' },
  { label: 'ТЗ для чертежей', legendKey: 'brief', colSpan: 2, textHex: '#000000' },
  { label: 'Начерчен', legendKey: 'drafting', colSpan: 1, textHex: '#1F1F1F', noWrap: true },
  { label: 'Расписан', legendKey: 'drafting', colSpan: 1, textHex: '#1F1F1F' },
  { label: 'Утверждено заказчиком', legendKey: 'drafting', colSpan: 1, textHex: '#1F1F1F' },
  { label: 'Укомплектовано', legendKey: 'drafting', colSpan: 1, textHex: '#1F1F1F' },
  { label: 'Набирается заготовка', legendKey: 'stock', colSpan: 1, textHex: '#1F1F1F' },
  { label: 'Промежуточная шлифовка', legendKey: 'stock', colSpan: 1, textHex: '#1F1F1F' },
  { label: 'Собирается', legendKey: 'assembly', colSpan: 1, textHex: '#1F1F1F' },
  { label: 'Шлифуется', legendKey: 'assembly', colSpan: 1, textHex: '#1F1F1F' },
  { label: 'Красится', legendKey: 'paint', colSpan: 1, textHex: '#000000' },
  { label: 'Сборка после покраски', legendKey: 'postpaint', colSpan: 1, textHex: '#000000' },
  { label: 'Контроль качества', legendKey: 'postpaint', colSpan: 1, textHex: '#000000' },
  { label: 'Доставка/Монтаж', legendKey: 'ready', colSpan: 1, textHex: '#000000' },
  { label: 'Готово', legendKey: 'ready', colSpan: 1, textHex: '#000000' },
];

function normalizeStage(source = {}, fallback) {
  const key = String(fallback?.key || source?.key || '').trim();
  return {
    key,
    storeName: String(fallback?.storeName || source?.storeName || '').trim(),
    label: String(source?.label ?? fallback?.label ?? '').trim(),
    description: String(source?.description ?? fallback?.description ?? '').trim(),
    defaultHex: String(fallback?.defaultHex || source?.defaultHex || '#FFFFFF').trim() || '#FFFFFF',
  };
}

function normalizeSecondaryHeader(source = {}, fallback = {}) {
  const nextLegendKey = String(source?.legendKey ?? fallback?.legendKey ?? '').trim();
  return {
    label: String(source?.label ?? fallback?.label ?? '').trim(),
    legendKey: nextLegendKey,
    colSpan: Number(fallback?.colSpan) || 1,
    textHex: String(fallback?.textHex || '#000000').trim() || '#000000',
    stickyCol: String(fallback?.stickyCol || '').trim(),
    useTableBackground: Boolean(fallback?.useTableBackground),
    noWrap: Boolean(fallback?.noWrap),
  };
}

function normalizeOrderStageLegendConfig(source = {}) {
  const sourceStages = Array.isArray(source?.stages) ? source.stages : [];
  const sourceHeaders = Array.isArray(source?.secondaryHeaders) ? source.secondaryHeaders : [];

  const stages = DEFAULT_ORDER_STAGE_LEGEND.map((fallbackStage) => {
    const matched = sourceStages.find((item) => String(item?.key || '').trim() === fallbackStage.key) || {};
    return normalizeStage(matched, fallbackStage);
  });

  const validLegendKeys = new Set(stages.map((item) => item.key));

  const secondaryHeaders = DEFAULT_ORDER_STAGE_SECONDARY_HEADERS.map((fallbackHeader, index) => {
    const matched = sourceHeaders[index] || {};
    const nextHeader = normalizeSecondaryHeader(matched, fallbackHeader);
    if (nextHeader.legendKey && !validLegendKeys.has(nextHeader.legendKey)) {
      nextHeader.legendKey = fallbackHeader.legendKey || '';
    }
    return nextHeader;
  });

  return { stages, secondaryHeaders };
}

function getDefaultOrderStageLegendConfig() {
  return normalizeOrderStageLegendConfig({});
}

module.exports = {
  DEFAULT_ORDER_STAGE_LEGEND,
  DEFAULT_ORDER_STAGE_SECONDARY_HEADERS,
  getDefaultOrderStageLegendConfig,
  normalizeOrderStageLegendConfig,
};
