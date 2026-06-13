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
    <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#f7f9fc', border: '1px solid #e2e8f0' }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Ключ администратора</div>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 10 }}>
        Используется для изменения данных и управления обновлениями, если на сервере задан `ADMIN_TOKEN`.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Введите ADMIN_TOKEN"
          style={{ minWidth: 260, flex: 1 }}
        />
        <button className="btn btn-primary" onClick={handleSave}>Сохранить</button>
        <button className="btn" onClick={handleClear}>Очистить</button>
      </div>
      {message && <div style={{ marginTop: 8, fontSize: 12, color: '#1f6b35' }}>{message}</div>}
    </div>
  );
}

export default AdminTokenControls;
