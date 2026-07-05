import React, { useMemo } from 'react';
import { Button, Modal, ModalHeader } from '../ui';

function hexToRgb(hex) {
  const normalized = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function getReadableTextColor(backgroundHex) {
  const rgb = hexToRgb(backgroundHex);
  if (!rgb) return '#173857';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.62 ? '#173857' : '#F7FBFF';
}

function toRgba(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(23, 56, 87, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

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
  const decoratedColumnOptions = useMemo(() => {
    return columnOptions.map((column) => {
      const previewColor = column.previewColor || '#DCEBFA';
      const textColor = getReadableTextColor(previewColor);
      return {
        ...column,
        previewColor,
        textColor,
        descriptionColor: toRgba(textColor, 0.78),
        borderColor: toRgba(textColor, 0.18),
        shadowColor: toRgba(textColor, 0.12),
      };
    });
  }, [columnOptions]);

  return (
    <Modal open={Boolean(mode)} onClose={onClose} closeDisabled={saving} size="lg">
      <ModalHeader
        title={isEdit ? 'Редактировать роль' : 'Добавить роль'}
        subtitle="Настройка роли для сотрудников, рабочих разделов и доступа к цветовым отметкам."
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
          {decoratedColumnOptions.map((column) => {
            const checked = Array.isArray(roleForm?.allowedColumns) && roleForm.allowedColumns.includes(column.key);
            return (
              <label
                key={column.key}
                className={`role-columns-picker-item ${checked ? 'role-columns-picker-item-selected' : ''}`}
                style={{
                  background: column.previewColor,
                  color: column.textColor,
                  borderColor: column.borderColor,
                  boxShadow: checked ? `0 12px 24px ${column.shadowColor}` : `0 6px 16px ${column.shadowColor}`,
                }}
              >
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
                  <span className="role-columns-picker-title" style={{ color: column.textColor }}>{column.label}</span>
                  <span className="role-columns-picker-description" style={{ color: column.descriptionColor }}>{column.description}</span>
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
