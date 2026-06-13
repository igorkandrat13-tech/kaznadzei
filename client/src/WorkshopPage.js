import React, { useEffect, useState } from 'react';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import { getStageStatusMeta, STAGE_STATUS_CYCLE } from './statusMeta';

function WorkshopPage({
  role,
  title,
  description,
  emptyStepsText = 'Нет настроенных этапов',
  emptyOrdersText = 'Нет заказов',
  summaryColumnTitle = 'Готовность',
  renderSummaryCell,
  renderBeforeTable,
  extraColumns = [],
  renderNoSteps,
  getBadgeMeta = getStageStatusMeta,
  fetchExtraData,
  initialExtraData = {},
}) {
  const [orders, setOrders] = useState([]);
  const [steps, setSteps] = useState([]);
  const [popupText, setPopupText] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [extraData, setExtraData] = useState(initialExtraData);
  const [error, setError] = useState('');

  const fetchOrders = async () => {
    const res = await apiFetch('/api/orders');
    const data = await parseJsonSafely(res);
    setOrders(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    apiFetch('/api/processSteps?role=' + role)
      .then(res => parseJsonSafely(res))
      .then(data => setSteps(Array.isArray(data) ? data : []))
      .catch(() => setSteps([]));

    fetchOrders().catch(() => setOrders([]));

    if (!fetchExtraData) return;
    fetchExtraData()
      .then(data => setExtraData(data || initialExtraData))
      .catch(() => setExtraData(initialExtraData));
  }, [role, fetchExtraData]);

  const findStage = (order, step) => {
    return (order.stages || []).find(stage => stage.stepId === step._id);
  };

  const getComment = (order) => {
    const comments = (order.comments || []).filter(comment => comment.role === role);
    return comments.length > 0 ? comments[comments.length - 1].text : '';
  };

  const saveComment = async (orderId) => {
    if (!commentText.trim()) return;
    setError('');
    const res = await apiFetch(`/api/orders/${orderId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, text: commentText }),
    });
    if (!res.ok) {
      setError(await getErrorMessage(res, 'Не удалось сохранить примечание.'));
      return;
    }
    setEditingId(null);
    setCommentText('');
    await fetchOrders();
  };

  const updateStage = async (orderId, stage) => {
    setError('');
    const res = await apiFetch(`/api/orders/${orderId}/stages/${stage.stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: STAGE_STATUS_CYCLE[stage.status] || 'pending' }),
    });
    if (!res.ok) {
      setError(await getErrorMessage(res, 'Не удалось обновить статус этапа.'));
      return;
    }
    await fetchOrders();
  };

  const renderCommentCell = (order) => {
    const text = getComment(order);
    const isLong = text.length > 40;

    if (editingId === order._id) {
      return (
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            style={{ flex: 1, padding: '4px 8px', fontSize: 12, border: '1px solid #ddd', borderRadius: 4 }}
            placeholder="Примечание..."
            autoFocus
          />
          <button className="btn btn-success" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => saveComment(order._id)}>OK</button>
          <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setEditingId(null)}>✕</button>
        </div>
      );
    }

    if (!text) {
      return (
        <span
          onClick={() => { setEditingId(order._id); setCommentText(text); }}
          style={{ cursor: 'pointer', fontSize: 13, color: '#bbb', display: 'inline-block', minHeight: 20 }}
        >
          ➕ Добавить
        </span>
      );
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          onClick={() => { if (isLong) setPopupText(text); else { setEditingId(order._id); setCommentText(text); } }}
          style={{ cursor: 'pointer', fontSize: 13, color: '#333', minHeight: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={text}
        >
          {isLong ? text.slice(0, 40) + '...' : text}
        </span>
        <span
          onClick={() => { setEditingId(order._id); setCommentText(text); }}
          style={{ cursor: 'pointer', fontSize: 14, color: '#999', userSelect: 'none', flexShrink: 0 }}
          title="Редактировать"
        >
          ✏️
        </span>
      </div>
    );
  };

  const renderStageButton = (order, stage) => {
    const badge = getBadgeMeta(stage.status);
    return (
      <button className={badge.className} onClick={() => updateStage(order._id, stage)} title="Сменить статус этапа">
        {badge.label}
      </button>
    );
  };

  const defaultSummaryCell = (order) => {
    const done = steps.filter(step => findStage(order, step)?.status === 'completed').length;
    return <span className="badge badge-active">{done}/{steps.length}</span>;
  };

  const context = {
    orders,
    steps,
    extraData,
    findStage,
    renderStageButton,
    renderCommentCell,
    setPopupText,
    fetchOrders,
  };

  return (
    <div className="card">
      <h2>{title}</h2>
      <p>{description}</p>
      {error && <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8, background: '#fdecec', color: '#b42318' }}>{error}</div>}

      {renderBeforeTable ? renderBeforeTable(context) : null}

      {steps.length === 0 ? (
        renderNoSteps ? renderNoSteps(context) : <p style={{ color: '#999' }}>{emptyStepsText}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Изделие</th>
              {steps.map(step => <th key={step._id}>{step.stepName}</th>)}
              {extraColumns.map(column => <th key={column.key}>{column.header}</th>)}
              {renderSummaryCell !== null && <th>{summaryColumnTitle}</th>}
              <th>Примечание</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <tr key={order._id}>
                <td><strong>{order.name}</strong></td>
                {steps.map(step => {
                  const stage = findStage(order, step);
                  return <td key={step._id} style={{ textAlign: 'center' }}>{stage ? renderStageButton(order, stage) : '—'}</td>;
                })}
                {extraColumns.map(column => (
                  <td key={column.key} style={column.cellStyle}>
                    {column.render(order, context)}
                  </td>
                ))}
                {renderSummaryCell !== null && (
                  <td>{renderSummaryCell ? renderSummaryCell(order, context) : defaultSummaryCell(order, context)}</td>
                )}
                <td style={{ minWidth: 160, maxWidth: 200 }}>{renderCommentCell(order)}</td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={steps.length + extraColumns.length + (renderSummaryCell !== null ? 3 : 2)} style={{ textAlign: 'center', color: '#999' }}>{emptyOrdersText}</td></tr>}
          </tbody>
        </table>
      )}

      {popupText && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }} onClick={() => setPopupText(null)}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 500, width: '90%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 10, color: '#2c3e50' }}>📝 Примечание</div>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{popupText}</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setPopupText(null)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkshopPage;
