import React from 'react';
import WorkshopPage from './WorkshopPage';

const DESIGNER_BADGE = {
  pending: { className: 'badge', label: '○' },
  in_progress: { className: 'badge badge-pending', label: '● В работе' },
  completed: { className: 'badge badge-active', label: '✓ Готов' },
};

function Designer() {
  return (
    <WorkshopPage
      role="designer"
      title="📐 Дизайнерский отдел"
      description="Разработка дизайна, чертежей и спецификаций"
      summaryColumnTitle="Статус"
      emptyOrdersText="Нет заказов"
      getBadgeMeta={(status) => DESIGNER_BADGE[status] || DESIGNER_BADGE.pending}
      renderSummaryCell={(order, { steps, findStage }) => {
        const isReady = steps.length > 0 && steps.every(step => findStage(order, step)?.status === 'completed');
        return <span className={isReady ? 'badge badge-active' : 'badge badge-pending'}>{isReady ? 'Завершён' : 'В работе'}</span>;
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
                  <td><span className="badge">Ожидание</span></td>
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
