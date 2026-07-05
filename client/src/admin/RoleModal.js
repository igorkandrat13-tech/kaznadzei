import React from 'react';
import { Button, Modal, ModalHeader } from '../ui';

function RoleModal({
  mode,
  roleForm,
  setRoleForm,
  columnOptions = [],
  onAdd,
  onUpdate,
  onClose,
  saving = false,
}) {
  if (!mode) return null;

  const isEdit = mode === 'edit';

  return (
    <Modal open={Boolean(mode)} onClose={onClose} closeDisabled={saving} size="lg">
      <ModalHeader
        title={isEdit ? 'Редактировать роль' : 'Добавить роль'}
        subtitle="Настройка роли, которая используется в этапах, сотрудниках и рабочих разделах."
        onClose={onClose}
        closeDisabled={saving}
      />

      <div className="modal-form-grid modal-form-grid-two">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Название роли</label>
          <input
            value={roleForm?.label || ''}
            onChange={event => setRoleForm({ ...roleForm, label: event.target.value })}
            placeholder="Например: Фрезеровщик"
            disabled={saving}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Иконка</label>
          <input
            value={roleForm?.icon || ''}
            onChange={event => setRoleForm({ ...roleForm, icon: event.target.value })}
            placeholder="Например: 🪚"
            disabled={saving}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Заголовок страницы</label>
          <input
            value={roleForm?.shortTitle || ''}
            onChange={event => setRoleForm({ ...roleForm, shortTitle: event.target.value })}
            placeholder="Например: Цех фрезеровки"
            disabled={saving}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Текст без этапов</label>
          <input
            value={roleForm?.noStepsText || ''}
            onChange={event => setRoleForm({ ...roleForm, noStepsText: event.target.value })}
            placeholder="Например: Нет настроенных этапов для роли"
            disabled={saving}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Описание</label>
        <textarea
          value={roleForm?.description || ''}
          onChange={event => setRoleForm({ ...roleForm, description: event.target.value })}
          placeholder="Краткое описание работы роли"
          disabled={saving}
          rows={3}
        />
      </div>

      <div className="form-group">
        <label>Доступ к колонкам для цветовых отметок</label>
        <div className="role-columns-picker">
          {columnOptions.map((column) => {
            const checked = Array.isArray(roleForm?.allowedColumns) && roleForm.allowedColumns.includes(column.key);
            return (
              <label key={column.key} className="role-columns-picker-item">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={saving}
                  onChange={(event) => {
                    const currentColumns = Array.isArray(roleForm?.allowedColumns) ? roleForm.allowedColumns : [];
                    setRoleForm({
                      ...roleForm,
                      allowedColumns: event.target.checked
                        ? [...currentColumns, column.key]
                        : currentColumns.filter((value) => value !== column.key),
                    });
                  }}
                />
                <span className="role-columns-picker-body">
                  <span className="role-columns-picker-title">{column.label}</span>
                  <span className="role-columns-picker-description">{column.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="modal-actions">
        <Button variant="success" onClick={isEdit ? onUpdate : onAdd} disabled={saving}>
          {saving ? (isEdit ? 'Сохранение...' : 'Добавление...') : (isEdit ? 'Сохранить роль' : 'Добавить роль')}
        </Button>
        <Button onClick={onClose} disabled={saving}>Отмена</Button>
      </div>
    </Modal>
  );
}

export default RoleModal;
