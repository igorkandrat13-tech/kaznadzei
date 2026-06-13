import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';

const roleTabs = [
  { key: 'carpenter', label: '🪚 Столяр' },
  { key: 'assembler', label: '🔧 Комплектовщик' },
  { key: 'painter', label: '🎨 Маляр' },
  { key: 'designer', label: '📐 Дизайнер' },
  { key: 'colors', label: '🎨 Цвета' },
];

function Admin() {
  const [showSettings, setShowSettings] = useState(false);
  const [activeRole, setActiveRole] = useState('carpenter');
  const [steps, setSteps] = useState([]);
  const [colors, setColors] = useState([]);
  const [orders, setOrders] = useState([]);
  const [popupText, setPopupText] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [installingUpdates, setInstallingUpdates] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  const [editStep, setEditStep] = useState(null);
  const [editColor, setEditColor] = useState(null);
  const [newStep, setNewStep] = useState({ stepName: '', description: '', order: 1 });
  const [newColor, setNewColor] = useState({ name: '', hex: '#000000' });

  const filteredSteps = steps.filter(s => s.role === activeRole).sort((a, b) => a.order - b.order);
  useEffect(() => {
    if (!showSettings) return;
    setEditStep(null);
    setNewStep({ stepName: '', description: '', order: filteredSteps.length + 1 });
  }, [activeRole, showSettings]);

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

  const stageStatus = (stage) => {
    const s = stage;
    if (!s) return '—';
    if (s.status === 'completed') return '✓';
    if (s.status === 'in_progress') return '●';
    return '○';
  };

  const stageClass = (status) => {
    if (status === 'completed') return 'badge badge-active';
    if (status === 'in_progress') return 'badge badge-pending';
    return 'badge';
  };

  const getOverallStatusMeta = (status) => {
    if (status === 'completed') {
      return { className: 'badge badge-active', label: 'Завершён' };
    }
    if (status === 'in_progress') {
      return { className: 'badge badge-pending', label: 'В работе' };
    }
    return { className: 'badge', label: 'Ожидание' };
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
    if (activeRole === 'colors') {
      return (
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>⚙️ Настройки — Цвета покраски</h2>
              <button className="btn" onClick={() => setShowSettings(false)}>← Назад к обзору</button>
            </div>
            <div className="tabs">
              {roleTabs.map(tab => (
                <button key={tab.key} className={`tab ${activeRole === tab.key ? 'tab-active' : ''}`} onClick={() => setActiveRole(tab.key)}>{tab.label}</button>
              ))}
            </div>
          </div>

          <div className="card">
            <p>Список доступных цветов для малярного цеха</p>
          {settingsError && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fdecec', color: '#b42318' }}>{settingsError}</div>}
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
            {roleTabs.map(tab => (
              <button key={tab.key} className={`tab ${activeRole === tab.key ? 'tab-active' : ''}`} onClick={() => setActiveRole(tab.key)}>{tab.label}</button>
            ))}
          </div>
        </div>

        <div className="card">
          <p>Настройка этапов для данной роли</p>
          {settingsError && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fdecec', color: '#b42318' }}>{settingsError}</div>}
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
            <button className="btn" style={{ background: '#2c3e50', color: 'white', padding: '10px 24px', fontSize: 14 }} onClick={() => setShowSettings(true)}>
              ⚙️ Настройки этапов
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
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div><strong>Git:</strong> {updateStatus?.gitAvailable ? (updateStatus.gitVersion || 'установлен') : 'не найден'}</div>
          <div><strong>Репозиторий:</strong> {updateStatus?.isRepo ? 'инициализирован' : 'не инициализирован'}</div>
          <div><strong>Remote origin:</strong> {updateStatus?.remoteUrl || 'не настроен'}</div>
          <div><strong>Ветка:</strong> {updateStatus?.branch || '—'}</div>
          <div><strong>Источник обновления:</strong> {updateStatus?.targetRef || '—'}</div>
          <div><strong>Новых коммитов:</strong> {updateStatus?.behind ?? '—'}</div>
        </div>
        {updateMessage && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#eef7ee', color: '#1f6b35' }}>{updateMessage}</div>}
        {updateError && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#fdecec', color: '#b42318', whiteSpace: 'pre-wrap' }}>{updateError}</div>}
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
              const overallStatusMeta = getOverallStatusMeta(order.overallStatus);
              return (
                <tr key={order._id}>
                  <td><strong>{order.name}</strong></td>
                  {sortedSteps.map(s => {
                    const st = findStage(order, s._id);
                    return (
                      <td key={s._id} style={{ textAlign: 'center' }}>
                        <span className={stageClass(st?.status)}>{st ? stageStatus(st) : '—'}</span>
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
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {comments.map((c, i) => (
                          <span key={i} onClick={() => setPopupText({ role: c.role, text: c.text })} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 12, background: '#f0f0f0', fontSize: 11 }} title={c.text}>
                            📝 {roleTabs.find(r => r.key === c.role)?.label || c.role}
                          </span>
                        ))}
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

      {popupText && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }} onClick={() => setPopupText(null)}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 500, width: '90%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 10, color: '#2c3e50' }}>📝 Примечание — {roleTabs.find(r => r.key === popupText.role)?.label || popupText.role}</div>
            <div style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' }}>{popupText.text}</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setPopupText(null)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;
