import React, { useEffect, useState } from 'react';
import { apiFetch, parseJsonSafely, toUserErrorMessage } from './api';
import { clearSettingsPinSessionToken, setSettingsPinSessionToken } from './appAuth';
import { useGlobalErrorEffect } from './globalErrors';

function AdminTokenControls() {
  const [form, setForm] = useState({
    adminPassword: '',
    settingsPin: '',
  });
  const [config, setConfig] = useState({
    adminPasswordConfigured: false,
    adminBootstrapAvailable: false,
    settingsPinConfigured: false,
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  useGlobalErrorEffect(error, 'Не удалось изменить параметры доступа к настройкам.');

  const fetchConfig = async () => {
    const res = await apiFetch('/api/auth/config');
    const data = await parseJsonSafely(res);
    setConfig({
      adminPasswordConfigured: Boolean(data?.adminPasswordConfigured),
      adminBootstrapAvailable: Boolean(data?.adminBootstrapAvailable),
      settingsPinConfigured: Boolean(data?.settingsPinConfigured),
    });
  };

  useEffect(() => {
    fetchConfig().catch(() => {
      setConfig({
        adminPasswordConfigured: false,
        adminBootstrapAvailable: false,
        settingsPinConfigured: false,
      });
    });
  }, []);

  const handleSave = async () => {
    if (!form.adminPassword.trim()) {
      setError('Введите пароль администратора для сохранения.');
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
          adminPassword: form.adminPassword,
        }),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        setError(toUserErrorMessage(data?.message, 'Не удалось сохранить пароль администратора.'));
        return;
      }
      setConfig({
        adminPasswordConfigured: Boolean(data?.adminPasswordConfigured),
        adminBootstrapAvailable: Boolean(data?.adminBootstrapAvailable),
        settingsPinConfigured: Boolean(data?.settingsPinConfigured),
      });
      setForm({ adminPassword: '' });
      setMessage(data?.message || 'Пароль администратора сохранен.');
    } catch (requestError) {
      setError(toUserErrorMessage(requestError, 'Не удалось сохранить пароль администратора.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettingsPin = async ({ clear = false } = {}) => {
    if (!clear && !String(form.settingsPin || '').trim()) {
      setError('Введите PIN-код для доступа к настройкам.');
      setMessage('');
      return;
    }

    setSavingPin(true);
    setError('');
    setMessage('');
    try {
      const res = await apiFetch('/api/auth/settings-pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settingsPin: clear ? '' : String(form.settingsPin || '').trim(),
          clear,
        }),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        setError(toUserErrorMessage(data?.message, 'Не удалось сохранить PIN-код доступа к настройкам.'));
        return;
      }

      setConfig({
        adminPasswordConfigured: Boolean(data?.adminPasswordConfigured),
        adminBootstrapAvailable: Boolean(data?.adminBootstrapAvailable),
        settingsPinConfigured: Boolean(data?.settingsPinConfigured),
      });
      setForm((current) => ({ ...current, settingsPin: '' }));
      if (data?.settingsPinToken) {
        setSettingsPinSessionToken(data.settingsPinToken);
      } else {
        clearSettingsPinSessionToken();
      }
      setMessage(data?.message || 'PIN-код доступа к настройкам сохранен.');
    } catch (requestError) {
      setError(toUserErrorMessage(requestError, 'Не удалось сохранить PIN-код доступа к настройкам.'));
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <div className="panel-soft">
      <div className="panel-soft-title">Доступ к настройкам</div>
      <div className="panel-soft-text">
        Здесь задаются пароль администратора и дополнительный PIN-код для входа в раздел настроек.
      </div>

      <div className="responsive-form-grid" style={{ marginTop: 16 }}>
        <div className="form-group" style={{ marginBottom: 0, maxWidth: 360 }}>
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
        <div className="form-group" style={{ marginBottom: 0, maxWidth: 420 }}>
          <label>PIN-код настроек</label>
          <div className="modal-actions-group" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 1 220px', minWidth: 180 }}>
              <input
                type="password"
                value={form.settingsPin}
                onChange={(e) => setForm(current => ({ ...current, settingsPin: e.target.value.replace(/[^\d]/g, '') }))}
                placeholder="Введите 4-20 цифр"
                disabled={savingPin}
                inputMode="numeric"
              />
            </div>
            <button className="btn btn-secondary" onClick={() => handleSaveSettingsPin()} disabled={savingPin}>
              {savingPin ? 'Сохранение PIN...' : 'Сохранить PIN'}
            </button>
            {config.settingsPinConfigured ? (
              <button className="btn btn-danger" onClick={() => handleSaveSettingsPin({ clear: true })} disabled={savingPin}>
                {savingPin ? 'Удаление PIN...' : 'Удалить PIN'}
              </button>
            ) : null}
          </div>
          <div className="text-small text-subtle" style={{ marginTop: 8 }}>
            {config.settingsPinConfigured
              ? 'PIN-код для доступа к настройкам уже включен.'
              : 'Если PIN-код задан, при открытии настроек потребуется дополнительное подтверждение.'}
          </div>
        </div>
      </div>

      <div className="modal-actions-group" style={{ alignItems: 'center', marginTop: 16 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить пароль'}
        </button>
      </div>

      {error && <div className="settings-alert settings-alert-error mt-16">{error}</div>}
      {message && <div className="settings-alert settings-alert-success mt-16">{message}</div>}
    </div>
  );
}

export default AdminTokenControls;
