import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import { getOrderStatusMeta } from './statusMeta';
import ConfirmDialog from './ConfirmDialog';

const EMPTY_FORM = {
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

function Manager() {
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [qrOrderId, setQrOrderId] = useState(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [managerCommentModal, setManagerCommentModal] = useState(null);
  const [savingManagerComment, setSavingManagerComment] = useState(false);
  const [deletingManagerComment, setDeletingManagerComment] = useState(false);

  const formErrors = validateManagerForm(form);
  const isFormValid = Object.keys(formErrors).length === 0;

  useEffect(() => { fetchOrders(); }, []);

  const fetchOrders = async () => {
    const res = await apiFetch('/api/orders');
    const data = await parseJsonSafely(res);
    setOrders(Array.isArray(data) ? data : []);
  };

  const calcDuration = (start, end) => {
    if (!start || !end) return '';
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff + ' дн.' : '';
  };

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
      setError(formErrors.name || formErrors.quantity || formErrors.endDate || 'Проверьте заполнение формы.');
      return;
    }
    setError('');
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
    fetchOrders();
  };

  const handleEdit = (order) => {
    setError('');
    setForm({
      customer: order.customer || '',
      name: order.name || '',
      quantity: order.quantity || 1,
      material: order.material || '',
      notes: order.notes || '',
      orderDate: order.orderDate || '',
      startDate: order.startDate || '',
      endDate: order.endDate || '',
    });
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
    setDeletingOrder(true);
    setError('');
    const res = await apiFetch('/api/orders/' + confirmDelete.id, { method: 'DELETE' });
    if (!res.ok) {
      setError(await getErrorMessage(res, 'Не удалось удалить заказ.'));
      setDeletingOrder(false);
      return;
    }
    if (editingId === confirmDelete.id) {
      setEditingId(null);
      setForm(EMPTY_FORM);
    }
    setConfirmDelete(null);
    setDeletingOrder(false);
    fetchOrders();
  };

  const handleDownloadQr = async () => {
    const res = await apiFetch(`/api/orders/${qrOrderId}/qrcode`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `order-${qrOrderId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCancel = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const openNewForm = () => {
    setError('');
    setForm({ ...EMPTY_FORM, orderDate: new Date().toISOString().split('T')[0] });
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

  const saveManagerComment = async () => {
    if (!managerCommentModal?.orderId) return;
    setSavingManagerComment(true);
    setError('');
    const res = await apiFetch(`/api/orders/${managerCommentModal.orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: managerCommentModal.draftNotes }),
    });
    if (!res.ok) {
      setError(await getErrorMessage(res, 'Не удалось сохранить комментарий менеджера.'));
      setSavingManagerComment(false);
      return;
    }
    setSavingManagerComment(false);
    setManagerCommentModal(null);
    fetchOrders();
  };

  const deleteManagerComment = async () => {
    if (!managerCommentModal?.orderId) return;
    setDeletingManagerComment(true);
    setError('');
    const res = await apiFetch(`/api/orders/${managerCommentModal.orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: '' }),
    });
    if (!res.ok) {
      setError(await getErrorMessage(res, 'Не удалось удалить комментарий менеджера.'));
      setDeletingManagerComment(false);
      return;
    }
    setDeletingManagerComment(false);
    setManagerCommentModal(null);
    fetchOrders();
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
            <button className="btn btn-success" style={{ padding: '10px 24px', fontSize: 14 }} onClick={openNewForm}>➕ Новый заказ</button>
            <Link to="/archive" className="btn" style={{ background: '#8e44ad', color: 'white', padding: '10px 24px', fontSize: 14, textDecoration: 'none' }}>📦 Архив</Link>
          </div>
        </div>
        {error && <div style={{ margin: '16px 0 0', padding: '10px 12px', borderRadius: 8, background: '#fdecec', color: '#b42318' }}>{error}</div>}
        <div className="table-scroll desktop-table-only">
          <table>
            <thead>
              <tr>
                <th>Заказчик</th>
                <th>Наименование</th>
                <th>Кол-во</th>
                <th>Материал</th>
                <th>Дата заказа</th>
                <th>Начало</th>
                <th>Окончание</th>
                <th>Время</th>
                <th>Статус</th>
                <th>Комментарий менеджера</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order._id}>
                  <td>{order.customer || '—'}</td>
                  <td><strong>{order.name}</strong></td>
                  <td>{order.quantity || 1}</td>
                  <td>{order.material || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{order.startDate ? new Date(order.startDate).toLocaleDateString() : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{order.endDate ? new Date(order.endDate).toLocaleDateString() : '—'}</td>
                  <td>{calcDuration(order.startDate, order.endDate) || '—'}</td>
                  <td>
                    <span className={getOrderStatusMeta(order.overallStatus).className}>
                      {getOrderStatusMeta(order.overallStatus).label}
                    </span>
                  </td>
                  <td style={{ maxWidth: 220, whiteSpace: 'normal', lineHeight: 1.45 }}>
                    <button
                      className={`manager-comment-trigger ${String(order.notes || '').trim() ? 'manager-comment-trigger-active' : ''}`}
                      onClick={() => openManagerCommentModal(order)}
                    >
                      {String(order.notes || '').trim() ? 'Есть комментарий' : 'Нет комментария'}
                    </button>
                  </td>
                  <td>
                    <button className="btn btn-primary" style={{ marginRight: 4, padding: '4px 10px', fontSize: 12 }} onClick={() => handleEdit(order)}>✎</button>
                    <button className="btn" style={{ background: '#2c3e50', color: 'white', marginRight: 4, padding: '4px 10px', fontSize: 12 }} onClick={() => setQrOrderId(order._id)}>📱 QR</button>
                    <button className="btn" style={{ background: '#e74c3c', color: 'white', padding: '4px 10px', fontSize: 12 }} onClick={() => requestDelete(order)}>✕</button>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={11} style={{ textAlign: 'center', color: '#999' }}>Нет заказов</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mobile-card-list">
          {orders.map(order => {
            const statusMeta = getOrderStatusMeta(order.overallStatus);
            return (
              <div key={order._id} className="mobile-order-card">
                <div className="mobile-order-card-header">
                  <div>
                    <div className="mobile-order-card-title">{order.name}</div>
                    <div className="mobile-order-card-subtitle">{order.customer || 'Заказчик не указан'}</div>
                  </div>
                  <span className={statusMeta.className}>{statusMeta.label}</span>
                </div>

                <div className="mobile-order-card-grid">
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

                <div className="mobile-order-card-actions">
                  <button className="btn btn-primary" onClick={() => handleEdit(order)}>Редактировать</button>
                  <button className="btn" style={{ background: '#2c3e50', color: 'white' }} onClick={() => setQrOrderId(order._id)}>QR-код</button>
                  <button className="btn" style={{ background: '#e74c3c', color: 'white' }} onClick={() => requestDelete(order)}>Удалить</button>
                </div>
              </div>
            );
          })}
          {orders.length === 0 && <div className="mobile-empty-state">Нет заказов</div>}
        </div>
      </div>
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }} onClick={handleCancel}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 560, width: '90%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 16, color: '#2c3e50', fontSize: 18 }}>{editingId ? '✏️ Редактировать заказ' : '➕ Новый заказ'}</div>
            <div className="responsive-form-grid">
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
              <div className="form-group" style={{ marginBottom: 0 }}><label>Дата заказа</label><input type="date" value={form.orderDate} disabled style={{ background: '#f5f5f5' }} /></div>
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
            <button className="btn btn-success" style={{ marginRight: 8 }} onClick={handleSubmit} disabled={!isFormValid}>{editingId ? 'Сохранить' : 'Создать заказ'}</button>
            <button className="btn" onClick={handleCancel}>Отмена</button>
          </div>
        </div>
      )}
      {qrOrderId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }} onClick={() => setQrOrderId(null)}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 400, width: '90%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 16, color: '#2c3e50' }}>📱 QR-код заказа</div>
            <img src={`/api/orders/${qrOrderId}/qrcode`} alt="QR Code" style={{ width: 280, height: 280, display: 'block', margin: '0 auto 16px' }} />
            <button className="btn btn-primary" onClick={handleDownloadQr}>⬇ Скачать</button>
            <button className="btn" style={{ marginLeft: 8 }} onClick={() => setQrOrderId(null)}>Закрыть</button>
          </div>
        </div>
      )}
      {managerCommentModal && (
        <div className="modal-overlay" onClick={closeManagerCommentModal}>
          <div className="modal-window" style={{ width: 'min(100%, 640px)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Комментарий менеджера</div>
                <div className="modal-subtitle">{managerCommentModal.orderName} · {managerCommentModal.customer}</div>
              </div>
              <button className="btn" style={{ padding: '6px 10px' }} onClick={closeManagerCommentModal} disabled={savingManagerComment || deletingManagerComment}>
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
              />
            </div>

            <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
              <div>
                <button
                  className="btn"
                  style={{ background: '#e74c3c', color: 'white' }}
                  onClick={deleteManagerComment}
                  disabled={savingManagerComment || deletingManagerComment || !String(managerCommentModal.currentNotes || '').trim()}
                >
                  {deletingManagerComment ? 'Удаление...' : 'Удалить'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
