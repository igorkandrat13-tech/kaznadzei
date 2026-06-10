import React, { useEffect, useState } from 'react';

function Archive() {
  const [orders, setOrders] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/orders')
      .then(res => res.json())
      .then(data => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]));
  }, []);

  const calcDuration = (start, end) => {
    if (!start || !end) return '—';
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff + ' дн.' : '—';
  };

  const filtered = orders.filter(o => {
    if (statusFilter !== 'all' && o.overallStatus !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = (o.name + ' ' + (o.customer || '') + ' ' + (o.material || '')).toLowerCase();
      if (!match.includes(q)) return false;
    }
    if (dateFrom && o.startDate && new Date(o.startDate) < new Date(dateFrom)) return false;
    if (dateTo && o.endDate && new Date(o.endDate) > new Date(dateTo)) return false;
    return true;
  });

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>📦 Архив заказов</h2>
          <button className="btn" onClick={() => window.history.back()}>← Назад</button>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginTop: 16 }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
            <label>Поиск</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Название, заказчик, материал" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Статус</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 'auto', padding: '10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}>
              <option value="all">Все</option>
              <option value="pending">Ожидание</option>
              <option value="in_progress">В работе</option>
              <option value="completed">Завершён</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Дата с</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Дата по</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div style={{ color: '#888', fontSize: 13, paddingBottom: 4 }}>Найдено: {filtered.length}</div>
        </div>
      </div>

      <div className="card">
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
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => (
                <tr key={order._id}>
                  <td>{order.customer || '—'}</td>
                  <td><strong>{order.name}</strong></td>
                  <td>{order.quantity || 1}</td>
                  <td>{order.material || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{order.startDate ? new Date(order.startDate).toLocaleDateString() : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{order.endDate ? new Date(order.endDate).toLocaleDateString() : '—'}</td>
                  <td>{calcDuration(order.startDate, order.endDate) || '—'}</td>
                  <td><span className={order.overallStatus === 'completed' ? 'badge badge-active' : order.overallStatus === 'in_progress' ? 'badge badge-pending' : 'badge'}>{order.overallStatus === 'completed' ? 'Завершён' : order.overallStatus === 'in_progress' ? 'В работе' : 'Ожидание'}</span></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: '#999' }}>Нет заказов</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Archive;