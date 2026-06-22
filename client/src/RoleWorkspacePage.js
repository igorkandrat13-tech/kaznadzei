import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import WorkshopPage from './WorkshopPage';
import { getOrderStatusMeta } from './statusMeta';
import { useRoleConfig } from './RoleConfigContext';
import { apiFetch, parseJsonSafely } from './api';

const fetchPainterData = async () => {
  const res = await apiFetch('/api/colors');
  const data = await parseJsonSafely(res);
  return { colors: Array.isArray(data) ? data : [] };
};

const getColorForOrder = (colors, orderId) => {
  if (!colors.length) return { name: '—', hex: '#ccc' };
  const hash = String(orderId || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
};

function RoleWorkspacePage() {
  const { roleKey } = useParams();
  const { getRoleMetaByKey } = useRoleConfig();
  const roleMeta = getRoleMetaByKey(roleKey);

  if (!roleMeta || roleMeta.isDeleted) {
    return <Navigate to="/manager" replace />;
  }

  const commonProps = {
    role: roleMeta.key,
    title: `${roleMeta.icon || '🧩'} ${roleMeta.shortTitle || roleMeta.plainLabel}`,
    description: roleMeta.description || '',
    emptyStepsText: roleMeta.noStepsText || `Нет настроенных этапов для роли "${roleMeta.plainLabel}"`,
  };

  if (roleMeta.key === 'designer') {
    return (
      <WorkshopPage
        {...commonProps}
        summaryColumnTitle="Статус"
        emptyOrdersText="Нет заказов"
        renderSummaryCell={(order, { steps, findStage }) => {
          const orderStatus = steps.length === 0
            ? 'pending'
            : steps.every(step => findStage(order, step)?.status === 'completed')
              ? 'completed'
              : steps.some(step => findStage(order, step)?.status === 'in_progress')
                ? 'in_progress'
                : 'pending';
          const badge = getOrderStatusMeta(orderStatus);
          return <span className={badge.className}>{badge.label}</span>;
        }}
        renderNoSteps={({ orders, renderCommentCell }) => (
          <>
            <p className="text-subtle">{roleMeta.noStepsText || 'Нет настроенных этапов'}</p>
            <div className="table-scroll desktop-table-only">
              <table>
                <thead><tr><th>Изделие</th><th>Статус</th><th>Примечание</th></tr></thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order._id}>
                      <td>
                        <div className="order-primary-title"><strong>{order.name}</strong></div>
                        <div className="order-primary-subtitle">№ {order.orderNumber || '—'}</div>
                      </td>
                      <td><span className="badge badge-neutral">{getOrderStatusMeta('pending').label}</span></td>
                      <td style={{ minWidth: 160, maxWidth: 200 }}>{renderCommentCell(order)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-card-list">
              {orders.map(order => (
                <div key={order._id} className="mobile-order-card">
                  <div className="mobile-order-card-header">
                    <div>
                      <div className="mobile-order-card-title">{order.name}</div>
                      <div className="mobile-order-card-subtitle">№ {order.orderNumber || '—'}</div>
                    </div>
                    <span className="badge badge-neutral">{getOrderStatusMeta('pending').label}</span>
                  </div>
                  <div className="mobile-order-card-note">
                    <div className="mobile-order-card-label">Примечание</div>
                    <div>{renderCommentCell(order)}</div>
                  </div>
                </div>
              ))}
              {orders.length === 0 && <div className="mobile-empty-state">Нет заказов</div>}
            </div>
            {orders.length === 0 && <p className="desktop-table-only text-subtle mt-16">Нет заказов</p>}
          </>
        )}
      />
    );
  }

  if (roleMeta.key === 'painter') {
    return (
      <WorkshopPage
        {...commonProps}
        summaryColumnTitle={null}
        renderSummaryCell={null}
        fetchExtraData={fetchPainterData}
        initialExtraData={{ colors: [] }}
        renderBeforeTable={({ extraData }) => (
          <div className="color-chip-list">
            {(extraData.colors || []).map(color => (
              <span key={color._id} className="color-chip">
                <span className="color-dot" style={{ background: color.hex }} />
                {color.name}
              </span>
            ))}
          </div>
        )}
        extraColumns={[
          {
            key: 'color',
            header: 'Цвет',
            render: (order, { extraData }) => {
              const color = getColorForOrder(extraData.colors || [], order._id);
              return (
                <span className="color-chip">
                  <span className="color-dot" style={{ background: color.hex }} />
                  {color.name}
                </span>
              );
            },
          },
        ]}
      />
    );
  }

  return <WorkshopPage {...commonProps} />;
}

export default RoleWorkspacePage;
