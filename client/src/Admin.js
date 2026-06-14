import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import { getOrderStatusMeta, getStageStatusMeta } from './statusMeta';

const roleTabs = [
  { key: 'carpenter', label: '🪚 Столяр' },
  { key: 'assembler', label: '🔧 Комплектовщик' },
  { key: 'painter', label: '🎨 Маляр' },
  { key: 'designer', label: '📐 Дизайнер' },
];

const settingsTabs = [
  { key: 'general', label: '⚙️ Общие' },
  { key: 'employees', label: '👥 Сотрудники' },
  ...roleTabs,
  { key: 'colors', label: '🎨 Цвета' },
];

const emptyEmployeeForm = {
  fullName: '',
  role: 'carpenter',
  telegramUsername: '',
  password: '',
  pinCode: '',
};

function generatePassword() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function generatePinCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function Admin() {
  const [showSettings, setShowSettings] = useState(false);
  const [activeRole, setActiveRole] = useState('general');
  const [steps, setSteps] = useState([]);
  const [colors, setColors] = useState([]);
  const [orders, setOrders] = useState([]);
  const [commentsModal, setCommentsModal] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [installingUpdates, setInstallingUpdates] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [appSettings, setAppSettings] = useState({
    publicBaseUrl: '',
    telegramBotUrl: '',
    selfUpdateEnabled: false,
    updateBranch: 'main',
  });
  const [employees, setEmployees] = useState([]);

  const [editStep, setEditStep] = useState(null);
  const [editColor, setEditColor] = useState(null);
  const [editEmployee, setEditEmployee] = useState(null);
  const [newStep, setNewStep] = useState({ stepName: '', description: '', order: 1 });
  const [newColor, setNewColor] = useState({ name: '', hex: '#000000' });
  const [newEmployee, setNewEmployee] = useState(emptyEmployeeForm);

  const filteredSteps = steps.filter(s => s.role === activeRole).sort((a, b) => a.order - b.order);
  useEffect(() => {
    if (!showSettings) return;
    setEditStep(null);
    setEditEmployee(null);
    setNewStep({ stepName: '', description: '', order: filteredSteps.length + 1 });
    setNewEmployee(emptyEmployeeForm);
    setSettingsError('');
    setSettingsSuccess('');
  }, [activeRole, showSettings, filteredSteps.length]);

  useEffect(() => {
    if (!showSettings) return;
    fetchAppSettings().catch(error => setSettingsError(error.message || 'Не удалось загрузить настройки.'));
    fetchEmployees().catch(error => setSettingsError(error.message || 'Не удалось загрузить сотрудников.'));
  }, [showSettings]);

  useEffect(() => {
    fetchSteps();
    fetchColors();
    fetchOrders();
    fetchUpdateStatus();
  }, []);

  const fetchSteps = async () => {
    const res = await apiFetch('/api/processSteps');
    const data = await parseJsonSafely(res);
    setSteps(Array.isArray(data) ? data : []);
  };

  const fetchColors = async () => {
    const res = await apiFetch('/api/colors');
    const data = await parseJsonSafely(res);
    setColors(Array.isArray(data) ? data : []);
  };

  const fetchOrders = async () => {
    try {
      const res = await apiFetch('/api/orders');
      const data = await parseJsonSafely(res);
      setOrders(Array.isArray(data) ? data : []);
    } catch { setOrders([]); }
  };

  const fetchAppSettings = async () => {
    const res = await apiFetch('/api/settings');
    const data = await parseJsonSafely(res);
    if (!res.ok) {
      throw new Error(data?.message || 'Не удалось загрузить настройки.');
    }
    setAppSettings({
      publicBaseUrl: data?.publicBaseUrl || '',
      telegramBotUrl: data?.telegramBotUrl || '',
      selfUpdateEnabled: Boolean(data?.selfUpdateEnabled),
      updateBranch: data?.updateBranch || 'main',
    });
  };

  const fetchEmployees = async () => {
    const res = await apiFetch('/api/employees');
    const data = await parseJsonSafely(res);
    if (!res.ok) {
      throw new Error(data?.message || 'Не удалось загрузить сотрудников.');
    }
    setEmployees(Array.isArray(data) ? data : []);
  };

  const fetchUpdateStatus = async () => {
    setCheckingUpdates(true);
    setUpdateError('');
    try {
      const res = await apiFetch('/api/updates/status');
      const data = await parseJsonSafely(res);
      if (!res.ok) throw new Error(data?.message || 'Не удалось проверить обновления');
      setUpdateStatus(data);
      setUpdateMessage(data?.message || '');
    } catch (error) {
      setUpdateError(error.message || 'Не удалось проверить обновления');
    } finally {
      setCheckingUpdates(false);
    }
  };

  const installUpdates = async () => {
    setInstallingUpdates(true);
    setUpdateError('');
    try {
      const res = await apiFetch('/api/updates/install', { method: 'POST' });
      const data = await parseJsonSafely(res);
      if (!res.ok) throw new Error(data?.details || data?.message || 'Не удалось установить обновления');
      setUpdateStatus(data?.status || null);
      setUpdateMessage(data?.message || 'Обновления установлены');
    } catch (error) {
      setUpdateError(error.message || 'Не удалось установить обновления');
    } finally {
      setInstallingUpdates(false);
    }
  };

  // Admin overview
  const findStage = (order, stepId) => {
    return (order.stages || []).find(stage => stage.stepId === stepId);
  };

  const getRoleLabel = (role) => {
    return roleTabs.find(item => item.key === role)?.label || role;
  };

  const getCommentPreview = (text) => {
    if (!text) return 'Без текста';
    return text.length > 80 ? `${text.slice(0, 80)}...` : text;
  };

  const openCommentsModal = (order, initialRole) => {
    const comments = Array.isArray(order.comments) ? order.comments : [];
    if (comments.length === 0) return;
    const activeComment = comments.find(comment => comment.role === initialRole) || comments[0];
    setCommentsModal({
      orderName: order.name,
      comments,
      activeRole: activeComment.role,
    });
  };

  const closeCommentsModal = () => {
    setCommentsModal(null);
  };

  const saveAppSettings = async () => {
    setSettingsError('');
    setSettingsSuccess('');
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appSettings),
    });
    const data = await parseJsonSafely(res);
    if (!res.ok) {
      setSettingsError(data?.message || 'Не удалось сохранить настройки.');
      return;
    }
    setAppSettings({
      publicBaseUrl: data?.publicBaseUrl || '',
      telegramBotUrl: data?.telegramBotUrl || '',
      selfUpdateEnabled: Boolean(data?.selfUpdateEnabled),
      updateBranch: data?.updateBranch || 'main',
    });
    setSettingsSuccess('Настройки сохранены.');
    fetchUpdateStatus();
  };

  const resetEmployeeForm = () => {
    setEditEmployee(null);
    setNewEmployee(emptyEmployeeForm);
  };

  const handleAddEmployee = async () => {
    setSettingsError('');
    setSettingsSuccess('');
    const res = await apiFetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEmployee),
    });
    if (!res.ok) {
      setSettingsError(await getErrorMessage(res, 'Не удалось добавить сотрудника.'));
      return;
    }
    resetEmployeeForm();
    await fetchEmployees();
    setSettingsSuccess('Сотрудник добавлен.');
  };

  const handleUpdateEmployee = async () => {
    if (!editEmployee) return;
    setSettingsError('');
    setSettingsSuccess('');
    const res = await apiFetch(`/api/employees/${editEmployee._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editEmployee),
    });
    if (!res.ok) {
      setSettingsError(await getErrorMessage(res, 'Не удалось обновить сотрудника.'));
      return;
    }
    resetEmployeeForm();
    await fetchEmployees();
    setSettingsSuccess('Данные сотрудника обновлены.');
  };

  const handleDeleteEmployee = async (id) => {
    setSettingsError('');
    setSettingsSuccess('');
    const res = await apiFetch(`/api/employees/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setSettingsError(await getErrorMessage(res, 'Не удалось удалить сотрудника.'));
      return;
    }
    if (editEmployee?._id === id) {
      resetEmployeeForm();
    }
    await fetchEmployees();
    setSettingsSuccess('Сотрудник удален.');
  };

  // Settings
  const handleAddStep = async () => {
    if (!newStep.stepName || !newStep.description) return;
    setSettingsError('');
    const res = await apiFetch('/api/processSteps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newStep, role: activeRole }),
    });
    if (!res.ok) {
      setSettingsError(await getErrorMessage(res, 'Не удалось добавить этап.'));
      return;
    }
    setNewStep({ stepName: '', description: '', order: filteredSteps.length + 1 });
    fetchSteps();
  };

  const handleUpdateStep = async () => {
    if (!editStep) return;
    setSettingsError('');
    const res = await apiFetch(`/api/processSteps/${editStep._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepName: editStep.stepName, description: editStep.description, order: editStep.order }),
    });
    if (!res.ok) {
      setSettingsError(await getErrorMessage(res, 'Не удалось обновить этап.'));
      return;
    }
    setEditStep(null);
    fetchSteps();
  };

  const handleDeleteStep = async (id) => {
    setSettingsError('');
    const res = await apiFetch(`/api/processSteps/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setSettingsError(await getErrorMessage(res, 'Не удалось удалить этап.'));
      return;
    }
    fetchSteps();
  };

  const handleAddColor = async () => {
    if (!newColor.name) return;
    setSettingsError('');
    const res = await apiFetch('/api/colors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newColor),
    });
    if (!res.ok) {
      setSettingsError(await getErrorMessage(res, 'Не удалось добавить цвет.'));
      return;
    }
    setNewColor({ name: '', hex: '#000000' });
    fetchColors();
  };

  const handleUpdateColor = async () => {
    if (!editColor) return;
    setSettingsError('');
    const res = await apiFetch(`/api/colors/${editColor._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editColor.name, hex: editColor.hex }),
    });
    if (!res.ok) {
      setSettingsError(await getErrorMessage(res, 'Не удалось обновить цвет.'));
      return;
    }
    setEditColor(null);
    fetchColors();
  };

  const handleDeleteColor = async (id) => {
    setSettingsError('');
    const res = await apiFetch(`/api/colors/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setSettingsError(await getErrorMessage(res, 'Не удалось удалить цвет.'));
      return;
    }
    fetchColors();
  };

  // ===== SETTINGS VIEW =====
  if (showSettings) {
    if (activeRole === 'general') {
      return (
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>⚙️ Настройки — Общие параметры</h2>
              <button className="btn" onClick={() => setShowSettings(false)}>← Назад к обзору</button>
            </div>
            <div className="tabs">
              {settingsTabs.map(tab => (
                <button key={tab.key} className={`tab ${activeRole === tab.key ? 'tab-active' : ''}`} onClick={() => setActiveRole(tab.key)}>{tab.label}</button>
              ))}
            </div>
          </div>

          <div className="card">
            <p>Здесь можно настроить адрес проекта для QR-кодов, self-update и ссылку на Telegram-бота.</p>
            {settingsError && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fdecec', color: '#b42318' }}>{settingsError}</div>}
            {settingsSuccess && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#eef7ee', color: '#1f6b35' }}>{settingsSuccess}</div>}

            <div className="form-group">
              <label>Публичный адрес проекта</label>
              <input
                value={appSettings.publicBaseUrl}
                onChange={e => setAppSettings({ ...appSettings, publicBaseUrl: e.target.value })}
                placeholder="Например: https://factory.example.com"
              />
            </div>

            <div className="form-group">
              <label>Адрес Telegram-бота</label>
              <input
                value={appSettings.telegramBotUrl}
                onChange={e => setAppSettings({ ...appSettings, telegramBotUrl: e.target.value })}
                placeholder="Например: https://t.me/your_bot"
              />
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ minWidth: 220, flex: 1 }}>
                <label>Ветка обновлений</label>
                <input
                  value={appSettings.updateBranch}
                  onChange={e => setAppSettings({ ...appSettings, updateBranch: e.target.value })}
                  placeholder="main"
                />
              </div>

              <div className="form-group" style={{ minWidth: 220, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={appSettings.selfUpdateEnabled}
                    onChange={e => setAppSettings({ ...appSettings, selfUpdateEnabled: e.target.checked })}
                  />
                  Разрешить self-update из интерфейса
                </label>
              </div>
            </div>

            <div style={{ color: '#666', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              Эти настройки сохраняются в данных приложения. <strong>ADMIN_TOKEN</strong> по-прежнему используется только для проверки и установки обновлений.
            </div>

            <button className="btn btn-success" onClick={saveAppSettings}>Сохранить настройки</button>
          </div>
        </div>
      );
    }

    if (activeRole === 'employees') {
      const employeeForm = editEmployee || newEmployee;
      const setEmployeeForm = (nextValue) => {
        if (editEmployee) {
          setEditEmployee(nextValue);
          return;
        }
        setNewEmployee(nextValue);
      };

      return (
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>⚙️ Настройки — Сотрудники</h2>
              <button className="btn" onClick={() => setShowSettings(false)}>← Назад к обзору</button>
            </div>
            <div className="tabs">
              {settingsTabs.map(tab => (
                <button key={tab.key} className={`tab ${activeRole === tab.key ? 'tab-active' : ''}`} onClick={() => setActiveRole(tab.key)}>{tab.label}</button>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <p>Список сотрудников для входа в Telegram-бот и работы с заказами по ролям.</p>
            {settingsError && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fdecec', color: '#b42318' }}>{settingsError}</div>}
            {settingsSuccess && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#eef7ee', color: '#1f6b35' }}>{settingsSuccess}</div>}

            <table>
              <thead><tr><th>ФИО</th><th>Роль</th><th>Telegram</th><th>Пароль</th><th>PIN</th><th>Действия</th></tr></thead>
              <tbody>
                {employees.map(employee => (
                  <tr key={employee._id}>
                    <td>{employee.fullName}</td>
                    <td>{getRoleLabel(employee.role)}</td>
                    <td>{employee.telegramUsername || '—'}</td>
                    <td>{employee.password || '—'}</td>
                    <td>{employee.pinCode || '—'}</td>
                    <td>
                      <button className="btn btn-primary" style={{ marginRight: 6 }} onClick={() => setEditEmployee({ ...employee })}>✎</button>
                      <button className="btn" style={{ background: '#e74c3c', color: 'white' }} onClick={() => handleDeleteEmployee(employee._id)}>✕</button>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#999' }}>Сотрудники пока не добавлены</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>{editEmployee ? 'Редактировать сотрудника' : 'Добавить сотрудника'}</h3>

            <div className="form-group"><label>ФИО</label><input value={employeeForm.fullName} onChange={e => setEmployeeForm({ ...employeeForm, fullName: e.target.value })} placeholder="Например: Иванов Иван Иванович" /></div>

            <div className="form-group">
              <label>Должность</label>
              <select value={employeeForm.role} onChange={e => setEmployeeForm({ ...employeeForm, role: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}>
                {roleTabs.map(role => (
                  <option key={role.key} value={role.key}>{role.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group"><label>Telegram username</label><input value={employeeForm.telegramUsername} onChange={e => setEmployeeForm({ ...employeeForm, telegramUsername: e.target.value })} placeholder="@username" /></div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Пароль</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={employeeForm.password} onChange={e => setEmployeeForm({ ...employeeForm, password: e.target.value })} placeholder="Пароль для первичного входа" />
                  <button className="btn" type="button" onClick={() => setEmployeeForm({ ...employeeForm, password: generatePassword() })}>Сгенерировать</button>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>PIN-код</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={employeeForm.pinCode} onChange={e => setEmployeeForm({ ...employeeForm, pinCode: e.target.value })} placeholder="Код для Telegram-бота" />
                  <button className="btn" type="button" onClick={() => setEmployeeForm({ ...employeeForm, pinCode: generatePinCode() })}>Сгенерировать</button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              <button className="btn btn-success" onClick={editEmployee ? handleUpdateEmployee : handleAddEmployee}>
                {editEmployee ? 'Сохранить сотрудника' : 'Добавить сотрудника'}
              </button>
              {(editEmployee || newEmployee.fullName || newEmployee.telegramUsername || newEmployee.password || newEmployee.pinCode) && (
                <button className="btn" onClick={resetEmployeeForm}>Очистить</button>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (activeRole === 'colors') {
      return (
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>⚙️ Настройки — Цвета покраски</h2>
              <button className="btn" onClick={() => setShowSettings(false)}>← Назад к обзору</button>
            </div>
            <div className="tabs">
              {settingsTabs.map(tab => (
                <button key={tab.key} className={`tab ${activeRole === tab.key ? 'tab-active' : ''}`} onClick={() => setActiveRole(tab.key)}>{tab.label}</button>
              ))}
            </div>
          </div>

          <div className="card">
            <p>Список доступных цветов для малярного цеха</p>
            {settingsError && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fdecec', color: '#b42318' }}>{settingsError}</div>}
            {settingsSuccess && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#eef7ee', color: '#1f6b35' }}>{settingsSuccess}</div>}
            <table>
              <thead><tr><th>Название</th><th>Цвет</th><th>Действия</th></tr></thead>
              <tbody>
                {colors.map(c => (
                  <tr key={c._id}>
                    <td>{c.name}</td>
                    <td><span style={{ display: 'inline-block', width: 24, height: 24, background: c.hex, borderRadius: 4, border: '1px solid #ccc', verticalAlign: 'middle', marginRight: 8 }} />{c.hex}</td>
                    <td>
                      <button className="btn btn-primary" style={{ marginRight: 6 }} onClick={() => setEditColor(c)}>✎</button>
                      <button className="btn" style={{ background: '#e74c3c', color: 'white' }} onClick={() => handleDeleteColor(c._id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <hr style={{ margin: '20px 0' }} />
            {editColor ? (
              <div>
                <h3>Редактировать цвет</h3>
                <div className="form-group"><label>Название</label><input value={editColor.name} onChange={e => setEditColor({ ...editColor, name: e.target.value })} /></div>
                <div className="form-group"><label>HEX-код</label><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="color" value={editColor.hex} onChange={e => setEditColor({ ...editColor, hex: e.target.value })} /><input value={editColor.hex} onChange={e => setEditColor({ ...editColor, hex: e.target.value })} /></div></div>
                <button className="btn btn-success" style={{ marginRight: 8 }} onClick={handleUpdateColor}>Сохранить</button>
                <button className="btn" onClick={() => setEditColor(null)}>Отмена</button>
              </div>
            ) : (
              <div>
                <h3>Добавить цвет</h3>
                <div style={{ display: 'flex', gap: 10, alignItems: 'end' }}>
                  <div className="form-group" style={{ flex: 1 }}><label>Название</label><input value={newColor.name} onChange={e => setNewColor({ ...newColor, name: e.target.value })} placeholder="Например: Орех" /></div>
                  <div className="form-group"><label>Цвет</label><input type="color" value={newColor.hex} onChange={e => setNewColor({ ...newColor, hex: e.target.value })} /></div>
                  <div className="form-group"><label>HEX</label><input value={newColor.hex} onChange={e => setNewColor({ ...newColor, hex: e.target.value })} style={{ width: 100 }} /></div>
                  <button className="btn btn-success" onClick={handleAddColor}>+ Добавить</button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div>
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>⚙️ Настройки — {roleTabs.find(t => t.key === activeRole)?.label}</h2>
            <button className="btn" onClick={() => setShowSettings(false)}>← Назад к обзору</button>
          </div>
          <div className="tabs">
            {settingsTabs.map(tab => (
              <button key={tab.key} className={`tab ${activeRole === tab.key ? 'tab-active' : ''}`} onClick={() => setActiveRole(tab.key)}>{tab.label}</button>
            ))}
          </div>
        </div>

        <div className="card">
          <p>Настройка этапов для данной роли</p>
          {settingsError && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fdecec', color: '#b42318' }}>{settingsError}</div>}
          {settingsSuccess && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#eef7ee', color: '#1f6b35' }}>{settingsSuccess}</div>}
          <table>
            <thead><tr><th>№</th><th>Название этапа</th><th>Описание</th><th>Действия</th></tr></thead>
            <tbody>
              {filteredSteps.map(s => (
                <tr key={s._id}>
                  <td>{s.order}</td><td>{s.stepName}</td><td>{s.description}</td>
                  <td>
                    <button className="btn btn-primary" style={{ marginRight: 6 }} onClick={() => setEditStep(s)}>✎</button>
                    <button className="btn" style={{ background: '#e74c3c', color: 'white' }} onClick={() => handleDeleteStep(s._id)}>✕</button>
                  </td>
                </tr>
              ))}
              {filteredSteps.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#999' }}>Нет этапов</td></tr>}
            </tbody>
          </table>
          <hr style={{ margin: '20px 0' }} />
          {editStep ? (
            <div>
              <h3>Редактировать этап</h3>
              <div className="form-group"><label>Название</label><input value={editStep.stepName} onChange={e => setEditStep({ ...editStep, stepName: e.target.value })} /></div>
              <div className="form-group"><label>Описание</label><textarea value={editStep.description} onChange={e => setEditStep({ ...editStep, description: e.target.value })} /></div>
              <div className="form-group"><label>Порядок</label><input type="number" value={editStep.order} onChange={e => setEditStep({ ...editStep, order: Number(e.target.value) })} style={{ width: 80 }} /></div>
              <button className="btn btn-success" style={{ marginRight: 8 }} onClick={handleUpdateStep}>Сохранить</button>
              <button className="btn" onClick={() => setEditStep(null)}>Отмена</button>
            </div>
          ) : (
            <div>
              <h3>Добавить этап</h3>
              <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1 }}><label>Название</label><input value={newStep.stepName} onChange={e => setNewStep({ ...newStep, stepName: e.target.value })} placeholder="Название" /></div>
                <div className="form-group" style={{ flex: 2 }}><label>Описание</label><input value={newStep.description} onChange={e => setNewStep({ ...newStep, description: e.target.value })} placeholder="Описание" /></div>
                <div className="form-group"><label>Порядок</label><input type="number" value={newStep.order} onChange={e => setNewStep({ ...newStep, order: Number(e.target.value) })} style={{ width: 70 }} /></div>
                <button className="btn btn-success" onClick={handleAddStep}>+ Добавить</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== OVERVIEW VIEW =====
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <h2>⚙️ Панель администратора</h2>
            <p>Общая сводка по этапам производства и заказам</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/archive" className="btn" style={{ background: '#8e44ad', color: 'white', padding: '10px 24px', fontSize: 14, textDecoration: 'none' }}>📦 Архив</Link>
            <button className="btn" style={{ background: '#2c3e50', color: 'white', padding: '10px 24px', fontSize: 14 }} onClick={() => { setActiveRole('general'); setShowSettings(true); }}>
              ⚙️ Настройки
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2>🔄 Обновление проекта</h2>
            <p>Проверка удаленного Git-репозитория и установка новых изменений</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={fetchUpdateStatus} disabled={checkingUpdates || installingUpdates}>
              {checkingUpdates ? 'Проверка...' : 'Проверить обновления'}
            </button>
            <button
              className="btn btn-success"
              onClick={installUpdates}
              disabled={installingUpdates || checkingUpdates || !updateStatus?.canInstall || !updateStatus?.updatesAvailable}
            >
              {installingUpdates ? 'Установка...' : 'Установить обновления'}
            </button>
          </div>
        </div>
        {updateMessage && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#eef7ee', color: '#1f6b35' }}>{updateMessage}</div>}
        {updateError && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#fdecec', color: '#b42318', whiteSpace: 'pre-wrap' }}>{updateError}</div>}
        {updateStatus?.enabled ? (
          <>
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div><strong>Git:</strong> {updateStatus?.gitAvailable ? (updateStatus.gitVersion || 'установлен') : 'не найден'}</div>
              <div><strong>Репозиторий:</strong> {updateStatus?.isRepo ? 'инициализирован' : 'не инициализирован'}</div>
              <div><strong>Remote origin:</strong> {updateStatus?.remoteUrl || 'не настроен'}</div>
              <div><strong>Ветка:</strong> {updateStatus?.branch || '—'}</div>
              <div><strong>Источник обновления:</strong> {updateStatus?.targetRef || '—'}</div>
              <div><strong>Новых коммитов:</strong> {updateStatus?.behind ?? '—'}</div>
            </div>
            {!updateError && updateStatus?.message && <div style={{ marginTop: 12, color: '#666' }}>{updateStatus.message}</div>}
            {updateStatus && !updateStatus.gitAvailable && (
              <div style={{ marginTop: 12, color: '#666' }}>
                Для включения обновлений установите Git и убедитесь, что команда <strong>git</strong> доступна в PATH.
              </div>
            )}
            {updateStatus && updateStatus.gitAvailable && !updateStatus.isRepo && (
              <div style={{ marginTop: 12, color: '#666' }}>
                Инициализируйте локальный репозиторий командой <strong>git init</strong> в корне проекта.
              </div>
            )}
            {updateStatus && updateStatus.isRepo && !updateStatus.hasRemote && (
              <div style={{ marginTop: 12, color: '#666' }}>
                Подключите удаленный репозиторий командой <strong>git remote add origin &lt;URL_РЕПОЗИТОРИЯ&gt;</strong>.
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 12, color: '#666', lineHeight: 1.6 }}>
            Self-update сейчас отключён. Чтобы включить обновления из интерфейса, установите <strong>ENABLE_SELF_UPDATE=true</strong> в <strong>/opt/kaznadzei/.env</strong>, перезапустите сервис и сохраните актуальный <strong>ADMIN_TOKEN</strong> в панели сверху.
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>📊 Сводка по всем заказам</h2>
        <p>Прогресс каждого изделия по всем этапам производства</p>
        <table className="orders-table">
          <thead>
            <tr>
              <th>Изделие</th>
              {sortedSteps.map(s => <th key={s._id} title={s.description}>{s.stepName}</th>)}
              <th>Общий статус</th>
              <th>Примечания</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => {
              const comments = order.comments || [];
              const overallStatusMeta = getOrderStatusMeta(order.overallStatus);
              return (
                <tr key={order._id}>
                  <td><strong>{order.name}</strong></td>
                  {sortedSteps.map(s => {
                    const st = findStage(order, s._id);
                    const stageMeta = st ? getStageStatusMeta(st.status) : null;
                    return (
                      <td key={s._id} style={{ textAlign: 'center' }}>
                        {stageMeta ? (
                          <span className={stageMeta.className}>{stageMeta.label}</span>
                        ) : '—'}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: 'center' }}>
                    <span className={overallStatusMeta.className}>
                      {overallStatusMeta.label}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 200, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                    {comments.length === 0 ? <span style={{ color: '#ccc' }}>—</span> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button
                          className="btn"
                          style={{ alignSelf: 'flex-start', padding: '6px 10px', fontSize: 12 }}
                          onClick={() => openCommentsModal(order)}
                        >
                          Открыть все ({comments.length})
                        </button>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {comments.map((c, i) => (
                            <span
                              key={i}
                              onClick={() => openCommentsModal(order, c.role)}
                              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 12, background: '#f0f0f0', fontSize: 11 }}
                              title={c.text}
                            >
                              📝 {getRoleLabel(c.role)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && <tr><td colSpan={sortedSteps.length + 3} style={{ textAlign: 'center', color: '#999' }}>Нет заказов</td></tr>}
          </tbody>
        </table>
      </div>

      {commentsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }} onClick={closeCommentsModal}>
          <div style={{ background: 'white', borderRadius: 14, padding: 24, maxWidth: 900, width: '94%', boxShadow: '0 12px 44px rgba(0,0,0,0.22)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 18 }}>
              <div>
                <div style={{ fontWeight: 700, color: '#2c3e50', marginBottom: 4 }}>📝 Примечания по заказу</div>
                <div style={{ fontSize: 13, color: '#666' }}>{commentsModal.orderName}</div>
              </div>
              <button className="btn" style={{ padding: '6px 10px' }} onClick={closeCommentsModal}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) minmax(0, 1fr)', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {commentsModal.comments.map((comment, index) => (
                  <button
                    key={`${comment.role}-${index}`}
                    className="btn"
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      background: commentsModal.activeRole === comment.role ? '#2c3e50' : '#f7f8fa',
                      color: commentsModal.activeRole === comment.role ? 'white' : '#2c3e50',
                    }}
                    onClick={() => setCommentsModal(current => current ? { ...current, activeRole: comment.role } : current)}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{getRoleLabel(comment.role)}</div>
                    <div style={{ fontSize: 12, opacity: 0.9, lineHeight: 1.4, whiteSpace: 'normal' }}>
                      {getCommentPreview(comment.text)}
                    </div>
                  </button>
                ))}
              </div>

              <div style={{ background: '#f7f8fa', borderRadius: 12, padding: 18, minHeight: 260 }}>
                {(() => {
                  const activeComment = commentsModal.comments.find(comment => comment.role === commentsModal.activeRole) || commentsModal.comments[0];
                  return (
                    <>
                      <div style={{ fontWeight: 700, color: '#2c3e50', marginBottom: 6 }}>
                        {getRoleLabel(activeComment.role)}
                      </div>
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 14 }}>
                        {activeComment.createdAt ? new Date(activeComment.createdAt).toLocaleString() : 'Дата не указана'}
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {activeComment.text}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-primary" onClick={closeCommentsModal}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;
