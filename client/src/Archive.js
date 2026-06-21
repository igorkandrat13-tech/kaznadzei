import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOrderStatusMeta, ORDER_STATUS_OPTIONS } from './statusMeta';
import { roleTabs } from './adminUI';

function getRoleShortLabel(role) {
  return (roleTabs.find(tab => tab.key === role)?.label || role).replace(/^[^\s]+\s+/, '');
}

function getRoleProgressInfo(order, role) {
  const stages = Array.isArray(order?.stages) ? order.stages : [];
  const roleStages = stages.filter(stage => stage.role === role);
  const total = roleStages.length;
  const roleLabel = getRoleShortLabel(role);

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

  return {
    total,
    text: `Этап ${currentStageIndex + 1} из ${total}`,
    title: progressTitle,
    className: `role-progress-badge ${isWaiting ? 'role-progress-badge-pending' : 'role-progress-badge-active'}`,
  };
}

function Archive() {
  const [orders, setOrders] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
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
    if (roleFilter !== 'all') {
      const activeStage = (o.stages || []).find(stage => stage.status === 'in_progress')
        || (o.stages || []).find(stage => stage.status !== 'completed');
      if ((activeStage?.role || '') !== roleFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const match = (o.name + ' ' + (o.customer || '') + ' ' + (o.material || '')).toLowerCase();
      if (!match.includes(q)) return false;
    }
    if (dateFrom && o.startDate && new Date(o.startDate) < new Date(dateFrom)) return false;
    if (dateTo && o.endDate && new Date(o.endDate) > new Date(dateTo)) return false;
    return true;
  });

  const renderArchiveRoleProgress = (order) => {
    const roleProgress = roleTabs
      .map(tab => ({ ...tab, progress: getRoleProgressInfo(order, tab.key) }))
      .filter(item => item.progress.total > 0);

    if (roleProgress.length === 0) {
      return <span className="empty-inline">—</span>;
    }

    return (
      <div className="order-role-progress-list">
        {roleProgress.map(item => (
          <div key={item.key} className="order-role-progress-row">
            <span className="order-role-progress-label">{getRoleShortLabel(item.key)}</span>
            <span className={item.progress.className} title={item.progress.title}>
              {item.progress.text}
            </span>
          </div>
        ))}
      </div>
    );
  };

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
            <label>Ответственный</label>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="all">Все</option>
              {roleTabs.map(tab => (
                <option key={tab.key} value={tab.key}>{tab.label.replace(/^[^\s]+\s+/, '')}</option>
              ))}
            </select>
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
          <table className="archive-table">
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
                <th>По специалистам</th>
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
                  <td>{renderArchiveRoleProgress(order)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={10} className="empty-cell">Нет заказов</td></tr>}
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

                <div className="mobile-order-card-note">
                  <div className="mobile-order-card-label">По специалистам</div>
                  <div>{renderArchiveRoleProgress(order)}</div>
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
