import React from 'react';
import WorkshopPage from './WorkshopPage';

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
  return (
    <WorkshopPage
      role="painter"
      title="🎨 Малярный цех"
      description="Покраска и финишная обработка изделий"
      summaryColumnTitle={null}
      renderSummaryCell={null}
      fetchExtraData={fetchPainterData}
      initialExtraData={{ colors: [] }}
      renderBeforeTable={({ extraData }) => (
        <div style={{ marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(extraData.colors || []).map(color => (
            <span key={color._id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, background: '#f5f5f5' }}>
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: color.hex, border: '1px solid #ddd' }} />
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
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: color.hex, border: '1px solid #ddd' }} />
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
