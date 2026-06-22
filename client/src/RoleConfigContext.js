import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, parseJsonSafely } from './api';
import { buildRoleTabs, getDefaultRoleLabels, getRoleMeta, getDefaultRoles } from './roleConfig';

const RoleConfigContext = createContext({
  roleTabs: buildRoleTabs(),
  allRoleTabs: buildRoleTabs(),
  roleLabels: getDefaultRoleLabels(),
  getRoleLabel: (role) => role,
  getRoleShortLabel: (role) => role,
  getRoleMetaByKey: () => null,
  refreshRoleConfig: async () => [],
});

export function RoleConfigProvider({ children }) {
  const [roles, setRoles] = useState(getDefaultRoles());

  const refreshRoleConfig = async (options = {}) => {
    const includeDeleted = options.includeDeleted === true;
    try {
      const res = await apiFetch('/api/roles?includeDeleted=1');
      const data = await parseJsonSafely(res);
      if (!res.ok || !Array.isArray(data)) {
        throw new Error('Не удалось загрузить роли');
      }
      setRoles(data);
      const nextTabs = buildRoleTabs(data);
      return includeDeleted ? nextTabs : nextTabs.filter(role => !role.isDeleted);
    } catch {
      const fallbackRoles = getDefaultRoles();
      setRoles(fallbackRoles);
      const fallbackTabs = buildRoleTabs(fallbackRoles);
      return includeDeleted ? fallbackTabs : fallbackTabs.filter(role => !role.isDeleted);
    }
  };

  useEffect(() => {
    refreshRoleConfig();
  }, []);

  const value = useMemo(() => {
    const allRoleTabs = buildRoleTabs(roles);
    const roleTabs = allRoleTabs.filter(role => !role.isDeleted);
    const roleLabels = roleTabs.reduce((acc, role) => {
      acc[role.key] = role.plainLabel;
      return acc;
    }, {});
    return {
      roleTabs,
      allRoleTabs,
      roleLabels,
      getRoleLabel: (role) => getRoleMeta(allRoleTabs, role)?.label || role,
      getRoleShortLabel: (role) => getRoleMeta(allRoleTabs, role)?.plainLabel || role,
      getRoleMetaByKey: (role) => getRoleMeta(allRoleTabs, role) || null,
      refreshRoleConfig,
    };
  }, [roles]);

  return (
    <RoleConfigContext.Provider value={value}>
      {children}
    </RoleConfigContext.Provider>
  );
}

export function useRoleConfig() {
  return useContext(RoleConfigContext);
}
