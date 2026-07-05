import { DEFAULT_ROLE_ALLOWED_COLUMNS, normalizeAllowedColumns } from './roleColumnAccess';

export const BASE_ROLE_DEFINITIONS = [
  {
    key: 'carpenter',
    icon: '🪚',
    defaultLabel: 'Столяр',
    shortTitle: 'Столярный цех',
    description: 'Раскрой древесины, фрезеровка и шлифовка деталей',
    noStepsText: 'Нет настроенных этапов для столяра',
    order: 1,
    allowedColumns: DEFAULT_ROLE_ALLOWED_COLUMNS,
  },
  {
    key: 'assembler',
    icon: '🔧',
    defaultLabel: 'Комплектовщик',
    shortTitle: 'Сборочный цех',
    description: 'Сборка изделий, установка фурнитуры и упаковка',
    noStepsText: 'Нет настроенных этапов для комплектовщика',
    order: 2,
    allowedColumns: DEFAULT_ROLE_ALLOWED_COLUMNS,
  },
  {
    key: 'painter',
    icon: '🎨',
    defaultLabel: 'Маляр',
    shortTitle: 'Малярный цех',
    description: 'Покраска и финишная обработка изделий',
    noStepsText: 'Нет настроенных этапов для маляра',
    order: 3,
    allowedColumns: DEFAULT_ROLE_ALLOWED_COLUMNS,
  },
  {
    key: 'designer',
    icon: '📐',
    defaultLabel: 'Дизайнер',
    shortTitle: 'Дизайнерский отдел',
    description: 'Разработка дизайна, чертежей и спецификаций',
    noStepsText: 'Нет настроенных этапов для дизайнера',
    order: 4,
    allowedColumns: DEFAULT_ROLE_ALLOWED_COLUMNS,
  },
];

export function getDefaultRoles() {
  return BASE_ROLE_DEFINITIONS.map(role => ({
    key: role.key,
    label: role.defaultLabel,
    icon: role.icon,
    shortTitle: role.shortTitle,
    description: role.description,
    noStepsText: role.noStepsText,
    order: role.order,
    isDeleted: false,
  }));
}

export function getDefaultRoleLabels() {
  return getDefaultRoles().reduce((acc, role) => {
    acc[role.key] = role.label;
    return acc;
  }, {});
}

export function normalizeRoles(source = []) {
  const fallbackByKey = BASE_ROLE_DEFINITIONS.reduce((acc, role) => {
    acc[role.key] = role;
    return acc;
  }, {});
  const initial = Array.isArray(source) && source.length > 0 ? source : getDefaultRoles();
  return initial
    .map((role, index) => {
      const fallback = fallbackByKey[role?.key] || {};
      const plainLabel = String(role?.label || fallback.defaultLabel || '').trim();
      if (!plainLabel) return null;
      const icon = String(role?.icon || fallback.icon || '🧩').trim() || '🧩';
      return {
        ...fallback,
        ...role,
        key: String(role?.key || fallback.key || '').trim(),
        icon,
        plainLabel,
        label: `${icon} ${plainLabel}`,
        shortTitle: String(role?.shortTitle || fallback.shortTitle || plainLabel).trim() || plainLabel,
        description: String(role?.description || fallback.description || '').trim(),
        noStepsText: String(role?.noStepsText || fallback.noStepsText || `Нет настроенных этапов для роли "${plainLabel}"`).trim(),
        allowedColumns: normalizeAllowedColumns(role?.allowedColumns ?? fallback.allowedColumns),
        order: Number.isFinite(Number(role?.order)) ? Number(role.order) : (fallback.order || index + 1),
        route: `/role/${String(role?.key || fallback.key || '').trim()}`,
        isDeleted: role?.isDeleted === true,
      };
    })
    .filter(Boolean)
    .filter(role => role.key)
    .sort((a, b) => a.order - b.order || a.plainLabel.localeCompare(b.plainLabel, 'ru'));
}

export function buildRoleTabs(roles = []) {
  return normalizeRoles(roles);
}

export function getRoleMeta(roleTabs, roleKey) {
  return roleTabs.find(role => role.key === roleKey) || null;
}
