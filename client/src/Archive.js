import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import {
  getOrderOverallStatus,
  getOrderPrimaryMaterial,
  getOrderPrimaryName,
  getOrderPrimaryQuantity,
  getOrderStages,
  isOrderArchived,
} from './orderSelectors';
import { getOrderStatusMeta, ORDER_STATUS_OPTIONS } from './statusMeta';
import { useRoleConfig } from './RoleConfigContext';
import { Button } from './ui';

function getRoleShortLabel(role, roleTabs = []) {
  return roleTabs.find(tab => tab.key === role)?.plainLabel || role;
}

function getRoleProgressInfo(order, role, roleTabs = []) {
  const stages = getOrderStages(order);
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

function Archive() {
  const { roleTabs, allRoleTabs } = useRoleConfig();
  const [orders, setOrders] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [restoringOrder, setRestoringOrder] = useState(false);

  const fetchOrders = useCallback(() => {
    setError('');
    apiFetch('/api/orders')
      .then(res => parseJsonSafely(res))
      .then(data => setOrders(Array.isArray(data) ? data : []))
      .catch(() => {
        setOrders([]);
        setError('Не удалось загрузить архив заказов.');
      });
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const calcDuration = (start, end) => {
    if (!start || !end) return '—';
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff + ' дн.' : '—';
  };

  const filtered = orders
    .filter(o => isOrderArchived(o))
    .filter(o => {
      if (statusFilter !== 'all' && getOrderOverallStatus(o) !== statusFilter) return false;
      if (roleFilter !== 'all') {
        const stages = getOrderStages(o);
        const activeStage = stages.find(stage => stage.status === 'in_progress')
          || stages.find(stage => stage.status !== 'completed');
        if ((activeStage?.role || '') !== roleFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const match = [
          o.orderNumber,
          getOrderPrimaryName(o),
          o.customer,
          getOrderPrimaryMaterial(o),
        ].join(' ').toLowerCase();
        if (!match.includes(q)) return false;
      }
      if (dateFrom && o.startDate && new Date(o.startDate) < new Date(dateFrom)) return false;
      if (dateTo && o.endDate && new Date(o.endDate) > new Date(dateTo)) return false;
      return true;
    })
    .sort((left, right) => new Date(right.archivedAt || right.updatedAt || 0) - new Date(left.archivedAt || left.updatedAt || 0));

  const requestRestore = (order) => {
    setError('');
    setConfirmRestore({
      id: order._id,
      orderNumber: order.orderNumber || '',
      name: getOrderPrimaryName(order) || '',
      customer: order.customer || '',
    });
  };

  const handleRestore = async () => {
    if (!confirmRestore?.id || restoringOrder) return;
    setRestoringOrder(true);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${confirmRestore.id}/restore`, { method: 'POST' });
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось вернуть заказ в работу.'));
        return;
      }
      setConfirmRestore(null);
      fetchOrders();
    } finally {
      setRestoringOrder(false);
    }
  };

  const renderArchiveRoleProgress = (order) => {
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

  return (
    <div>
      <div className="card section-spaced">
        <div className="section-header">
          <div>
            <h2>📦 Архив заказов</h2>
            <p>Здесь отображаются только заказы, которые вручную перенесены в архив после полного завершения.</p>
          </div>
          <div className="section-header-actions">
            <Link to="/orders" className="btn btn-secondary">К заказам</Link>
            <Link to="/settings" className="btn btn-secondary">К настройкам</Link>
          </div>
        </div>
        {error ? (
          <div className="settings-alert settings-alert-error" style={{ marginTop: 12, marginBottom: 0 }}>
            {error}
          </div>
        ) : null}
        <div className="responsive-filters">
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
            <label>Поиск</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Номер, название, заказчик, материал" />
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
              {allRoleTabs.map(tab => (
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
                <th>Номер заказа</th>
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
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => (
                <tr key={order._id}>
                  <td><strong>{order.orderNumber || '—'}</strong></td>
                  <td>{order.customer || '—'}</td>
                  <td><strong>{getOrderPrimaryName(order) || '—'}</strong></td>
                  <td>{getOrderPrimaryQuantity(order)}</td>
                  <td>{getOrderPrimaryMaterial(order) || '—'}</td>
                  <td className="date-cell">{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}</td>
                  <td className="date-cell">{order.startDate ? new Date(order.startDate).toLocaleDateString() : '—'}</td>
                  <td className="date-cell">{order.endDate ? new Date(order.endDate).toLocaleDateString() : '—'}</td>
                  <td>{calcDuration(order.startDate, order.endDate) || '—'}</td>
                  <td>
                    <span className={getOrderStatusMeta(getOrderOverallStatus(order)).className}>
                      {getOrderStatusMeta(getOrderOverallStatus(order)).label}
                    </span>
                  </td>
                  <td>{renderArchiveRoleProgress(order)}</td>
                  <td>
                    <Button
                      variant="success"
                      size="sm"
                      className="archive-order-action-btn"
                      onClick={() => requestRestore(order)}
                      disabled={restoringOrder}
                    >
                      Вернуть в работу
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={12} className="empty-cell">В архиве пока нет заказов</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mobile-card-list">
          {filtered.map(order => {
            const statusMeta = getOrderStatusMeta(getOrderOverallStatus(order));
            return (
              <div key={order._id} className="mobile-order-card">
                <div className="mobile-order-card-header">
                  <div>
                    <div className="mobile-order-card-title">{getOrderPrimaryName(order) || '—'}</div>
                    <div className="mobile-order-card-subtitle">
                      {order.orderNumber || 'Без номера'} · {order.customer || 'Заказчик не указан'}
                    </div>
                  </div>
                  <span className={statusMeta.className}>{statusMeta.label}</span>
                </div>

                <div className="mobile-order-card-grid">
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Номер заказа</div>
                    <div className="mobile-order-card-value">{order.orderNumber || '—'}</div>
                  </div>
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Количество</div>
                    <div className="mobile-order-card-value">{getOrderPrimaryQuantity(order)}</div>
                  </div>
                  <div className="mobile-order-card-field">
                    <div className="mobile-order-card-label">Материал</div>
                    <div className="mobile-order-card-value">{getOrderPrimaryMaterial(order) || '—'}</div>
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
                <div className="archive-mobile-actions">
                  <Button
                    variant="success"
                    size="sm"
                    className="archive-order-action-btn"
                    onClick={() => requestRestore(order)}
                    disabled={restoringOrder}
                  >
                    Вернуть в работу
                  </Button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="mobile-empty-state">В архиве пока нет заказов</div>}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmRestore)}
        title="Вернуть заказ в работу?"
        message={confirmRestore ? `Заказ № ${confirmRestore.orderNumber || '—'} снова появится в рабочей таблице заказов.\nОсновное изделие: ${confirmRestore.name || '—'}\nЗаказчик: ${confirmRestore.customer || '—'}` : ''}
        confirmLabel="Вернуть в работу"
        onConfirm={handleRestore}
        onCancel={() => !restoringOrder && setConfirmRestore(null)}
        loading={restoringOrder}
        variant="primary"
      />
    </div>
  );
}

export default Archive;
