const SettingsStore = require('../stores/settingsStore');
const UserStore = require('../stores/userStore');
const PermissionRoleStore = require('../stores/permissionRoleStore');

const SYSTEM_ROLE_NAME = 'Полные права';
const SYSTEM_USERNAME = 'Administrator';

function buildAllPagesTrue() {
  const pages = {};
  for (const key of PermissionRoleStore.PAGE_KEYS) {
    pages[key] = true;
  }
  return pages;
}

function ensureSystemFullAccessRole() {
  let role = PermissionRoleStore.findByName(SYSTEM_ROLE_NAME);
  if (!role) {
    role = PermissionRoleStore.create({
      name: SYSTEM_ROLE_NAME,
      isSystem: true,
      pages: buildAllPagesTrue(),
    });
    console.log(`[bootAuthSync] Created system role: ${SYSTEM_ROLE_NAME}`);
    return { role, created: true };
  }
  if (!role.isSystem) {
    role = PermissionRoleStore.update(role._id, { isSystem: true, pages: buildAllPagesTrue() });
    console.log(`[bootAuthSync] Updated existing role "${SYSTEM_ROLE_NAME}" → system`);
  }
  const expectedPages = buildAllPagesTrue();
  const currentPages = PermissionRoleStore.normalizePages(role.pages);
  const pagesOk = PermissionRoleStore.PAGE_KEYS.every(k => currentPages[k] === expectedPages[k]);
  if (!pagesOk) {
    role = PermissionRoleStore.update(role._id, { pages: expectedPages });
    console.log(`[bootAuthSync] Restored system role pages → all true`);
  }
  return { role, created: false };
}

function ensureDefaultWorkerRole() {
  const name = 'Рабочий';
  let role = PermissionRoleStore.findByName(name);
  if (role) return { role, created: false };
  role = PermissionRoleStore.create({
    name,
    isSystem: false,
    pages: {
      orders: true,
      requests: true,
      archive: false,
      customers: false,
      employees: false,
      stages: false,
      users: false,
      settings: false,
    },
  });
  console.log(`[bootAuthSync] Created default role: ${name}`);
  return { role, created: true };
}

function ensureAdministratorUserFromAdminPasswordHash(systemRoleId) {
  const authCfg = SettingsStore.getAuthConfig();
  let adminUser = UserStore.findByUsername(SYSTEM_USERNAME);
  if (!adminUser) {
    if (!authCfg.adminPasswordHash) {
      return { user: null, created: false, reason: 'no-password-hash' };
    }
    adminUser = UserStore.create({
      username: SYSTEM_USERNAME,
      passwordHash: authCfg.adminPasswordHash,
      employeeId: null,
      roleId: String(systemRoleId),
      isSystem: true,
    });
    console.log(`[bootAuthSync] Created system user: ${SYSTEM_USERNAME} (from settings.adminPasswordHash)`);
    return { user: adminUser, created: true };
  }
  let needUpdate = false;
  const patch = {};
  if (!adminUser.isSystem) {
    patch.isSystem = true;
    needUpdate = true;
  }
  if (String(adminUser.roleId || '') !== String(systemRoleId)) {
    patch.roleId = String(systemRoleId);
    needUpdate = true;
  }
  if (needUpdate) {
    adminUser = UserStore.update(adminUser._id, patch);
    console.log(`[bootAuthSync] Enforced system invariants for user ${SYSTEM_USERNAME}`);
  }
  return { user: adminUser, created: false };
}

function syncAdministratorPasswordHashBiDirection(adminUserId) {
  if (!adminUserId) return { synced: false };
  const authCfg = SettingsStore.getAuthConfig();
  const adminUser = UserStore.findById(adminUserId);
  if (!adminUser) return { synced: false };
  const userHash = String(adminUser.passwordHash || '').trim();
  const settingsHash = String(authCfg.adminPasswordHash || '').trim();
  if (userHash && !settingsHash) {
    SettingsStore.updateAuthConfig({ adminPasswordHash: userHash });
    console.log(`[bootAuthSync] synced Administrator hash → settings.adminPasswordHash`);
    return { synced: true, direction: 'user→settings' };
  }
  if (!userHash && settingsHash) {
    UserStore.update(adminUser._id, { passwordHash: settingsHash });
    console.log(`[bootAuthSync] synced settings.adminPasswordHash → Administrator passwordHash`);
    return { synced: true, direction: 'settings→user' };
  }
  if (userHash && settingsHash && userHash !== settingsHash) {
    UserStore.update(adminUser._id, { passwordHash: settingsHash });
    console.log(`[bootAuthSync] hash diverged → user Administrator updated from settings.adminPasswordHash`);
    return { synced: true, direction: 'settings→user(winner)' };
  }
  return { synced: false };
}

function runAllBootSync() {
  try {
    const { role } = ensureSystemFullAccessRole();
    ensureDefaultWorkerRole();
    const adminResult = ensureAdministratorUserFromAdminPasswordHash(role._id);
    if (adminResult.user) {
      syncAdministratorPasswordHashBiDirection(adminResult.user._id);
    }
    return { ok: true, systemRole: role, adminUser: adminResult.user };
  } catch (error) {
    console.error(`[bootAuthSync] FAILED:`, error && error.message ? error.message : error);
    throw error;
  }
}

function syncAdminUserPasswordOnChange(adminUserId, newHash) {
  if (!adminUserId || !newHash) return;
  const authCfg = SettingsStore.getAuthConfig();
  if (String(authCfg.adminPasswordHash || '').trim() !== String(newHash || '').trim()) {
    SettingsStore.updateAuthConfig({ adminPasswordHash: String(newHash) });
  }
}

module.exports = {
  SYSTEM_ROLE_NAME,
  SYSTEM_USERNAME,
  buildAllPagesTrue,
  ensureSystemFullAccessRole,
  ensureDefaultWorkerRole,
  ensureAdministratorUserFromAdminPasswordHash,
  syncAdministratorPasswordHashBiDirection,
  runAllBootSync,
  syncAdminUserPasswordOnChange,
};
