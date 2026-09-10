export const DEFAULT_ORDER_PRIMARY_HEADERS = [
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
  '',
  'Отгрузка до',
  'СТОЛЯР',
  'Заявки на расходники',
  'Покраска',
  'Начало изготовления изделия',
  'Окончание изготовления изделия',
  'Время изготовления изделий',
  'Время изготовления заказа',
];

export const DEFAULT_ORDER_STAGE_LEGEND = [
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
    defaultHex: '#9BC5A7',
  },
  {
    key: 'approved',
    storeName: 'Легенда этапов: утверждено',
    label: 'Утверждено',
    description: 'Утверждено заказчиком',
    defaultHex: '#A8D7B6',
  },
  {
    key: 'kitting',
    storeName: 'Легенда этапов: комплектация',
    label: 'Комплектация',
    description: 'Укомплектовано, сборка комплектующих',
    defaultHex: '#DFC590',
  },
  {
    key: 'stock',
    storeName: 'Легенда этапов: заготовка',
    label: 'Заготовка',
    description: 'Набирается заготовка, Предварительная сборка, Промежуточная шлифовка',
    defaultHex: '#9EB4F5',
  },
  {
    key: 'assembly',
    storeName: 'Легенда этапов: сборка',
    label: 'Сборка',
    description: 'Собирается, Шлифуется, контроль сборочных операций',
    defaultHex: '#9EB4F5',
  },
  {
    key: 'paint',
    storeName: 'Легенда этапов: покраска',
    label: 'Покраска',
    description: 'Красится, грунт, ЛКМ, малярные работы',
    defaultHex: '#D3A6D5',
  },
  {
    key: 'postpaint',
    storeName: 'Легенда этапов: после покраски',
    label: 'После покраски',
    description: 'Сборка после покраски, фурнитура',
    defaultHex: '#C198C3',
  },
  {
    key: 'qc',
    storeName: 'Легенда этапов: контроль качества',
    label: 'ОТК',
    description: 'Контроль качества, финальная проверка',
    defaultHex: '#B49BCA',
  },
  {
    key: 'logistics',
    storeName: 'Легенда этапов: доставка',
    label: 'Доставка',
    description: 'Доставка/Монтаж, передача заказчику',
    defaultHex: '#7CA287',
  },
  {
    key: 'ready',
    storeName: 'Легенда этапов: готово',
    label: 'Готово',
    description: 'Заказ готов, закрыт, архив',
    defaultHex: '#61896D',
  },
];

export const DEFAULT_ORDER_STAGE_SECONDARY_HEADERS = [
  { label: '', legendKey: '', colSpan: 1, textHex: '#000000', stickyCol: 'sticky-col-1', hex: '' },
  { label: 'Заказ не обработан', legendKey: 'unprocessed', colSpan: 1, textHex: '#000000', stickyCol: 'sticky-col-2', useTableBackground: true, hex: '' },
  { label: 'ТЗ от заказчика', legendKey: 'brief', colSpan: 1, textHex: '#000000', hex: '#D3EAD9' },
  { label: 'ТЗ для чертежей', legendKey: 'brief', colSpan: 2, textHex: '#000000', hex: '#D3EAD9' },
  { label: 'Начерчен', legendKey: 'drafting', colSpan: 1, textHex: '#1F1F1F', noWrap: true, hex: '#A8D7B6' },
  { label: 'Утверждено заказчиком', legendKey: 'approved', colSpan: 1, textHex: '#1F1F1F', hex: '#A8D7B6' },
  { label: 'Расписан', legendKey: 'drafting', colSpan: 1, textHex: '#1F1F1F', hex: '#9BC5A7' },
  { label: 'Укомплектовано', legendKey: 'kitting', colSpan: 1, textHex: '#1F1F1F', hex: '#DFC590' },
  { label: 'Набирается заготовка', legendKey: 'stock', colSpan: 1, textHex: '#1F1F1F', hex: '#9EB4F5' },
  { label: 'Предварительная сборка', legendKey: 'stock', colSpan: 1, textHex: '#1F1F1F', hex: '#9EB4F5' },
  { label: 'Промежуточная шлифовка', legendKey: 'stock', colSpan: 1, textHex: '#1F1F1F', hex: '#9EB4F5' },
  { label: 'Собирается', legendKey: 'assembly', colSpan: 1, textHex: '#1F1F1F', hex: '#9EB4F5' },
  { label: 'Шлифуется', legendKey: 'assembly', colSpan: 1, textHex: '#1F1F1F', hex: '#9EB4F5' },
  { label: 'Красится', legendKey: 'paint', colSpan: 1, textHex: '#000000', hex: '#D3A6D5' },
  { label: 'Сборка после покраски', legendKey: 'postpaint', colSpan: 1, textHex: '#000000', hex: '#C198C3' },
  { label: 'Контроль качества', legendKey: 'qc', colSpan: 1, textHex: '#000000', hex: '#B49BCA' },
  { label: 'Доставка/Монтаж', legendKey: 'logistics', colSpan: 1, textHex: '#000000', hex: '#7CA287' },
  { label: 'Заказ готов', legendKey: 'ready', colSpan: 1, textHex: '#000000', hex: '#61896D' },
];

function normalizeStage(source = {}, fallback = {}) {
  return {
    key: String(fallback.key || source.key || '').trim(),
    storeName: String(fallback.storeName || source.storeName || '').trim(),
    label: String(source.label ?? fallback.label ?? '').trim(),
    description: String(source.description ?? fallback.description ?? '').trim(),
    defaultHex: String(source.defaultHex ?? fallback.defaultHex ?? '#FFFFFF').trim() || '#FFFFFF',
  };
}

function normalizeSecondaryHeader(source = {}, fallback = {}, stageColorMap = {}) {
  const nextLegendKey = String(source.legendKey ?? fallback.legendKey ?? '').trim();
  const fallbackHex = fallback.useTableBackground
    ? ''
    : (stageColorMap[nextLegendKey] || fallback.hex || '');
  return {
    label: String(source.label ?? fallback.label ?? '').trim(),
    legendKey: nextLegendKey,
    colSpan: Number(fallback.colSpan) || 1,
    hex: String(source.hex ?? fallbackHex).trim(),
    textHex: String(fallback.textHex || '#000000').trim() || '#000000',
    stickyCol: String(fallback.stickyCol || '').trim(),
    useTableBackground: Boolean(fallback.useTableBackground),
    noWrap: Boolean(fallback.noWrap),
  };
}

export function buildOrderStageLegendConfig(source = {}) {
  const sourceStages = Array.isArray(source?.stages) ? source.stages : [];
  const sourceHeaders = Array.isArray(source?.secondaryHeaders) ? source.secondaryHeaders : [];
  const sourcePrimaryHeaders = Array.isArray(source?.primaryHeaders) ? source.primaryHeaders : [];

  const buildNormalizedPrimaryHeaders = () => {
    if (!Array.isArray(sourcePrimaryHeaders) || sourcePrimaryHeaders.length === 0) {
      return DEFAULT_ORDER_PRIMARY_HEADERS.map((x) => String(x ?? '').trim());
    }
    const saved = sourcePrimaryHeaders.map((item) => String(item ?? '').trim());
    const fallback = DEFAULT_ORDER_PRIMARY_HEADERS.map((x) => String(x ?? '').trim());
    const notesIndexDefault = fallback.indexOf('Примечания');
    const notesIndexSaved = saved.indexOf('Примечания');
    const deliveryIndexDefault = fallback.indexOf('Отгрузка до');
    const deliveryIndexSaved = saved.indexOf('Отгрузка до');
    const result = saved.slice();
    if (
      notesIndexDefault >= 0 && notesIndexSaved >= 0
      && deliveryIndexDefault >= 0 && deliveryIndexSaved >= 0
      && (deliveryIndexDefault - notesIndexDefault) > 1
      && (deliveryIndexSaved - notesIndexSaved) === 1
    ) {
      let insertAt = notesIndexSaved + 1;
      const extras = fallback.slice(notesIndexDefault + 1, deliveryIndexDefault);
      extras.forEach((label) => {
        const alreadyAtInsert = String(result[insertAt] || '').trim();
        if (alreadyAtInsert === label) {
          insertAt += 1;
          return;
        }
        result.splice(insertAt, 0, label);
        insertAt += 1;
      });
    }
    while (result.length < fallback.length) {
      result.push(fallback[result.length]);
    }
    return fallback.map((fbLabel, idx) => {
      const savedLabel = String(result[idx] ?? '').trim();
      return (savedLabel === '' && fbLabel) ? fbLabel : (savedLabel || fbLabel || '');
    });
  };

  const primaryHeaders = buildNormalizedPrimaryHeaders();

  const stages = DEFAULT_ORDER_STAGE_LEGEND.map((fallbackStage) => {
    const matched = sourceStages.find((item) => String(item?.key || '').trim() === fallbackStage.key) || {};
    return normalizeStage(matched, fallbackStage);
  });

  const validLegendKeys = new Set(stages.map((item) => item.key));
  const stageColorMap = stages.reduce((acc, item) => {
    acc[item.key] = item.defaultHex || '#FFFFFF';
    return acc;
  }, {});

  const buildNormalizedSecondaryHeaders = () => {
    const fallback = DEFAULT_ORDER_STAGE_SECONDARY_HEADERS.map((item) => ({ ...item }));
    const labelsFallback = fallback.map((item) => String(item.label ?? '').trim());
    const saved = Array.isArray(sourceHeaders) && sourceHeaders.length ? sourceHeaders.slice() : [];
    const labelsSaved = saved.map((item) => String(item?.label ?? '').trim());
    const stockDefault = labelsFallback.indexOf('Набирается заготовка');
    const polishDefault = labelsFallback.indexOf('Промежуточная шлифовка');
    const stockSaved = labelsSaved.indexOf('Набирается заготовка');
    const polishSaved = labelsSaved.indexOf('Промежуточная шлифовка');
    if (
      stockDefault >= 0 && polishDefault >= 0 && stockSaved >= 0 && polishSaved >= 0
      && (polishDefault - stockDefault) > 1
      && (polishSaved - stockSaved) === 1
    ) {
      let insertAt = stockSaved + 1;
      const extras = fallback.slice(stockDefault + 1, polishDefault);
      const leftNeighbor = saved[stockSaved] || {};
      const leftStyle = {
        legendKey: leftNeighbor.legendKey || 'stock',
        hex: leftNeighbor.hex || '#99E5FF',
        textHex: leftNeighbor.textHex || undefined,
        colSpan: leftNeighbor.colSpan || 1,
        useTableBackground: Boolean(leftNeighbor.useTableBackground),
        stickyCol: leftNeighbor.stickyCol || '',
        noWrap: Boolean(leftNeighbor.noWrap),
      };
      extras.forEach((item) => {
        const alreadyLabel = String(saved[insertAt]?.label || '').trim();
        if (alreadyLabel === String(item.label || '').trim()) {
          insertAt += 1;
          return;
        }
        saved.splice(insertAt, 0, {
          label: item.label,
          legendKey: leftStyle.legendKey,
          hex: leftStyle.hex,
          textHex: leftStyle.textHex,
          colSpan: leftStyle.colSpan,
          useTableBackground: leftStyle.useTableBackground,
          stickyCol: leftStyle.stickyCol,
          noWrap: leftStyle.noWrap,
        });
        insertAt += 1;
      });
    }
    while (saved.length < fallback.length) {
      saved.push(fallback[saved.length]);
    }
    const buildFallbacksForLabel = (label) => {
      const idx = labelsFallback.indexOf(String(label || '').trim());
      if (idx >= 0) {
        const item = fallback[idx];
        return { item, idx };
      }
      const matchedFuzzy = fallback.find(
        (fb) => String(fb.label ?? '').trim() === String(label ?? '').trim(),
      );
      if (matchedFuzzy) {
        return { item: matchedFuzzy, idx: fallback.indexOf(matchedFuzzy) };
      }
      return { item: null, idx: -1 };
    };
    const fallbackDraftedIdx = fallback.findIndex((h) => String(h.label || '').trim() === 'Начерчен');
    const fallbackApprovedIdx = fallback.findIndex((h) => String(h.label || '').trim() === 'Утверждено заказчиком');
    const fallbackPlannedIdx = fallback.findIndex((h) => String(h.label || '').trim() === 'Расписан');
    const savedDraftedIdxRaw = saved.findIndex((s) => String(s?.label || '').trim() === 'Начерчен');
    const savedApprovedIdxRaw = saved.findIndex((s) => String(s?.label || '').trim() === 'Утверждено заказчиком');
    const savedPlannedIdxRaw = saved.findIndex((s) => String(s?.label || '').trim() === 'Расписан');
    const expectedCorrectOrder =
      fallbackDraftedIdx >= 0 &&
      fallbackApprovedIdx >= 0 &&
      fallbackPlannedIdx >= 0 &&
      fallbackDraftedIdx < fallbackApprovedIdx &&
      fallbackApprovedIdx < fallbackPlannedIdx;
    const hasAllSaved =
      savedDraftedIdxRaw >= 0 && savedApprovedIdxRaw >= 0 && savedPlannedIdxRaw >= 0;
    if (expectedCorrectOrder && hasAllSaved) {
      const sequenceIsCorrect = savedDraftedIdxRaw < savedApprovedIdxRaw && savedApprovedIdxRaw < savedPlannedIdxRaw;
      if (!sequenceIsCorrect) {
        const minIdx = Math.min(savedDraftedIdxRaw, savedApprovedIdxRaw, savedPlannedIdxRaw);
        const draftedEntry = saved[savedDraftedIdxRaw];
        const approvedEntry = saved[savedApprovedIdxRaw];
        const plannedEntry = saved[savedPlannedIdxRaw];
        const sortedUniqueIndices = [savedDraftedIdxRaw, savedApprovedIdxRaw, savedPlannedIdxRaw].sort((a, b) => a - b);
        const removeTheseAsc = sortedUniqueIndices.slice().reverse();
        for (const i of removeTheseAsc) {
          saved.splice(i, 1);
        }
        saved.splice(minIdx, 0, draftedEntry, approvedEntry, plannedEntry);
      }
    }
    const normalized = fallback.map((fbHeader, fbIndex) => {
      const savedObj = saved.find((s) => String(s?.label ?? '').trim() === String(fbHeader.label ?? '').trim());
      const matched = savedObj ? savedObj : (saved[fbIndex] && typeof saved[fbIndex] === 'object' ? saved[fbIndex] : {});
      const fbSource = !matched && !savedObj ? fbHeader : (buildFallbacksForLabel(matched?.label ?? fbHeader.label).item || fbHeader);
      const nextHeader = normalizeSecondaryHeader(matched, fbSource, stageColorMap);
      if (nextHeader.legendKey && !validLegendKeys.has(nextHeader.legendKey)) {
        nextHeader.legendKey = fbSource.legendKey || fbHeader.legendKey || '';
      }
      return nextHeader;
    });
    const preAssemblyIdx = normalized.findIndex((h) => /Предварительная/.test(String(h.label || '').trim()));
    if (preAssemblyIdx > 0) {
      const left = normalized[preAssemblyIdx - 1] || {};
      const target = normalized[preAssemblyIdx];
      target.legendKey = left.legendKey || target.legendKey || 'stock';
      target.hex = left.hex || target.hex || '#99E5FF';
      if (left.textHex) {
        target.textHex = left.textHex;
      }
      target.colSpan = left.colSpan || target.colSpan || 1;
      target.useTableBackground = Boolean(left.useTableBackground);
    }
    normalized.forEach((h) => {
      const label = String(h?.label || '').trim();
      if (label === 'Утверждено заказчиком') {
        h.hex = '#A8D7B6';
        h.legendKey = 'approved';
      } else if (label === 'Расписан') {
        h.hex = '#9BC5A7';
        h.legendKey = 'drafting';
      }
    });
    return normalized;
  };

  const secondaryHeaders = buildNormalizedSecondaryHeaders();
  return { primaryHeaders, stages, secondaryHeaders };
}

export const ORDER_PRIMARY_HEADERS = DEFAULT_ORDER_PRIMARY_HEADERS;
export const ORDER_STAGE_LEGEND = DEFAULT_ORDER_STAGE_LEGEND;
export const ORDER_STAGE_SECONDARY_HEADERS = DEFAULT_ORDER_STAGE_SECONDARY_HEADERS;
