import React from 'react';
import { generatePinCode } from '../adminUI';
import { Button, Modal, ModalHeader } from '../ui';

function EmployeeModal({
  mode,
  employeeForm,
  setEmployeeForm,
  onAdd,
  onUpdate,
  onClose,
  saving = false,
  roleTabs = [],
}) {
  if (!mode) return null;

  return (
    <Modal open={Boolean(mode)} onClose={onClose} closeDisabled={saving} size="lg">
      <ModalHeader
        title={mode === 'edit' ? 'Редактировать сотрудника' : 'Добавить сотрудника'}
        subtitle="Параметры входа в Telegram-бот и роль сотрудника в производстве."
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
        <select
          value={employeeForm?.role || roleTabs[0]?.key || ''}
          onChange={e => setEmployeeForm({ ...employeeForm, role: e.target.value })}
          disabled={saving}
        >
          {roleTabs.length === 0 ? (
            <option value="">Нет доступных ролей</option>
          ) : null}
          {roleTabs.map(role => (
            <option key={role.key} value={role.key}>
              {role.label}{role.isDeleted ? ' (удалена)' : ''}
            </option>
          ))}
        </select>
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
