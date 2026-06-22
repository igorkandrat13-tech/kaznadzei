const ROLE_DEFINITIONS = [
  {
    key: 'carpenter',
    icon: '🪚',
    defaultLabel: 'Столяр',
    shortTitle: 'Столярный цех',
    description: 'Раскрой древесины, фрезеровка и шлифовка деталей',
    noStepsText: 'Нет настроенных этапов для столяра',
    order: 1,
  },
  {
    key: 'assembler',
    icon: '🔧',
    defaultLabel: 'Комплектовщик',
    shortTitle: 'Сборочный цех',
    description: 'Сборка изделий, установка фурнитуры и упаковка',
    noStepsText: 'Нет настроенных этапов для комплектовщика',
    order: 2,
  },
  {
    key: 'painter',
    icon: '🎨',
    defaultLabel: 'Маляр',
    shortTitle: 'Малярный цех',
    description: 'Покраска и финишная обработка изделий',
    noStepsText: 'Нет настроенных этапов для маляра',
    order: 3,
  },
  {
    key: 'designer',
    icon: '📐',
    defaultLabel: 'Дизайнер',
    shortTitle: 'Дизайнерский отдел',
    description: 'Разработка дизайна, чертежей и спецификаций',
    noStepsText: 'Нет настроенных этапов для дизайнера',
    order: 4,
  },
];

const CYRILLIC_MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function transliterate(value = '') {
  return String(value || '')
    .toLowerCase()
    .split('')
    .map(char => CYRILLIC_MAP[char] ?? char)
    .join('');
}

function createRoleKey(label, existingKeys = []) {
  const base = transliterate(label)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'role';
  let nextKey = base;
  let counter = 2;
  while (existingKeys.includes(nextKey)) {
    nextKey = `${base}-${counter}`;
    counter += 1;
  }
  return nextKey;
}

function getDefaultRoles() {
  return ROLE_DEFINITIONS.map(role => ({
    key: role.key,
    label: role.defaultLabel,
    icon: role.icon,
    shortTitle: role.shortTitle,
    description: role.description,
    noStepsText: role.noStepsText,
    order: role.order,
    isDeleted: false,
    createdAt: '',
    updatedAt: '',
  }));
}

function normalizeRole(rawRole = {}, options = {}) {
  const fallback = ROLE_DEFINITIONS.find(role => role.key === rawRole?.key) || {};
  const label = String(rawRole?.label || fallback.defaultLabel || '').trim();
  const key = String(rawRole?.key || '').trim();
  const icon = String(rawRole?.icon || fallback.icon || '🧩').trim() || '🧩';
  const shortTitle = String(rawRole?.shortTitle || fallback.shortTitle || label).trim() || label;
  const description = String(rawRole?.description || fallback.description || '').trim();
  const noStepsText = String(rawRole?.noStepsText || fallback.noStepsText || `Нет настроенных этапов для роли "${label}"`).trim();

  return {
    key,
    label,
    icon,
    shortTitle,
    description,
    noStepsText,
    order: Number.isFinite(Number(rawRole?.order)) ? Number(rawRole.order) : (fallback.order || options.defaultOrder || 1),
    isDeleted: rawRole?.isDeleted === true,
    createdAt: String(rawRole?.createdAt || '').trim(),
    updatedAt: String(rawRole?.updatedAt || '').trim(),
  };
}

function normalizeRoles(source = [], options = {}) {
  const initial = Array.isArray(source) && source.length > 0 ? source : getDefaultRoles();
  return initial
    .map((role, index) => normalizeRole(role, { defaultOrder: index + 1, ...options }))
    .filter(role => role.key && role.label)
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'ru'));
}

function getDefaultRoleLabels() {
  return getDefaultRoles().reduce((acc, role) => {
    acc[role.key] = role.label;
    return acc;
  }, {});
}

function normalizeRoleLabels(source = {}) {
  const defaults = getDefaultRoleLabels();
  const labels = {};
  for (const role of getDefaultRoles()) {
    const value = typeof source?.[role.key] === 'string' ? source[role.key].trim() : '';
    labels[role.key] = value || defaults[role.key];
  }
  return labels;
}

function getRoleDefinitions(source = {}) {
  if (Array.isArray(source)) {
    return normalizeRoles(source);
  }
  if (Array.isArray(source?.roles)) {
    return normalizeRoles(source.roles);
  }
  const labels = normalizeRoleLabels(source?.roleLabels || source || {});
  return getDefaultRoles().map(role => ({
    ...role,
    label: labels[role.key] || role.label,
  }));
}

function getRoleLabel(role, source = {}) {
  const definitions = getRoleDefinitions(source);
  return definitions.find(item => item.key === role)?.label || role;
}

module.exports = {
  ROLE_DEFINITIONS,
  createRoleKey,
  getDefaultRoleLabels,
  getDefaultRoles,
  getRoleDefinitions,
  getRoleLabel,
  normalizeRole,
  normalizeRoleLabels,
  normalizeRoles,
};
