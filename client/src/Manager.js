import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import { getOrderStatusMeta, getStageStatusMeta } from './statusMeta';
import ConfirmDialog from './ConfirmDialog';
import { useRoleConfig } from './RoleConfigContext';
import useEscapeKey from './useEscapeKey';

const EMPTY_FORM = {
  orderNumber: '',
  customer: '',
  name: '',
  quantity: 1,
  material: '',
  notes: '',
  orderDate: '',
  startDate: '',
  endDate: '',
};

function validateManagerForm(form) {
  const errors = {};

  if (!form.orderNumber.trim()) {
    errors.orderNumber = 'Укажите номер заказа.';
  }

  if (!form.name.trim()) {
    errors.name = 'Укажите наименование изделия.';
  }

  if ((Number(form.quantity) || 0) < 1) {
    errors.quantity = 'Количество должно быть не меньше 1.';
  }

  if (form.startDate && form.endDate && new Date(form.endDate) < new Date(form.startDate)) {
    errors.endDate = 'Дата окончания не может быть раньше даты начала.';
  }

  return errors;
}

function getManagerCommentPreview(notes) {
  const text = String(notes || '').trim();
  if (!text) return '—';
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}

function getInitialStageRoleTab(stages = [], roleTabs = []) {
  const firstRoleWithStage = roleTabs.find(tab => stages.some(stage => stage.role === tab.key));
  return firstRoleWithStage?.key || roleTabs[0]?.key || '';
}

function getRoleShortLabel(role, roleTabs = []) {
  return roleTabs.find(tab => tab.key === role)?.plainLabel || role;
}

function getRoleProgressInfo(order, role, roleTabs = []) {
  const stages = Array.isArray(order?.stages) ? order.stages : [];
  const roleStages = stages.filter(stage => stage.role === role);
  const total = roleStages.length;
  const roleLabel = getRoleShortLabel(role, roleTabs);

  if (total === 0) {
    return {
      total,
      text: '—',
      title: `${roleLabel}: этапы не настроены`,
      className: 'role-progress-badge',
    };
  }

  const completed = roleStages.filter(stage => stage.status === 'completed').length;
  const activeIndex = roleStages.findIndex(stage => stage.status === 'in_progress');
  const firstPendingIndex = roleStages.findIndex(stage => stage.status !== 'completed');
  const lastCompletedStage = completed > 0 ? roleStages[completed - 1] : null;

  if (completed === total) {
    return {
      total,
      text: `Готово ${total} из ${total}`,
      title: `${roleLabel}: все этапы завершены${lastCompletedStage?.stepName ? `\nПоследний этап: ${lastCompletedStage.stepName}` : ''}`,
      className: 'role-progress-badge role-progress-badge-completed',
    };
  }

  const currentStageIndex = activeIndex !== -1 ? activeIndex : (firstPendingIndex === -1 ? total - 1 : firstPendingIndex);
  const isWaiting = activeIndex === -1 && completed === 0;
  const currentStage = roleStages[currentStageIndex] || null;
  const progressTitle = [
    `${roleLabel}: завершено ${completed} из ${total}`,
    currentStage?.stepName
      ? `${isWaiting ? 'Ближайший этап' : 'Текущий этап'}: ${currentStage.stepName}`
      : '',
  ].filter(Boolean).join('\n');

  if (isWaiting) {
    return {
      total,
      text: 'Ожидание',
      title: progressTitle,
      className: 'role-progress-badge role-progress-badge-pending',
    };
  }

  return {
    total,
    text: `Этап ${currentStageIndex + 1} из ${total}`,
    title: progressTitle,
    className: `role-progress-badge ${isWaiting ? 'role-progress-badge-pending' : 'role-progress-badge-active'}`,
  };
}

function ManagerStagePanel({
  stages,
  activeRole,
  onRoleChange,
  emptyMessage,
  subtitle,
  roleTabs,
}) {
  const activeRoleStages = stages.filter(stage => stage.role === activeRole);

  return (
    <div className="manager-stage-panel">
      <div className="manager-stage-panel-header">
        <div className="manager-stage-panel-title">Этапы по специалистам</div>
        <div className="manager-stage-panel-subtitle">{subtitle}</div>
      </div>
      <div className="tabs manager-stage-tabs">
        {roleTabs.map(tab => {
          const roleCount = stages.filter(stage => stage.role === tab.key).length;
          return (
            <button
              key={tab.key}
              type="button"
              className={`tab ${activeRole === tab.key ? 'tab-active' : ''}`}
              onClick={() => onRoleChange(tab.key)}
            >
              {tab.label} {roleCount ? `(${roleCount})` : ''}
            </button>
          );
        })}
      </div>
      {activeRoleStages.length > 0 ? (
        <div className="mobile-order-stage-list">
          {activeRoleStages.map(stage => {
            const stageStatusMeta = getStageStatusMeta(stage.status);
            return (
              <div key={`${stage.stepId || stage._id || stage.stepName}-${stage.role}`} className="mobile-order-stage-row">
                <div>
                  <div className="manager-stage-name">{stage.stepName || 'Этап без названия'}</div>
                  <div className="manager-stage-description">{stage.description || 'Описание этапа не задано.'}</div>
                </div>
                <span className={stageStatusMeta.className}>
                  {stageStatusMeta.label}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="manager-stage-empty">{emptyMessage}</div>
      )}
    </div>
  );
}

function Manager() {
  const { roleTabs, allRoleTabs } = useRoleConfig();
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formStages, setFormStages] = useState([]);
  const [activeStageRole, setActiveStageRole] = useState(() => roleTabs[0]?.key || allRoleTabs[0]?.key || '');
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [qrOrderId, setQrOrderId] = useState(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [managerCommentModal, setManagerCommentModal] = useState(null);
  const [savingManagerComment, setSavingManagerComment] = useState(false);
  const [deletingManagerComment, setDeletingManagerComment] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');

  const formErrors = validateManagerForm(form);
  const isFormValid = Object.keys(formErrors).length === 0;
  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    const refreshOrders = () => {
      fetchOrders();
    };

    const intervalId = window.setInterval(refreshOrders, 10000);
    window.addEventListener('focus', refreshOrders);
    document.addEventListener('visibilitychange', refreshOrders);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshOrders);
      document.removeEventListener('visibilitychange', refreshOrders);
    };
  }, []);

  useEffect(() => {
    if (!activeStageRole && (roleTabs[0]?.key || allRoleTabs[0]?.key)) {
      setActiveStageRole(roleTabs[0]?.key || allRoleTabs[0]?.key || '');
      return;
    }
    if (activeStageRole && allRoleTabs.length > 0 && !allRoleTabs.some(tab => tab.key === activeStageRole)) {
      setActiveStageRole(roleTabs[0]?.key || allRoleTabs[0]?.key || '');
    }
  }, [activeStageRole, roleTabs, allRoleTabs]);

  const fetchOrders = async () => {
    const res = await apiFetch('/api/orders');
    const data = await parseJsonSafely(res);
    setOrders(Array.isArray(data) ? data : []);
    setLastRefreshedAt(new Date().toISOString());
  };

  const calcDuration = (start, end) => {
    if (!start || !end) return '';
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff + ' дн.' : '';
  };

  const getCurrentResponsibleRole = (order) => {
    const stages = Array.isArray(order?.stages) ? order.stages : [];
    const activeStage = stages.find(stage => stage.status === 'in_progress')
      || stages.find(stage => stage.status !== 'completed');
    return activeStage?.role || '';
  };

  const renderManagerRoleProgress = (order) => {
    const roleProgress = allRoleTabs
      .map(tab => ({ ...tab, progress: getRoleProgressInfo(order, tab.key, allRoleTabs) }))
      .filter(item => item.progress.total > 0);

    if (roleProgress.length === 0) {
      return <span className="empty-inline">—</span>;
    }

    return (
      <div className="order-role-progress-list">
        {roleProgress.map(item => (
          <div key={item.key} className="order-role-progress-row">
            <span className="order-role-progress-label">{getRoleShortLabel(item.key, allRoleTabs)}</span>
            <span className={item.progress.className} title={item.progress.title}>
              {item.progress.text}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const filteredOrders = orders.filter(order => {
    if (statusFilter !== 'all' && order.overallStatus !== statusFilter) return false;
    if (roleFilter !== 'all' && getCurrentResponsibleRole(order) !== roleFilter) return false;
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      const haystack = [
        order.orderNumber,
        order.customer,
        order.name,
        order.material,
        order.notes,
      ].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const handleChange = (field) => (e) => {
    const val = e.target.value;
    setError('');
    setForm(prev => {
      const next = { ...prev, [field]: val };
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!isFormValid) {
      setError(formErrors.orderNumber || formErrors.name || formErrors.quantity || formErrors.endDate || 'Проверьте заполнение формы.');
      return;
    }
    if (savingOrder) return;
    setError('');
    setSavingOrder(true);
    try {
      const body = { ...form, quantity: Number(form.quantity) || 1 };
      let res;
      if (editingId) {
        res = await apiFetch('/api/orders/' + editingId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await apiFetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) {
        setError(await getErrorMessage(res, editingId ? 'Не удалось сохранить заказ.' : 'Не удалось создать заказ.'));
        return;
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      await fetchOrders();
    } finally {
      setSavingOrder(false);
    }
  };

  const handleEdit = (order) => {
    setError('');
    setForm({
      orderNumber: order.orderNumber || '',
      customer: order.customer || '',
      name: order.name || '',
      quantity: order.quantity || 1,
      material: order.material || '',
      notes: order.notes || '',
      orderDate: order.orderDate || '',
      startDate: order.startDate || '',
      endDate: order.endDate || '',
    });
    const nextStages = Array.isArray(order.stages) ? order.stages : [];
    setFormStages(nextStages);
    setActiveStageRole(getInitialStageRoleTab(nextStages, allRoleTabs));
    setEditingId(order._id);
    setShowForm(true);
  };

  const requestDelete = (order) => {
    setError('');
    setConfirmDelete({
      id: order._id,
      name: order.name || 'Без названия',
      customer: order.customer || 'Заказчик не указан',
    });
  };

  const handleDelete = async () => {
    if (!confirmDelete?.id) return;
    if (deletingOrder) return;
    setDeletingOrder(true);
    setError('');
    try {
      const res = await apiFetch('/api/orders/' + confirmDelete.id, { method: 'DELETE' });
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось удалить заказ.'));
        return;
      }
      if (editingId === confirmDelete.id) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
      setConfirmDelete(null);
      await fetchOrders();
    } catch (requestError) {
      setError(requestError.message || 'Не удалось удалить заказ.');
    } finally {
      setDeletingOrder(false);
    }
  };

  const handleDownloadQr = async () => {
    if (!qrOrderId) return;
    if (downloadingQr) return;
    setError('');
    setDownloadingQr(true);
    try {
      const res = await apiFetch(`/api/orders/${qrOrderId}/qrcode`);
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось скачать QR-код.'));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const qrOrder = orders.find(order => order._id === qrOrderId);
      const safeOrderNumber = String(qrOrder?.orderNumber || qrOrderId).replace(/[^\w-]+/g, '_');
      a.href = url;
      a.download = `order-${safeOrderNumber}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.message || 'Не удалось скачать QR-код.');
    } finally {
      setDownloadingQr(false);
    }
  };

  const handleCancel = () => {
    if (savingOrder) return;
    setForm(EMPTY_FORM);
    setFormStages([]);
    setActiveStageRole(roleTabs[0]?.key || allRoleTabs[0]?.key || '');
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const openNewForm = () => {
    setError('');
    setForm({ ...EMPTY_FORM, orderDate: new Date().toISOString().split('T')[0] });
    setFormStages([]);
    setActiveStageRole(roleTabs[0]?.key || allRoleTabs[0]?.key || '');
    setEditingId(null);
    setShowForm(true);
  };

  const openManagerCommentModal = (order) => {
    setError('');
    setManagerCommentModal({
      orderId: order._id,
      orderName: order.name || 'Без названия',
      customer: order.customer || 'Заказчик не указан',
      currentNotes: String(order.notes || ''),
      draftNotes: String(order.notes || ''),
    });
  };

  const closeManagerCommentModal = () => {
    if (savingManagerComment || deletingManagerComment) return;
    setManagerCommentModal(null);
  };

  useEscapeKey(() => {
    if (managerCommentModal && !savingManagerComment && !deletingManagerComment) {
      closeManagerCommentModal();
      return;
    }
    if (qrOrderId && !downloadingQr) {
      setQrOrderId(null);
      return;
    }
    if (showForm && !savingOrder) {
      handleCancel();
    }
  }, Boolean(managerCommentModal || qrOrderId || showForm));

  const saveManagerComment = async () => {
    if (!managerCommentModal?.orderId) return;
    if (savingManagerComment || deletingManagerComment) return;
    setSavingManagerComment(true);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${managerCommentModal.orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: managerCommentModal.draftNotes }),
      });
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось сохранить комментарий менеджера.'));
        return;
      }
      setManagerCommentModal(null);
      await fetchOrders();
    } catch (requestError) {
      setError(requestError.message || 'Не удалось сохранить комментарий менеджера.');
    } finally {
      setSavingManagerComment(false);
    }
  };

  const deleteManagerComment = async () => {
    if (!managerCommentModal?.orderId) return;
    if (savingManagerComment || deletingManagerComment) return;
    setDeletingManagerComment(true);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${managerCommentModal.orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: '' }),
      });
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось удалить комментарий менеджера.'));
        return;
      }
      setManagerCommentModal(null);
      await fetchOrders();
    } catch (requestError) {
      setError(requestError.message || 'Не удалось удалить комментарий менеджера.');
    } finally {
      setDeletingManagerComment(false);
    }
  };

  const closeManagerActionMenu = (event) => {
    event?.currentTarget?.closest('details')?.removeAttribute('open');
  };

  const qrOrder = orders.find(order => order._id === qrOrderId) || null;

  const renderOrderActionMenu = (order, options = {}) => {
    const triggerClassName = [
      'order-number-action-trigger',
      options.mobile ? 'order-number-action-trigger-mobile' : '',
    ].filter(Boolean).join(' ');

    const menuClassName = [
      'manager-actions-dropdown',
      options.mobile ? 'manager-actions-dropdown-mobile' : '',
    ].filter(Boolean).join(' ');

    return (
      <details className="manager-actions-menu order-number-action-menu">
        <summary className={triggerClassName} aria-label={`Действия для заказа ${order.orderNumber || order.name || ''}`}>
          <span className="order-number-action-label">{order.orderNumber || '—'}</span>
          <span className="order-number-action-caret">▾</span>
        </summary>
        <div className={menuClassName}>
          <button
            className="btn manager-actions-dropdown-btn"
            type="button"
            onClick={(event) => {
              handleEdit(order);
              closeManagerActionMenu(event);
            }}
          >
            Редактировать
          </button>
          <button
            className="btn manager-actions-dropdown-btn"
            type="button"
            onClick={(event) => {
              setQrOrderId(order._id);
              closeManagerActionMenu(event);
            }}
          >
            QR-код
          </button>
          <button
            className="btn btn-danger manager-actions-dropdown-btn"
            type="button"
            onClick={(event) => {
              requestDelete(order);
              closeManagerActionMenu(event);
            }}
          >
            Удалить
          </button>
        </div>
      </details>
    );
  };

  return (
    <div>
      <div className="card">
        <div className="section-header">
          <div>
            <h2>📋 Все заказы</h2>
            <p>Управление заказами клиентов</p>
          </div>
          <div className="section-header-actions">
            <button className="btn btn-primary section-toolbar-btn" onClick={openNewForm}>➕ Новый заказ</button>
            <Link to="/archive" className="btn btn-secondary section-toolbar-btn">📦 Архив</Link>
          </div>
        </div>
        {error && <div className="settings-alert settings-alert-error mt-16">{error}</div>}
        <div className="responsive-filters">
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
            <label>Поиск</label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Номер, заказчик, изделие, материал, комментарий"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Статус</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">Все</option>
              <option value="pending">Ожидает</option>
              <option value="in_progress">В работе</option>
              <option value="completed">Завершен</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Ответственный</label>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="all">Все</option>
              {allRoleTabs.map(tab => (
                <option key={tab.key} value={tab.key}>{tab.label.replace(/^[^\s]+\s+/, '')}</option>
              ))}
            </select>
          </div>
          <div className="filters-summary">
            Найдено: {filteredOrders.length}{lastRefreshedAt ? ` · Обновлено ${new Date(lastRefreshedAt).toLocaleTimeString()}` : ''}
          </div>
        </div>
        <div className="table-scroll desktop-table-only">
          <table className="manager-orders-table">
            <thead>
              <tr>
                <th>Номер заказа</th>
                <th>Заказчик</th>
                <th>Наименование</th>
                <th>Кол-во</th>
                <th>Материал</th>
                <th>Дата заказа</th>
                <th>Начало</th>
                <th>Окончание</th>
                <th>Время</th>
                <th>По специалистам</th>
                <th>Комментарий менеджера</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => (
                <tr key={order._id}>
                  <td>{renderOrderActionMenu(order)}</td>
                  <td>{order.customer || '—'}</td>
                  <td><strong>{order.name}</strong></td>
                  <td>{order.quantity || 1}</td>
                  <td>{order.material || '—'}</td>
                  <td className="date-cell">{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}</td>
                  <td className="date-cell">{order.startDate ? new Date(order.startDate).toLocaleDateString() : '—'}</td>
                  <td className="date-cell">{order.endDate ? new Date(order.endDate).toLocaleDateString() : '—'}</td>
                  <td>{calcDuration(order.startDate, order.endDate) || '—'}</td>
                  <td>{renderManagerRoleProgress(order)}</td>
                  <td className="comment-cell">
                    <button
                      className={`manager-comment-trigger ${String(order.notes || '').trim() ? 'manager-comment-trigger-active' : ''}`}
                      onClick={() => openManagerCommentModal(order)}
                    >
                      {String(order.notes || '').trim() ? 'Есть комментарий' : 'Нет комментария'}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && <tr><td colSpan={11} className="empty-cell">Нет заказов</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mobile-card-list">
          {filteredOrders.map(order => {
            const statusMeta = getOrderStatusMeta(order.overallStatus);
            return (
              <div key={order._id} className="mobile-order-card">
                <div className="mobile-order-card-header">
                  <div>
                    <div className="mobile-order-card-title">{order.name}</div>
                    <div className="mobile-order-card-subtitle">
                      {order.orderNumber || 'Без номера'} · {order.customer || 'Заказчик не указан'}
                    </div>
                  </div>
                  <span className={statusMeta.className}>{statusMeta.label}</span>
                </div>

                <div className="mobile-order-card-grid">
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Номер заказа</div>
                    <div className="mobile-order-card-value">{renderOrderActionMenu(order, { mobile: true })}</div>
                  </div>
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Количество</div>
                    <div className="mobile-order-card-value">{order.quantity || 1}</div>
                  </div>
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Материал</div>
                    <div className="mobile-order-card-value">{order.material || '—'}</div>
                  </div>
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Дата заказа</div>
                    <div className="mobile-order-card-value">{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}</div>
                  </div>
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Начало</div>
                    <div className="mobile-order-card-value">{order.startDate ? new Date(order.startDate).toLocaleDateString() : '—'}</div>
                  </div>
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Окончание</div>
                    <div className="mobile-order-card-value">{order.endDate ? new Date(order.endDate).toLocaleDateString() : '—'}</div>
                  </div>
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Время</div>
                    <div className="mobile-order-card-value">{calcDuration(order.startDate, order.endDate) || '—'}</div>
                  </div>
                </div>

                <div className="mobile-order-card-note">
                  <div className="mobile-order-card-label">По специалистам</div>
                  <div>{renderManagerRoleProgress(order)}</div>
                </div>

                <div className="mobile-order-card-note">
                  <div className="mobile-order-card-label">Комментарий менеджера</div>
                  <button
                    className={`manager-comment-trigger ${String(order.notes || '').trim() ? 'manager-comment-trigger-active' : ''}`}
                    onClick={() => openManagerCommentModal(order)}
                  >
                    {String(order.notes || '').trim() ? 'Открыть комментарий' : 'Добавить комментарий'}
                  </button>
                  {order.notes ? (
                    <div className="mobile-order-card-value" style={{ marginTop: 8 }}>
                      {getManagerCommentPreview(order.notes)}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          {filteredOrders.length === 0 && <div className="mobile-empty-state">Нет заказов</div>}
        </div>
      </div>
      {showForm && (
        <div className="modal-overlay" onClick={savingOrder ? undefined : handleCancel}>
          <div className="modal-window modal-window-md" onClick={e => e.stopPropagation()}>
            <div className="modal-title mb-16" style={{ fontSize: 18 }}>{editingId ? '✏️ Редактировать заказ' : '➕ Новый заказ'}</div>
            <div className="responsive-form-grid">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Номер заказа *</label>
                <input
                  value={form.orderNumber}
                  onChange={handleChange('orderNumber')}
                  placeholder="Например: 2026-015"
                  className={formErrors.orderNumber ? 'input-invalid' : ''}
                />
                {formErrors.orderNumber ? <div className="field-error">{formErrors.orderNumber}</div> : null}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Заказчик</label><input value={form.customer} onChange={handleChange('customer')} placeholder="ФИО или название" /></div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Наименование изделия *</label>
                <input
                  value={form.name}
                  onChange={handleChange('name')}
                  placeholder="Например: Шкаф Модерн"
                  className={formErrors.name ? 'input-invalid' : ''}
                />
                {formErrors.name ? <div className="field-error">{formErrors.name}</div> : null}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Кол-во изделий</label>
                <input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={handleChange('quantity')}
                  className={formErrors.quantity ? 'input-invalid' : ''}
                />
                {formErrors.quantity ? <div className="field-error">{formErrors.quantity}</div> : null}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Материал</label><input value={form.material} onChange={handleChange('material')} placeholder="Например: ЛДСП, массив дуба" /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Дата заказа</label><input type="date" value={form.orderDate} disabled className="input-disabled" /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Начало изготовления</label><input type="date" value={form.startDate} onChange={handleChange('startDate')} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Окончание изготовления</label>
                <input type="date" value={form.endDate} onChange={handleChange('endDate')} className={formErrors.endDate ? 'input-invalid' : ''} />
                {formErrors.endDate ? <div className="field-error">{formErrors.endDate}</div> : null}
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}><label>Комментарий менеджера</label><textarea value={form.notes} onChange={handleChange('notes')} placeholder="Комментарий для сотрудника в Telegram и для внутреннего просмотра" rows={3} /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Время изготовления: <strong>{calcDuration(form.startDate, form.endDate) || '—'}</strong></label>
              </div>
            </div>
            {editingId ? (
              <ManagerStagePanel
                stages={formStages}
                activeRole={activeStageRole}
                onRoleChange={setActiveStageRole}
                subtitle="Следите за статусами этапов по каждому специалисту."
                emptyMessage="Для выбранного специалиста этапы пока не настроены."
                roleTabs={allRoleTabs}
              />
            ) : (
              <div className="manager-stage-panel">
                <div className="manager-stage-panel-header">
                  <div className="manager-stage-panel-title">Этапы по специалистам</div>
                  <div className="manager-stage-panel-subtitle">
                    После создания заказа здесь появятся этапы специалистов и их текущие статусы.
                  </div>
                </div>
                <div className="manager-stage-empty">
                  Сначала сохраните заказ. После этого в форме появятся этапы специалистов для отслеживания статусов.
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={handleCancel} disabled={savingOrder}>Отмена</button>
              <button className="btn btn-success" onClick={handleSubmit} disabled={!isFormValid || savingOrder}>{savingOrder ? (editingId ? 'Сохранение...' : 'Создание...') : (editingId ? 'Сохранить' : 'Создать заказ')}</button>
            </div>
          </div>
        </div>
      )}
      {qrOrderId && (
        <div className="modal-overlay" onClick={downloadingQr ? undefined : () => setQrOrderId(null)}>
          <div className="modal-window modal-window-sm" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div className="modal-title mb-16">📱 QR-код заказа {qrOrder?.orderNumber ? `№ ${qrOrder.orderNumber}` : ''}</div>
            <img src={`/api/orders/${qrOrderId}/qrcode`} alt="QR Code" className="qr-image" />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setQrOrderId(null)} disabled={downloadingQr}>Закрыть</button>
              <button className="btn btn-primary" onClick={handleDownloadQr} disabled={downloadingQr}>{downloadingQr ? 'Скачивание...' : '⬇ Скачать'}</button>
            </div>
          </div>
        </div>
      )}
      {managerCommentModal && (
        <div className="modal-overlay" onClick={closeManagerCommentModal}>
          <div className="modal-window modal-window-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Комментарий менеджера</div>
                <div className="modal-subtitle">{managerCommentModal.orderName} · {managerCommentModal.customer}</div>
              </div>
              <button className="btn btn-small modal-close-btn" onClick={closeManagerCommentModal} disabled={savingManagerComment || deletingManagerComment}>
                ✕
              </button>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Текст комментария</label>
              <textarea
                value={managerCommentModal.draftNotes}
                onChange={e => setManagerCommentModal(current => (current ? { ...current, draftNotes: e.target.value } : current))}
                placeholder="Введите комментарий менеджера для сотрудника"
                rows={8}
                autoFocus
                disabled={savingManagerComment || deletingManagerComment}
              />
            </div>

            <div className="modal-actions modal-actions-between">
              <div>
                <button
                  className="btn btn-danger"
                  onClick={deleteManagerComment}
                  disabled={savingManagerComment || deletingManagerComment || !String(managerCommentModal.currentNotes || '').trim()}
                >
                  {deletingManagerComment ? 'Удаление...' : 'Удалить'}
                </button>
              </div>
              <div className="modal-actions-group">
                <button className="btn" onClick={closeManagerCommentModal} disabled={savingManagerComment || deletingManagerComment}>
                  Отмена
                </button>
                <button className="btn btn-success" onClick={saveManagerComment} disabled={savingManagerComment || deletingManagerComment}>
                  {savingManagerComment ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Удалить заказ?"
        message={confirmDelete ? `Заказ "${confirmDelete.name}" будет удален без возможности восстановления.\nЗаказчик: ${confirmDelete.customer}` : ''}
        confirmLabel="Удалить заказ"
        onConfirm={handleDelete}
        onCancel={() => !deletingOrder && setConfirmDelete(null)}
        loading={deletingOrder}
      />
    </div>
  );
}

export default Manager;
