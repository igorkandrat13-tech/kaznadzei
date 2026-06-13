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
          <p style={{ color: '#999' }}>Нет настроенных этапов для дизайнера</p>
          <table>
            <thead><tr><th>Изделие</th><th>Статус</th><th>Примечание</th></tr></thead>
            <tbody>
              {orders.map(order => (
                <tr key={order._id}>
                  <td><strong>{order.name}</strong></td>
                  <td><span className="badge">{getOrderStatusMeta('pending').label}</span></td>
                  <td style={{ minWidth: 160, maxWidth: 200 }}>{renderCommentCell(order)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p style={{ color: '#999', marginTop: 15 }}>Нет заказов</p>}
        </>
      )}
    />
  );
}

export default Designer;
