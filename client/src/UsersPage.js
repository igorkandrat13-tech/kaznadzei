import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, parseJsonSafely, toUserErrorMessage } from './api';
import { canAccessPage } from './appAuth';
import ConfirmDialog from './ConfirmDialog';
import UserModal from './admin/UserModal';
import RoleModal from './admin/RoleModal';

function SectionHeader({ title, description, actions }) {
  return (
    <div className="section-header" style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 12,
      marginBottom: 16,
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
        {description ? <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.75 }}>{description}</p> : null}
      </div>
      <div className="section-header-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {actions || null}
      </div>
    </div>
  );
}

function getFullName(emp) {
  if (!emp) return '';
  if (emp.fullName) return emp.fullName;
  if (emp.name) return emp.name;
  return [emp.lastName, emp.firstName, emp.middleName].filter(Boolean).join(' ');
}

function UsersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'roles' ? 'roles' : 'users';
  const [activeTab, setActiveTab] = useState(initialTab);

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const [userModal, setUserModal] = useState({ open: false, mode: 'create', initialUser: null });
  const [roleModal, setRoleModal] = useState({ open: false, mode: 'create', initialRole: null });
  const [submitting, setSubmitting] = useState(false);
  const [roleSubmitting, setRoleSubmitting] = useState(false);

  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null);
  const [confirmDeleteRole, setConfirmDeleteRole] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState({ user: false, role: false });

  useEffect(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', activeTab);
      return next;
    }, { replace: true });
  }, [activeTab, setSearchParams]);

  const showFeedback = (type, message) => {
    setFeedback({ type: type || 'info', message: message || '' });
    if (message) {
      window.setTimeout(() => setFeedback(curr => (curr.message === message ? { type: '', message: '' } : curr)), 4200);
    }
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [u, r, e] = await Promise.all([
        apiFetch('/api/users').then(async (res) => {
          const data = await parseJsonSafely(res);
          if (!res.ok) throw new Error(data?.message || 'Не удалось загрузить пользователей.');
          return Array.isArray(data?.users) ? data.users : [];
        }),
        apiFetch('/api/roles').then(async (res) => {
          const data = await parseJsonSafely(res);
          if (!res.ok) throw new Error(data?.message || 'Не удалось загрузить права.');
          return Array.isArray(data?.roles) ? data.roles : [];
        }),
        apiFetch('/api/employees').then(async (res) => {
          if (!res.ok) return [];
          const data = await parseJsonSafely(res);
          if (Array.isArray(data)) return data;
          if (Array.isArray(data?.employees)) return data.employees;
          return [];
        }).catch(() => []),
      ]);
      setUsers(u);
      setRoles(r);
      setEmployees(e);
    } catch (err) {
      showFeedback('error', toUserErrorMessage(err, 'Не удалось загрузить данные.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const canGoSettings = canAccessPage('settings');

  // --- Users handlers ---
  const openCreateUser = () => {
    setUserModal({ open: true, mode: 'create', initialUser: null });
  };
  const openEditUser = (user) => {
    setUserModal({ open: true, mode: 'edit', initialUser: user || null });
  };
  const closeUserModal = () => setUserModal({ open: false, mode: 'create', initialUser: null });

  const submitUser = async (payload) => {
    if (!payload) return;
    setSubmitting(true);
    try {
      const url = userModal.mode === 'edit' && userModal.initialUser?._id
        ? `/api/users/${userModal.initialUser._id}`
        : '/api/users';
      const method = userModal.mode === 'edit' ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) throw new Error(data?.message || (userModal.mode === 'edit' ? 'Не удалось обновить пользователя.' : 'Не удалось создать пользователя.'));
      closeUserModal();
      await loadAll();
      showFeedback('success', userModal.mode === 'edit' ? 'Пользователь обновлен.' : 'Пользователь добавлен.');
    } catch (err) {
      showFeedback('error', toUserErrorMessage(err, 'Не удалось сохранить пользователя.'));
    } finally {
      setSubmitting(false);
    }
  };

  const askDeleteUser = (user) => {
    if (!user) return;
    if (user.isSystem) {
      showFeedback('error', 'Невозможно удалить системного пользователя.');
      return;
    }
    setConfirmDeleteUser(user);
  };

  const executeDeleteUser = async () => {
    if (!confirmDeleteUser) return;
    setDeleteLoading(prev => ({ ...prev, user: true }));
    try {
      const res = await apiFetch(`/api/users/${confirmDeleteUser._id}`, { method: 'DELETE' });
      if (res.status === 204 || res.ok) {
        setConfirmDeleteUser(null);
        await loadAll();
        showFeedback('success', 'Пользователь удален.');
      } else {
        const data = await parseJsonSafely(res);
        throw new Error(data?.message || 'Не удалось удалить пользователя.');
      }
    } catch (err) {
      showFeedback('error', toUserErrorMessage(err, 'Не удалось удалить пользователя.'));
    } finally {
      setDeleteLoading(prev => ({ ...prev, user: false }));
    }
  };

  // --- Roles handlers ---
  const openCreateRole = () => setRoleModal({ open: true, mode: 'create', initialRole: null });
  const openEditRole = (role) => {
    setRoleModal({ open: true, mode: 'edit', initialRole: role || null });
  };
  const closeRoleModal = () => setRoleModal({ open: false, mode: 'create', initialRole: null });

  const submitRole = async (payload) => {
    if (!payload) return;
    setRoleSubmitting(true);
    try {
      const url = roleModal.mode === 'edit' && roleModal.initialRole?._id
        ? `/api/roles/${roleModal.initialRole._id}`
        : '/api/roles';
      const method = roleModal.mode === 'edit' ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) throw new Error(data?.message || (roleModal.mode === 'edit' ? 'Не удалось обновить право.' : 'Не удалось создать право.'));
      closeRoleModal();
      await loadAll();
      showFeedback('success', roleModal.mode === 'edit' ? 'Право обновлено.' : 'Право добавлено.');
    } catch (err) {
      showFeedback('error', toUserErrorMessage(err, 'Не удалось сохранить право.'));
    } finally {
      setRoleSubmitting(false);
    }
  };

  const askDeleteRole = (role) => {
    if (!role) return;
    if (role.isSystem) {
      showFeedback('error', 'Невозможно удалить системное право.');
      return;
    }
    setConfirmDeleteRole(role);
  };

  const executeDeleteRole = async () => {
    if (!confirmDeleteRole) return;
    setDeleteLoading(prev => ({ ...prev, role: true }));
    try {
      const res = await apiFetch(`/api/roles/${confirmDeleteRole._id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await parseJsonSafely(res).catch(() => ({}));
        const affected = Number(data?.affectedUsersCount || 0);
        setConfirmDeleteRole(null);
        await loadAll();
        showFeedback(
          'success',
          affected > 0
            ? `Право удалено. Отвязано пользователей: ${affected}.`
            : 'Право удалено.',
        );
      } else {
        const data = await parseJsonSafely(res);
        throw new Error(data?.message || 'Не удалось удалить право.');
      }
    } catch (err) {
      showFeedback('error', toUserErrorMessage(err, 'Не удалось удалить право.'));
    } finally {
      setDeleteLoading(prev => ({ ...prev, role: false }));
    }
  };

  // --- Tabs UI ---
  return (
    <div className="page-shell settings-wrapper" style={{ paddingTop: 16 }}>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link to={canGoSettings ? '/settings' : '/orders'} className="btn btn-secondary" style={{ padding: '6px 12px' }}>
          ← Назад
        </Link>
        <h1 style={{ margin: 0, fontSize: 22 }}>Пользователи и права доступа</h1>
      </div>

      <div className="tabs settings-tabs" style={{ marginBottom: 16 }}>
        <button
          className={`tab ${activeTab === 'users' ? 'tab tab-active' : ''}`}
          type="button"
          onClick={() => setActiveTab('users')}
        >
          Пользователи
        </button>
        <button
          className={`tab ${activeTab === 'roles' ? 'tab tab-active' : ''}`}
          type="button"
          onClick={() => setActiveTab('roles')}
        >
          Права доступа
        </button>
      </div>

      {feedback.message ? (
        <div className={`settings-alert ${feedback.type === 'error' ? 'settings-alert-error' : 'settings-alert-success'} mb-16`}>
          {feedback.message}
        </div>
      ) : null}

      {loading ? (
        <div className="card" style={{ padding: 20, opacity: 0.7 }}>Загрузка данных...</div>
      ) : activeTab === 'users' ? (
        <>
          <SectionHeader
            title="Пользователи"
            description="Учетные записи для входа в систему. Каждый пользователь связан с одним набором прав (ролью) и опционально с сотрудником."
            actions={[
              <button key="add-user" className="btn btn-success" type="button" onClick={openCreateUser}>
                + Добавить пользователя
              </button>,
            ]}
          />
          <div className="mobile-settings-list">
            {users.length === 0 ? (
              <div className="card" style={{ padding: 20, opacity: 0.7 }}>Пользователей пока нет.</div>
            ) : users.map(u => {
              const canDelete = !u.isSystem;
              return (
                <div key={u._id} className="mobile-settings-card" style={u.isSystem ? { borderLeft: '4px solid #f59e0b' } : {}}>
                  <div className="mobile-settings-card-header">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {u.username}
                        {u.isSystem ? <span style={{ fontSize: 12, color: '#92400e' }}>· Системный</span> : null}
                      </div>
                      <div className="mobile-settings-card-sub">
                        Сотрудник: {u.employeeName || '—'}
                      </div>
                      <div className="mobile-settings-card-sub">
                        Права: <strong>{u.roleName || '—'}</strong> {typeof u.pagesCount === 'number' ? `(${u.pagesCount}/8 стр.)` : ''}
                      </div>
                    </div>
                    <div className="section-header-actions" style={{ justifyContent: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <button
                        className="btn btn-ghost row-action-icon"
                        type="button"
                        onClick={() => openEditUser(u)}
                        title="Редактировать"
                      >
                        ✎
                      </button>
                      <button
                        className="btn btn-ghost row-action-icon"
                        type="button"
                        disabled={!canDelete}
                        title={canDelete ? 'Удалить' : 'Невозможно удалить системного пользователя'}
                        style={canDelete ? { color: '#b91c1c' } : { opacity: 0.45 }}
                        onClick={() => askDeleteUser(u)}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <SectionHeader
            title="Права доступа"
            description="Наборы разрешений по страницам системы. Одно право можно назначить нескольким пользователям. Системное право «Полные права» нельзя удалить или изменить."
            actions={[
              <button key="add-role" className="btn btn-success" type="button" onClick={openCreateRole}>
                + Добавить
              </button>,
            ]}
          />
          <div className="mobile-settings-list">
            {roles.length === 0 ? (
              <div className="card" style={{ padding: 20, opacity: 0.7 }}>Прав пока нет.</div>
            ) : roles.map(r => {
              const canEdit = !r.isSystem;
              const canDelete = !r.isSystem;
              const hasUsers = Number(r.usersCount || 0) > 0;
              return (
                <div key={r._id} className="mobile-settings-card" style={r.isSystem ? { borderLeft: '4px solid #f59e0b' } : {}}>
                  <div className="mobile-settings-card-header">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {r.name}
                        {r.isSystem ? <span style={{ fontSize: 12, color: '#92400e' }}>· Системная</span> : null}
                      </div>
                      <div className="mobile-settings-card-sub">Страниц: {r.pagesCount || 0} / 8</div>
                      <div className="mobile-settings-card-sub">Пользователей: {r.usersCount || 0}</div>
                    </div>
                    <div className="section-header-actions" style={{ justifyContent: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <button
                        className="btn btn-ghost row-action-icon"
                        type="button"
                        onClick={() => openEditRole(r)}
                        title={canEdit ? 'Редактировать' : 'Просмотр'}
                      >
                        {r.isSystem ? '👁' : '✎'}
                      </button>
                      <button
                        className="btn btn-ghost row-action-icon"
                        type="button"
                        disabled={!canDelete}
                        title={canDelete ? (hasUsers ? `Удалить (у права ${r.usersCount || 0} пользователей)` : 'Удалить') : 'Невозможно удалить системное право'}
                        style={canDelete ? { color: '#b91c1c' } : { opacity: 0.45 }}
                        onClick={() => askDeleteRole(r)}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <UserModal
        open={userModal.open}
        mode={userModal.mode}
        initialUser={userModal.initialUser}
        roles={roles}
        employees={employees}
        onClose={closeUserModal}
        onSubmit={submitUser}
        submitting={submitting}
      />

      <RoleModal
        open={roleModal.open}
        mode={roleModal.mode}
        initialRole={roleModal.initialRole}
        onClose={closeRoleModal}
        onSubmit={submitRole}
        submitting={roleSubmitting}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteUser)}
        title="Удалить пользователя?"
        message={confirmDeleteUser ? `Вы действительно хотите удалить пользователя ${confirmDeleteUser.username}? Это действие нельзя отменить.` : ''}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        loading={deleteLoading.user}
        onConfirm={executeDeleteUser}
        onCancel={() => setConfirmDeleteUser(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteRole)}
        title="Удалить право?"
        message={confirmDeleteRole
          ? (
            Number(confirmDeleteRole.usersCount || 0) > 0
              ? `Вы действительно хотите удалить право «${confirmDeleteRole.name}»?
У этого права ${confirmDeleteRole.usersCount} пользователей — они будут отвязаны от права и потеряют доступ до назначения нового набора прав. Действие нельзя отменить.`
              : `Вы действительно хотите удалить право «${confirmDeleteRole.name}»? Это действие нельзя отменить.`
          )
          : ''}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        loading={deleteLoading.role}
        onConfirm={executeDeleteRole}
        onCancel={() => setConfirmDeleteRole(null)}
      />
    </div>
  );
}

export default UsersPage;
