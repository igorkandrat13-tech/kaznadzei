import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOrderStatusMeta, ORDER_STATUS_OPTIONS } from './statusMeta';

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
      <div className="card section-spaced">
        <div className="section-header">
          <div>
            <h2>📦 Архив заказов</h2>
            <p>Фильтрация и просмотр завершенных и текущих заказов без возврата через историю браузера.</p>
          </div>
          <div className="section-header-actions">
            <Link to="/manager" className="btn btn-secondary">К менеджеру</Link>
            <Link to="/admin" className="btn btn-secondary">К админке</Link>
          </div>
        </div>
        <div className="responsive-filters">
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
            <label>Поиск</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Название, заказчик, материал" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Статус</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">Все</option>
              {ORDER_STATUS_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
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
          <div className="filters-summary">Найдено: {filtered.length}</div>
        </div>
      </div>

      <div className="card">
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
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => (
                <tr key={order._id}>
                  <td>{order.customer || '—'}</td>
                  <td><strong>{order.name}</strong></td>
                  <td>{order.quantity || 1}</td>
                  <td>{order.material || '—'}</td>
                  <td className="date-cell">{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}</td>
                  <td className="date-cell">{order.startDate ? new Date(order.startDate).toLocaleDateString() : '—'}</td>
                  <td className="date-cell">{order.endDate ? new Date(order.endDate).toLocaleDateString() : '—'}</td>
                  <td>{calcDuration(order.startDate, order.endDate) || '—'}</td>
                  <td>
                    <span className={getOrderStatusMeta(order.overallStatus).className}>
                      {getOrderStatusMeta(order.overallStatus).label}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="empty-cell">Нет заказов</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mobile-card-list">
          {filtered.map(order => {
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
              </div>
            );
          })}
          {filtered.length === 0 && <div className="mobile-empty-state">Нет заказов</div>}
        </div>
      </div>
    </div>
  );
}

export default Archive;
