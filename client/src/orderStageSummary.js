import React from 'react';
import { roleTabs } from './adminUI';

export function getOrderRoleSummary(order) {
  const stages = Array.isArray(order?.stages) ? order.stages : [];

  return roleTabs.map(tab => {
    const roleStages = stages.filter(stage => stage.role === tab.key);
    const completed = roleStages.filter(stage => stage.status === 'completed').length;
    const inProgress = roleStages.filter(stage => stage.status === 'in_progress').length;
    const pending = roleStages.filter(stage => stage.status === 'pending').length;
    const total = roleStages.length;
    return {
      ...tab,
      total,
      completed,
      inProgress,
      pending,
      active: inProgress > 0 || (pending > 0 && completed < total),
    };
  }).filter(item => item.total > 0);
}

export function renderOrderRoleSummary(order) {
  const summary = getOrderRoleSummary(order);
  if (summary.length === 0) {
    return <span className="empty-inline">—</span>;
  }

  return (
    <div className="order-role-summary">
      {summary.map(item => (
        <span
          key={item.key}
          className={`order-role-summary-chip ${item.active ? 'order-role-summary-chip-active' : ''}`}
          title={`${item.label}: завершено ${item.completed}/${item.total}, в работе ${item.inProgress}, ожидает ${item.pending}`}
        >
          {item.label.replace(/^[^\s]+\s+/, '')}: {item.completed}/{item.total}
        </span>
      ))}
    </div>
  );
}
