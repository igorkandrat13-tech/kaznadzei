import React from 'react';
import WorkshopPage from './WorkshopPage';
import { getOrderStatusMeta } from './statusMeta';

function Designer() {
  return (
    <WorkshopPage
      role="designer"
      title="📐 Дизайнерский отдел"
      description="Разработка дизайна, чертежей и спецификаций"
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
          <p className="text-subtle">Нет настроенных этапов для дизайнера</p>
          <div className="table-scroll desktop-table-only">
            <table>
              <thead><tr><th>Изделие</th><th>Статус</th><th>Примечание</th></tr></thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order._id}>
                    <td><strong>{order.name}</strong></td>
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
                  <div className="mobile-order-card-title">{order.name}</div>
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

export default Designer;
