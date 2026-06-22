import React from 'react';
import WorkshopPage from './WorkshopPage';
import { useRoleConfig } from './RoleConfigContext';

const fetchPainterData = async () => {
  const res = await fetch('/api/colors');
  const data = await res.json();
  return { colors: Array.isArray(data) ? data : [] };
};

const getColorForOrder = (colors, orderId) => {
  if (!colors.length) return { name: '—', hex: '#ccc' };
  const hash = orderId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
};

function Painter() {
  const { getRoleMetaByKey } = useRoleConfig();
  const roleMeta = getRoleMetaByKey('painter');
  return (
    <WorkshopPage
      role="painter"
      title={`${roleMeta?.icon || '🎨'} ${roleMeta?.shortTitle || 'Малярный цех'}`}
      description={roleMeta?.description || 'Покраска и финишная обработка изделий'}
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

export default Painter;
