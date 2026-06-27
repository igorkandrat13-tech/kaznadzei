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
    return <Navigate to="/orders" replace />;
  }

  const commonProps = {
    role: roleMeta.key,
    title: `${roleMeta.icon || '🧩'} ${roleMeta.shortTitle || roleMeta.plainLabel}`,
    description: roleMeta.description || '',
    showStages: false,
    summaryColumnTitle: 'Статус',
    renderSummaryCell: (order) => {
      const badge = getOrderStatusMeta(order?.overallStatus || 'pending');
      return <span className={badge.className}>{badge.label}</span>;
    },
  };

  if (roleMeta.key === 'painter') {
    return (
      <WorkshopPage
        {...commonProps}
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
