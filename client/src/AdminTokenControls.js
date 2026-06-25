import React, { useEffect, useState } from 'react';
import { apiFetch, parseJsonSafely } from './api';

function AdminTokenControls() {
  const [form, setForm] = useState({
    adminPassword: '',
    managerPassword: '',
  });
  const [config, setConfig] = useState({
    adminPasswordConfigured: false,
    managerPasswordConfigured: false,
    adminBootstrapAvailable: false,
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchConfig = async () => {
    const res = await apiFetch('/api/auth/config');
    const data = await parseJsonSafely(res);
    setConfig({
      adminPasswordConfigured: Boolean(data?.adminPasswordConfigured),
      managerPasswordConfigured: Boolean(data?.managerPasswordConfigured),
      adminBootstrapAvailable: Boolean(data?.adminBootstrapAvailable),
    });
  };

  useEffect(() => {
    fetchConfig().catch(() => {
      setConfig({
        adminPasswordConfigured: false,
        managerPasswordConfigured: false,
        adminBootstrapAvailable: false,
      });
    });
  }, []);

  const handleSave = async () => {
    if (!form.adminPassword.trim() && !form.managerPassword.trim()) {
      setError('Введите хотя бы один пароль для сохранения.');
      setMessage('');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await apiFetch('/api/auth/passwords', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(form.adminPassword.trim() ? { adminPassword: form.adminPassword } : {}),
          ...(form.managerPassword.trim() ? { managerPassword: form.managerPassword } : {}),
        }),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        setError(data?.message || 'Не удалось сохранить пароли доступа.');
        return;
      }
      setConfig({
        adminPasswordConfigured: Boolean(data?.adminPasswordConfigured),
        managerPasswordConfigured: Boolean(data?.managerPasswordConfigured),
        adminBootstrapAvailable: Boolean(data?.adminBootstrapAvailable),
      });
      setForm({ adminPassword: '', managerPassword: '' });
      setMessage(data?.message || 'Пароли доступа сохранены.');
    } catch (requestError) {
      setError(requestError.message || 'Не удалось сохранить пароли доступа.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel-soft">
      <div className="panel-soft-title">Доступ по паролю</div>
      <div className="panel-soft-text">
        Здесь задаются пароли для администратора и рабочего доступа. Администратор получает полный доступ, рабочий доступ открывает заказы и рабочие страницы без системных настроек.
      </div>

      <div className="responsive-form-grid" style={{ marginTop: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Пароль администратора</label>
          <input
            type="password"
            value={form.adminPassword}
            onChange={(e) => setForm(current => ({ ...current, adminPassword: e.target.value }))}
            placeholder="Введите новый пароль администратора"
            disabled={saving}
          />
          <div className="text-small text-subtle" style={{ marginTop: 8 }}>
            {config.adminPasswordConfigured
              ? 'Пароль администратора настроен.'
              : config.adminBootstrapAvailable
                ? 'Пока пароль не задан, доступ возможен через ADMIN_TOKEN как bootstrap-вход.'
                : 'Пароль администратора пока не настроен.'}
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Рабочий пароль</label>
          <input
            type="password"
            value={form.managerPassword}
            onChange={(e) => setForm(current => ({ ...current, managerPassword: e.target.value }))}
            placeholder="Введите новый рабочий пароль"
            disabled={saving}
          />
          <div className="text-small text-subtle" style={{ marginTop: 8 }}>
            {config.managerPasswordConfigured
              ? 'Рабочий пароль настроен.'
              : 'Рабочий пароль пока не задан.'}
          </div>
        </div>
      </div>

      <div className="modal-actions-group" style={{ alignItems: 'center', marginTop: 16 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить пароли'}
        </button>
      </div>

      {error && <div className="settings-alert settings-alert-error mt-16">{error}</div>}
      {message && <div className="settings-alert settings-alert-success mt-16">{message}</div>}
    </div>
  );
}

export default AdminTokenControls;
