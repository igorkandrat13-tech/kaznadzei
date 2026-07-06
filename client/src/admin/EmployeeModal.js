import React, { useMemo } from 'react';
import { generatePinCode } from '../adminUI';
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

function EmployeeModal({
  mode,
  employeeForm,
  setEmployeeForm,
  onAdd,
  onUpdate,
  onClose,
  saving = false,
  columnOptions = [],
}) {
  if (!mode) return null;

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
        title={mode === 'edit' ? 'Редактировать сотрудника' : 'Добавить сотрудника'}
        subtitle="Параметры входа в Telegram-бот, должность и закрепленные производственные колонки."
        onClose={onClose}
        closeDisabled={saving}
      />

      <div className="form-group">
        <label>ФИО</label>
        <input
          value={employeeForm?.fullName || ''}
          onChange={e => setEmployeeForm({ ...employeeForm, fullName: e.target.value })}
          placeholder="Например: Иванов Иван Иванович"
          disabled={saving}
        />
      </div>

      <div className="form-group">
        <label>Должность</label>
        <input
          value={employeeForm?.role || ''}
          onChange={e => setEmployeeForm({ ...employeeForm, role: e.target.value })}
          placeholder="Например: Столяр, Маляр, Технолог"
          disabled={saving}
        />
        <div className="text-small text-subtle" style={{ marginTop: 6 }}>
          Должность вводится вручную. Если сотрудник работает с QR-этапами, указывайте понятное рабочее название без выпадающего списка.
        </div>
      </div>

      <div className="form-group">
        <label>Telegram username</label>
        <input
          value={employeeForm?.telegramUsername || ''}
          onChange={e => setEmployeeForm({ ...employeeForm, telegramUsername: e.target.value })}
          placeholder="@username"
          disabled={saving}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
          <label>PIN-код</label>
          <div className="modal-actions-group">
            <input
              value={employeeForm?.pinCode || ''}
              onChange={e => setEmployeeForm({ ...employeeForm, pinCode: e.target.value })}
              placeholder="Код для Telegram-бота"
              disabled={saving}
            />
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => setEmployeeForm({ ...employeeForm, pinCode: generatePinCode() })}
            >
              Сгенерировать
            </Button>
          </div>
      </div>

      <div className="form-group">
        <label>Колонки, за которые отвечает сотрудник</label>
        <div className="role-columns-picker">
          {decoratedColumnOptions.map((column) => {
            const checked = Array.isArray(employeeForm?.allowedColumns) && employeeForm.allowedColumns.includes(column.key);
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
                    const currentColumns = Array.isArray(employeeForm?.allowedColumns) ? employeeForm.allowedColumns : [];
                    setEmployeeForm({
                      ...employeeForm,
                      allowedColumns: event.target.checked
                        ? [...currentColumns, column.key]
                        : currentColumns.filter((value) => value !== column.key),
                    });
                  }}
                />
                <span className="role-columns-picker-body">
                  <span className="role-columns-picker-title" style={{ color: column.textColor }}>{column.label}</span>
                  {column.description ? (
                    <span className="role-columns-picker-description" style={{ color: column.descriptionColor }}>{column.description}</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="modal-actions">
        <Button variant="success" onClick={mode === 'edit' ? onUpdate : onAdd} disabled={saving}>
          {saving ? (mode === 'edit' ? 'Сохранение...' : 'Добавление...') : (mode === 'edit' ? 'Сохранить сотрудника' : 'Добавить сотрудника')}
        </Button>
        <Button onClick={onClose} disabled={saving}>Отмена</Button>
      </div>
    </Modal>
  );
}

export default EmployeeModal;
