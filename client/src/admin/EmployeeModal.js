import React from 'react';
import { generatePassword, generatePinCode, roleTabs } from '../adminUI';

function EmployeeModal({
  mode,
  employeeForm,
  setEmployeeForm,
  onAdd,
  onUpdate,
  onClose,
}) {
  if (!mode) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window" style={{ maxWidth: 760 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{mode === 'edit' ? 'Редактировать сотрудника' : 'Добавить сотрудника'}</div>
            <div className="modal-subtitle">Параметры входа в Telegram-бот и роль сотрудника в производстве.</div>
          </div>
          <button className="btn" style={{ padding: '6px 10px' }} onClick={onClose}>✕</button>
        </div>

        <div className="form-group">
          <label>ФИО</label>
          <input
            value={employeeForm?.fullName || ''}
            onChange={e => setEmployeeForm({ ...employeeForm, fullName: e.target.value })}
            placeholder="Например: Иванов Иван Иванович"
          />
        </div>

        <div className="form-group">
          <label>Должность</label>
          <select
            value={employeeForm?.role || 'carpenter'}
            onChange={e => setEmployeeForm({ ...employeeForm, role: e.target.value })}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
          >
            {roleTabs.map(role => (
              <option key={role.key} value={role.key}>{role.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Telegram username</label>
          <input
            value={employeeForm?.telegramUsername || ''}
            onChange={e => setEmployeeForm({ ...employeeForm, telegramUsername: e.target.value })}
            placeholder="@username"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Пароль</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={employeeForm?.password || ''}
                onChange={e => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                placeholder="Пароль для первичного входа"
              />
              <button className="btn" type="button" onClick={() => setEmployeeForm({ ...employeeForm, password: generatePassword() })}>Сгенерировать</button>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>PIN-код</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={employeeForm?.pinCode || ''}
                onChange={e => setEmployeeForm({ ...employeeForm, pinCode: e.target.value })}
                placeholder="Код для Telegram-бота"
              />
              <button className="btn" type="button" onClick={() => setEmployeeForm({ ...employeeForm, pinCode: generatePinCode() })}>Сгенерировать</button>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-success" onClick={mode === 'edit' ? onUpdate : onAdd}>
            {mode === 'edit' ? 'Сохранить сотрудника' : 'Добавить сотрудника'}
          </button>
          <button className="btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

export default EmployeeModal;
