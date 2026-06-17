import React, { useState } from 'react';
import { clearAdminToken, getAdminToken, setAdminToken } from './api';

function AdminTokenControls() {
  const [value, setValue] = useState(getAdminToken());
  const [message, setMessage] = useState('');

  const handleSave = () => {
    setAdminToken(value);
    setMessage(value.trim() ? 'Ключ сохранён в браузере.' : 'Ключ удалён.');
  };

  const handleClear = () => {
    clearAdminToken();
    setValue('');
    setMessage('Ключ удалён.');
  };

  return (
    <div className="panel-soft">
      <div className="panel-soft-title">Ключ администратора</div>
      <div className="panel-soft-text">
        Хранится только в браузере и нужен лишь для защищенных операций. Для текущего публичного GitHub обновления из интерфейса можно выполнять без него.
      </div>
      <div className="modal-actions-group" style={{ alignItems: 'center' }}>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Введите ADMIN_TOKEN"
          style={{ minWidth: 260, flex: 1 }}
        />
        <button className="btn btn-primary" onClick={handleSave}>Сохранить</button>
        <button className="btn btn-secondary" onClick={handleClear}>Очистить</button>
      </div>
      {message && <div className="panel-soft-message">{message}</div>}
    </div>
  );
}

export default AdminTokenControls;
