import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import { getOrderStatusMeta } from './statusMeta';

function Manager() {
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({ customer: '', name: '', quantity: 1, material: '', notes: '', orderDate: '', startDate: '', endDate: '' });
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [qrOrderId, setQrOrderId] = useState(null);
  const [error, setError] = useState('');

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
    setForm(prev => {
      const next = { ...prev, [field]: val };
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
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
    setForm({ customer: '', name: '', quantity: 1, material: '', notes: '', orderDate: '', startDate: '', endDate: '' });
    setEditingId(null);
    setShowForm(false);
    fetchOrders();
  };

  const handleEdit = (order) => {
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

  const handleDelete = async (id) => {
    setError('');
    const res = await apiFetch('/api/orders/' + id, { method: 'DELETE' });
    if (!res.ok) {
      setError(await getErrorMessage(res, 'Не удалось удалить заказ.'));
      return;
    }
    if (editingId === id) { setEditingId(null); setForm({ customer: '', name: '', quantity: 1, material: '', notes: '', orderDate: '', startDate: '', endDate: '' }); }
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
    setForm({ customer: '', name: '', quantity: 1, material: '', notes: '', orderDate: '', startDate: '', endDate: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const openNewForm = () => {
    setForm({ customer: '', name: '', quantity: 1, material: '', notes: '', orderDate: new Date().toISOString().split('T')[0], startDate: '', endDate: '' });
    setEditingId(null);
    setShowForm(true);
  };

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>📋 Все заказы</h2>
            <p>Управление заказами клиентов</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-success" style={{ padding: '10px 24px', fontSize: 14 }} onClick={openNewForm}>➕ Новый заказ</button>
            <Link to="/archive" className="btn" style={{ background: '#8e44ad', color: 'white', padding: '10px 24px', fontSize: 14, textDecoration: 'none' }}>📦 Архив</Link>
          </div>
        </div>
        {error && <div style={{ margin: '16px 0 0', padding: '10px 12px', borderRadius: 8, background: '#fdecec', color: '#b42318' }}>{error}</div>}
        <div style={{ overflowX: 'auto' }}>
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
                  <td>
                    <button className="btn btn-primary" style={{ marginRight: 4, padding: '4px 10px', fontSize: 12 }} onClick={() => handleEdit(order)}>✎</button>
                    <button className="btn" style={{ background: '#2c3e50', color: 'white', marginRight: 4, padding: '4px 10px', fontSize: 12 }} onClick={() => setQrOrderId(order._id)}>📱 QR</button>
                    <button className="btn" style={{ background: '#e74c3c', color: 'white', padding: '4px 10px', fontSize: 12 }} onClick={() => handleDelete(order._id)}>✕</button>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: '#999' }}>Нет заказов</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }} onClick={handleCancel}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 560, width: '90%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 16, color: '#2c3e50', fontSize: 18 }}>{editingId ? '✏️ Редактировать заказ' : '➕ Новый заказ'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Заказчик</label><input value={form.customer} onChange={handleChange('customer')} placeholder="ФИО или название" /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Наименование изделия *</label><input value={form.name} onChange={handleChange('name')} placeholder="Например: Шкаф Модерн" /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Кол-во изделий</label><input type="number" min="1" value={form.quantity} onChange={handleChange('quantity')} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Материал</label><input value={form.material} onChange={handleChange('material')} placeholder="Например: ЛДСП, массив дуба" /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Дата заказа</label><input type="date" value={form.orderDate} disabled style={{ background: '#f5f5f5' }} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Начало изготовления</label><input type="date" value={form.startDate} onChange={handleChange('startDate')} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Окончание изготовления</label><input type="date" value={form.endDate} onChange={handleChange('endDate')} /></div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}><label>Примечания</label><textarea value={form.notes} onChange={handleChange('notes')} placeholder="Дополнительная информация" rows={2} /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Время изготовления: <strong>{calcDuration(form.startDate, form.endDate) || '—'}</strong></label>
              </div>
            </div>
            <button className="btn btn-success" style={{ marginRight: 8 }} onClick={handleSubmit}>{editingId ? 'Сохранить' : 'Создать заказ'}</button>
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
    </div>
  );
}

export default Manager;
