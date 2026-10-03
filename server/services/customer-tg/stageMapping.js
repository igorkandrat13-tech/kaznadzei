const { orderStageLegendConfig } = require('../../config/orderStageLegendConfig');

const ORDER_PRIMARY_HEADERS = [
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

const ORDER_COLUMN_KEY_TO_PRIMARY_INDEX = {
  orderNumber: ORDER_PRIMARY_HEADERS.indexOf('Номер заказа'),
  customer: ORDER_PRIMARY_HEADERS.indexOf('Заказчик'),
  room: ORDER_PRIMARY_HEADERS.indexOf('Помещение'),
  roomNumber: ORDER_PRIMARY_HEADERS.indexOf('№ помещения'),
  itemNumber: ORDER_PRIMARY_HEADERS.indexOf('№ изделия в заказе'),
  quantity: ORDER_PRIMARY_HEADERS.indexOf('Кол-во изделй'),
  name: ORDER_PRIMARY_HEADERS.indexOf('Наименование'),
  orderCard: ORDER_PRIMARY_HEADERS.indexOf('Карточка заказа'),
  packageName: ORDER_PRIMARY_HEADERS.indexOf('Комплектация заказа'),
  notes: ORDER_PRIMARY_HEADERS.indexOf('Примечания'),
  brief: ORDER_PRIMARY_HEADERS.indexOf('Помещение'),
  drafting: ORDER_PRIMARY_HEADERS.indexOf('Наименование'),
  approved: ORDER_PRIMARY_HEADERS.indexOf('Карточка заказа'),
  scheduled: ORDER_PRIMARY_HEADERS.indexOf('Карточка заказа'),
  kitting: ORDER_PRIMARY_HEADERS.indexOf('Комплектация заказа'),
  stock: ORDER_PRIMARY_HEADERS.indexOf(''),
  preAssembly: ORDER_PRIMARY_HEADERS.indexOf(''),
  intermediateSanding: ORDER_PRIMARY_HEADERS.indexOf('Отгрузка до'),
  assembly: ORDER_PRIMARY_HEADERS.indexOf('СТОЛЯР'),
  sanding: ORDER_PRIMARY_HEADERS.indexOf('Заявки на расходники'),
  paint: ORDER_PRIMARY_HEADERS.indexOf('Покраска'),
  postPaint: ORDER_PRIMARY_HEADERS.indexOf('Начало изготовления изделия'),
  postpaint: ORDER_PRIMARY_HEADERS.indexOf('Начало изготовления изделия'),
  qualityControl: ORDER_PRIMARY_HEADERS.indexOf('Окончание изготовления изделия'),
  qc: ORDER_PRIMARY_HEADERS.indexOf('Окончание изготовления изделия'),
  logistics: ORDER_PRIMARY_HEADERS.indexOf('Время изготовления изделий'),
  orderReady: ORDER_PRIMARY_HEADERS.indexOf('Время изготовления заказа'),
  ready: ORDER_PRIMARY_HEADERS.indexOf('Время изготовления заказа'),
  carpenter: ORDER_PRIMARY_HEADERS.indexOf('СТОЛЯР'),
  materialRequests: ORDER_PRIMARY_HEADERS.indexOf('Заявки на расходники'),
  deliveryDate: ORDER_PRIMARY_HEADERS.indexOf('Отгрузка до'),
  duration: ORDER_PRIMARY_HEADERS.indexOf('Время изготовления заказа'),
  itemStartDate: ORDER_PRIMARY_HEADERS.indexOf('Начало изготовления изделия'),
  itemEndDate: ORDER_PRIMARY_HEADERS.indexOf('Окончание изготовления изделия'),
  itemDuration: ORDER_PRIMARY_HEADERS.indexOf('Время изготовления изделий'),
  startDate: ORDER_PRIMARY_HEADERS.indexOf('Отгрузка до'),
};

const PRIMARY_INDEX_TO_ORDER_COLUMN_KEY = Object.entries(ORDER_COLUMN_KEY_TO_PRIMARY_INDEX).reduce((acc, [columnKey, index]) => {
  if (Number.isInteger(index)) acc[index] = columnKey;
  return acc;
}, {});

const ORDER_MANUFACTURING_REQUIRED_COLUMN_KEYS = [
  'room', 'roomNumber', 'itemNumber', 'quantity', 'name', 'orderCard', 'packageName', 'notes', 'deliveryDate', 'carpenter', 'materialRequests', 'paint',
];

const ORDER_TRACKED_PRIMARY_START_INDEX = ORDER_COLUMN_KEY_TO_PRIMARY_INDEX.room;
const ORDER_TRACKED_PRIMARY_END_INDEX = ORDER_COLUMN_KEY_TO_PRIMARY_INDEX.duration;

const LEGACY_ORDER_COLUMN_KEY_MAP = {
  photoLink: 'materialRequests',
};

function normalizeOrderColumnKey(columnKey = '') {
  const normalized = String(columnKey || '').trim();
  return LEGACY_ORDER_COLUMN_KEY_MAP[normalized] || normalized;
}

function getSecondaryHeadersFromConfig() {
  let config = (orderStageLegendConfig && typeof orderStageLegendConfig === 'object') ? orderStageLegendConfig : {};
  let configured = Array.isArray(config.secondaryHeaders) ? config.secondaryHeaders : null;
  if (configured && configured.length) return configured.slice();
  const SettingsStore = require('../../stores/settingsStore');
  const { getDefaultOrderStageLegendConfig } = require('../../config/orderStageLegendConfig');
  try {
    let settingsCfg = null;
    try {
      const fullSettings = (SettingsStore && typeof SettingsStore.getWithSecrets === 'function') ? SettingsStore.getWithSecrets() : (SettingsStore && typeof SettingsStore.get === 'function' ? SettingsStore.get() : null);
      if (fullSettings && fullSettings.orderStageLegendConfig && typeof fullSettings.orderStageLegendConfig === 'object') settingsCfg = fullSettings.orderStageLegendConfig;
    } catch (_err) {
      settingsCfg = null;
    }
    if (!settingsCfg || !Array.isArray(settingsCfg.secondaryHeaders) || !settingsCfg.secondaryHeaders.length) {
      settingsCfg = (typeof getDefaultOrderStageLegendConfig === 'function') ? getDefaultOrderStageLegendConfig() || {} : {};
    }
    if (settingsCfg && Array.isArray(settingsCfg.secondaryHeaders) && settingsCfg.secondaryHeaders.length) return settingsCfg.secondaryHeaders.slice();
  } catch (_err) {
    // ignore
  }
  return [];
}

function getTrackedSecondaryHeaderCells() {
  const secondaryHeaders = getSecondaryHeadersFromConfig();
  const cells = [];
  let cursor = 0;
  const start = Number.isInteger(ORDER_TRACKED_PRIMARY_START_INDEX) ? ORDER_TRACKED_PRIMARY_START_INDEX : 0;
  const end = Number.isInteger(ORDER_TRACKED_PRIMARY_END_INDEX) ? ORDER_TRACKED_PRIMARY_END_INDEX : (ORDER_PRIMARY_HEADERS.length - 1);
  for (let i = 0; i < secondaryHeaders.length; i += 1) {
    const header = secondaryHeaders[i] || {};
    const colSpan = Number(header.colSpan) > 0 ? Number(header.colSpan) : 1;
    const startIndex = cursor;
    const endIndex = cursor + colSpan - 1;
    cursor += colSpan;
    const primaryIndexes = [];
    for (let pi = startIndex; pi <= endIndex; pi += 1) {
      if (pi >= start && pi <= end) primaryIndexes.push(pi);
    }
    if (!primaryIndexes.length) continue;
    const sticky = Boolean(header.isSticky || header.sticky);
    if (sticky) continue;
    const label = String(header.label || header.text || header.name || '').trim();
    const legendKey = String(header.legendKey || header.key || '').trim() || (label ? label.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '') : '');
    cells.push({
      ...header,
      label,
      legendKey,
      startIndex,
      endIndex,
      primaryIndexes,
    });
  }
  return cells;
}

function getSecondaryHeaderForPrimaryColumn(columnIndex = -1, secondaryHeaders = []) {
  const list = Array.isArray(secondaryHeaders) && secondaryHeaders.length ? secondaryHeaders : getSecondaryHeadersFromConfig();
  let cursor = 0;
  for (let i = 0; i < list.length; i += 1) {
    const header = list[i] || {};
    const colSpan = Number(header.colSpan) > 0 ? Number(header.colSpan) : 1;
    const startIndex = cursor;
    const endIndex = cursor + colSpan - 1;
    cursor += colSpan;
    if (columnIndex >= startIndex && columnIndex <= endIndex) {
      return { ...header, startIndex, endIndex, index: i };
    }
  }
  return null;
}

module.exports = {
  ORDER_PRIMARY_HEADERS,
  ORDER_COLUMN_KEY_TO_PRIMARY_INDEX,
  PRIMARY_INDEX_TO_ORDER_COLUMN_KEY,
  ORDER_MANUFACTURING_REQUIRED_COLUMN_KEYS,
  ORDER_TRACKED_PRIMARY_START_INDEX,
  ORDER_TRACKED_PRIMARY_END_INDEX,
  LEGACY_ORDER_COLUMN_KEY_MAP,
  normalizeOrderColumnKey,
  getTrackedSecondaryHeaderCells,
  getSecondaryHeaderForPrimaryColumn,
};
