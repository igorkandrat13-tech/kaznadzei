import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal, ModalHeader } from '../ui';
import PasswordField from '../PasswordField';
import PasswordGeneratorModal from '../PasswordGeneratorModal';

const USERNAME_REGEX = /^[A-Za-z0-9._-]+$/;

function UserModal({
  open,
  mode = 'create',
  initialUser,
  roles = [],
  employees = [],
  onClose,
  onSubmit,
  submitting = false,
}) {
  const isEdit = mode === 'edit';
  const isSystem = Boolean(initialUser?.isSystem);

  const [username, setUsername] = useState('');
  const [roleId, setRoleId] = useState('');
  const [roleSearch, setRoleSearch] = useState('');
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  const [localError, setLocalError] = useState('');
  const [genModalOpen, setGenModalOpen] = useState(false);
  const [genTarget, setGenTarget] = useState('both');
  const roleAnchorRef = useRef(null);
  const empAnchorRef = useRef(null);

  useEffect(() => {
    if (open) {
      setUsername(initialUser?.username || '');
      setRoleId(initialUser?.roleId || '');
      setRoleSearch('');
      setRoleDropdownOpen(false);
      setPassword('');
      setPasswordConfirm('');
      setEmployeeId(initialUser?.employeeId || '');
      setEmployeeSearch('');
      setEmployeeDropdownOpen(false);
      setLocalError('');
    }
  }, [open, initialUser]);

  useEffect(() => {
    if (!open || !roleDropdownOpen) return undefined;
    const handler = (e) => {
      if (!roleAnchorRef.current) return;
      if (!roleAnchorRef.current.contains(e.target)) setRoleDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, roleDropdownOpen]);

  useEffect(() => {
    if (!open || !employeeDropdownOpen) return undefined;
    const handler = (e) => {
      if (!empAnchorRef.current) return;
      if (!empAnchorRef.current.contains(e.target)) setEmployeeDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, employeeDropdownOpen]);

  const filteredRoles = useMemo(() => {
    const q = String(roleSearch || '').trim().toLowerCase();
    const list = Array.isArray(roles) ? roles : [];
    if (!q) return list;
    return list.filter(r => String(r?.name || '').toLowerCase().includes(q));
  }, [roles, roleSearch]);

  const selectedRole = useMemo(() => {
    if (!roleId) return null;
    return (Array.isArray(roles) ? roles : []).find(r => String(r._id) === String(roleId)) || null;
  }, [roles, roleId]);

  const filteredEmployees = useMemo(() => {
    const q = String(employeeSearch || '').trim().toLowerCase();
    const list = Array.isArray(employees) ? employees : [];
    if (!q) return list;
    return list.filter((e) => {
      const hay = [
        e.fullName, e.name, e.lastName, e.firstName, e.middleName, e.position, e.id, e._id,
      ].map(v => String(v || '').toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }, [employees, employeeSearch]);

  const selectedEmployee = useMemo(() => {
    if (!employeeId) return null;
    return (Array.isArray(employees) ? employees : []).find(e => String(e._id) === String(employeeId)) || null;
  }, [employees, employeeId]);

  const handleRequestGenerate = (target) => {
    setGenTarget(target || 'both');
    setGenModalOpen(true);
  };

  const handleAcceptGenerated = (pw) => {
    if (!pw) return;
    if (genTarget === 'password') {
      setPassword(pw);
    } else if (genTarget === 'confirm') {
      setPasswordConfirm(pw);
    } else {
      setPassword(pw);
      setPasswordConfirm(pw);
    }
  };

  const validateLocal = () => {
    setLocalError('');
    const uname = String(username || '').trim();
    if (!uname) {
      setLocalError('Введите имя пользователя.');
      return false;
    }
    if (uname.length < 3 || uname.length > 40) {
      setLocalError('Имя пользователя: от 3 до 40 символов.');
      return false;
    }
    if (!USERNAME_REGEX.test(uname)) {
      setLocalError('Имя пользователя: только латинские буквы, цифры, точки, дефисы и подчёркивания.');
      return false;
    }
    if (!roleId) {
      setLocalError('Выберите права (роль) пользователя.');
      return false;
    }
    const role = roles.find(r => String(r._id) === String(roleId));
    if (isSystem && role && !role.isSystem) {
      setLocalError('Системный пользователь должен оставаться с правом "Полные права".');
      return false;
    }

    if (isEdit) {
      const hasPw = Boolean(password || passwordConfirm);
      if (hasPw) {
        if (password.length < 4) {
          setLocalError('Пароль должен содержать минимум 4 символа.');
          return false;
        }
        if (password !== passwordConfirm) {
          setLocalError('Пароли не совпадают.');
          return false;
        }
      }
    } else {
      if (!password || password.length < 4) {
        setLocalError('Пароль должен содержать минимум 4 символа.');
        return false;
      }
      if (password !== passwordConfirm) {
        setLocalError('Пароли не совпадают.');
        return false;
      }
    }

    if (employeeId) {
      const emp = (Array.isArray(employees) ? employees : []).find(e => String(e._id) === String(employeeId));
      if (!emp) {
        setLocalError('Выбранный сотрудник не найден.');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = () => {
    if (!validateLocal()) return;
    const payload = {
      username: String(username).trim(),
      roleId: String(roleId),
      employeeId: employeeId ? String(employeeId) : null,
    };
    if (!isEdit || password || passwordConfirm) {
      payload.password = password;
      payload.passwordConfirm = passwordConfirm;
    }
    onSubmit && onSubmit(payload);
  };

  return (
    <Modal open={open} onClose={onClose} size="md" className="user-modal">
      <ModalHeader
        title={isEdit ? `✎ ${isSystem ? 'Системный пользователь' : 'Редактировать пользователя'}` : '👤 Добавить пользователя'}
        subtitle={isSystem
          ? 'Имя пользователя и роль "Полные права" нельзя изменить. Можно сменить пароль и привязку к сотруднику.'
          : 'Задайте логин, пароль, выберите права и привяжите сотрудника (опционально).'}
        onClose={onClose}
        closeDisabled={submitting}
      />
      <div style={{ padding: '0 20px 12px' }}>
        {localError ? (
          <div className="settings-alert settings-alert-error mb-16">{localError}</div>
        ) : null}

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Имя пользователя</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Например: ivanov_i или Director"
            disabled={submitting || isSystem}
            maxLength={40}
          />
        </div>

        <div ref={roleAnchorRef} className="form-group" style={{ marginBottom: 12 }}>
          <label>Права</label>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn"
              style={{
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
              }}
              onClick={() => setRoleDropdownOpen(v => !v)}
              disabled={submitting || (isSystem && roles.every(r => !r.isSystem))}
            >
              <span style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0,
              }}>
                {selectedRole ? (
                  <>
                    <strong style={{ fontSize: 14 }}>{selectedRole.name}</strong>
                    {selectedRole.isSystem ? (
                      <span style={{
                        fontSize: 12,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: '#fde68a',
                        color: '#92400e',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}>Системная</span>
                    ) : null}
                    <span style={{ fontSize: 12, opacity: 0.7, flexShrink: 0 }}>
                      ({selectedRole.pagesCount ?? Object.values(selectedRole.pages || {}).filter(Boolean).length} / 8 стр.)
                    </span>
                  </>
                ) : (
                  <span style={{ opacity: 0.75 }}>Выберите право (роль)...</span>
                )}
              </span>
              <span aria-hidden="true" style={{ flexShrink: 0 }}>
                {roleDropdownOpen ? '▴' : '▾'}
              </span>
            </button>
            {roleDropdownOpen ? (
              <div
                className="settings-dropdown-panel user-role-dropdown"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 60,
                  maxHeight: 340,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  borderRadius: 10,
                  boxShadow: '0 10px 24px rgba(2,6,23,0.18)',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div style={{
                  padding: 10,
                  borderBottom: '1px solid #eef2f7',
                  position: 'sticky',
                  top: 0,
                  background: '#ffffff',
                  zIndex: 1,
                }}>
                  <input
                    type="text"
                    value={roleSearch}
                    onChange={(e) => setRoleSearch(e.target.value)}
                    placeholder="Поиск права..."
                    style={{ marginBottom: 0 }}
                  />
                </div>
                <div style={{ padding: 6 }}>
                  {filteredRoles.length === 0 ? (
                    <div style={{ padding: 10, opacity: 0.65, fontSize: 13 }}>
                      {roles.length === 0
                        ? 'Пока нет ни одного права. Создайте право во вкладке "Права доступа".'
                        : 'Права не найдены по поиску.'}
                    </div>
                  ) : filteredRoles.map(role => {
                    const checked = String(role._id) === String(roleId);
                    const disabled = submitting || (isSystem && !role.isSystem);
                    const pagesCount = role.pagesCount ?? Object.values(role.pages || {}).filter(Boolean).length;
                    return (
                      <label
                        key={role._id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          gap: 10,
                          padding: '9px 10px',
                          cursor: disabled ? 'default' : 'pointer',
                          borderRadius: 8,
                          userSelect: 'none',
                          background: checked ? '#eff6ff' : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!disabled && !checked) e.currentTarget.style.background = '#f3f7ff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = checked ? '#eff6ff' : 'transparent';
                        }}
                      >
                        <input
                          type="radio"
                          name="user-role"
                          value={role._id}
                          checked={checked}
                          onChange={() => {
                            setRoleId(String(role._id));
                            if (!submitting) {
                              setRoleDropdownOpen(false);
                              setRoleSearch('');
                            }
                          }}
                          disabled={disabled}
                          style={{ flexShrink: 0, width: 18, height: 18 }}
                        />
                        <div style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            minWidth: 0,
                            flex: 1,
                          }}>
                            <span style={{
                              fontSize: 14,
                              color: '#0f172a',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}>
                              {role.name}
                            </span>
                            {role.isSystem ? (
                              <span style={{
                                fontSize: 12,
                                padding: '2px 8px',
                                borderRadius: 999,
                                background: '#fde68a',
                                color: '#92400e',
                                fontWeight: 700,
                                flexShrink: 0,
                              }}>Системная</span>
                            ) : null}
                          </div>
                          <span style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: '#475569',
                            flexShrink: 0,
                          }}>
                            {pagesCount} / 8
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <PasswordField
          label={isEdit ? 'Пароль (заполните, чтобы сменить)' : 'Пароль'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isEdit ? 'Оставьте пустым, чтобы не менять' : 'Минимум 4 символа'}
          disabled={submitting}
          allowGenerate
          allowCopy
          onRequestGenerate={() => handleRequestGenerate('password')}
        />
        <PasswordField
          label="Подтвердите пароль"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          placeholder="Повторите пароль"
          disabled={submitting}
          allowGenerate={password && false}
          allowCopy
          onRequestGenerate={() => handleRequestGenerate('confirm')}
        />
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: -4, marginBottom: 8 }}>
          {isEdit ? 'Чтобы сменить пароль — заполните оба поля одинаковым значением.' : null}
        </div>

        <div ref={empAnchorRef} className="form-group" style={{ marginBottom: 8 }}>
          <label>Привязка к сотруднику <span style={{ opacity: 0.6 }}>(опционально)</span></label>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
              <button
                type="button"
                className="btn"
                style={{
                  flex: 1,
                  textAlign: 'left',
                  justifyContent: 'space-between',
                  display: 'flex',
                  alignItems: 'center',
                }}
                onClick={() => setEmployeeDropdownOpen(v => !v)}
                disabled={submitting}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedEmployee
                    ? (selectedEmployee.fullName || selectedEmployee.name || `${selectedEmployee.lastName || ''} ${selectedEmployee.firstName || ''}`.trim() || 'Сотрудник')
                    : 'Не привязан'}
                </span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {selectedEmployee ? (
                    <span
                      role="button"
                      title="Очистить"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (submitting) return;
                        setEmployeeId('');
                        setEmployeeSearch('');
                      }}
                      style={{
                        opacity: 0.7,
                        cursor: 'pointer',
                        padding: '0 4px',
                        color: '#b91c1c',
                      }}
                    >
                      ✕
                    </span>
                  ) : null}
                  <span aria-hidden="true">{employeeDropdownOpen ? '▴' : '▾'}</span>
                </span>
              </button>
            </div>
            {employeeDropdownOpen ? (
              <div
                className="settings-dropdown-panel"
                style={{
                  position: 'absolute', left: 0, right: 0,
                  top: 'calc(100% + 6px)', zIndex: 40,
                  maxHeight: 260, overflow: 'auto',
                }}
              >
                <div style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                  <input
                    type="text"
                    placeholder="Поиск по ФИО/должности..."
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    style={{ marginBottom: 0 }}
                    autoFocus
                  />
                </div>
                <div style={{ padding: 4 }}>
                  {filteredEmployees.length === 0 ? (
                    <div style={{ padding: 10, opacity: 0.65, fontSize: 13 }}>Сотрудники не найдены</div>
                  ) : filteredEmployees.map(emp => {
                    const isSel = String(emp._id) === String(employeeId);
                    const label = emp.fullName || emp.name || [emp.lastName, emp.firstName, emp.middleName].filter(Boolean).join(' ') || 'Без имени';
                    const sub = [emp.position, String(emp.pinCode || '')].filter(Boolean).join(' · ');
                    return (
                      <div
                        key={emp._id}
                        onClick={() => { if (!submitting) { setEmployeeId(String(emp._id)); setEmployeeDropdownOpen(false); setEmployeeSearch(''); } }}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 6,
                          cursor: submitting ? 'default' : 'pointer',
                          background: isSel ? '#eff6ff' : 'transparent',
                        }}
                        onMouseEnter={(e) => { if (!submitting && !isSel) e.currentTarget.style.background = '#f9fafb'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = isSel ? '#eff6ff' : 'transparent'; }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
                        {sub ? <div style={{ fontSize: 12, opacity: 0.7 }}>{sub}</div> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="modal-actions">
        <Button onClick={onClose} disabled={submitting}>Отмена</Button>
        <Button variant="success" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Сохранение...' : (isEdit ? 'Сохранить' : 'Добавить пользователя')}
        </Button>
      </div>

      <PasswordGeneratorModal
        open={genModalOpen}
        onClose={() => setGenModalOpen(false)}
        onAccept={handleAcceptGenerated}
        defaultLength={12}
      />
    </Modal>
  );
}

export default UserModal;
