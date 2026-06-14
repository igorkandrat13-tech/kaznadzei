import React, { useEffect, useState } from 'react';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import { getNextStageStatusMeta, getStageStatusMeta, STAGE_STATUS_CYCLE } from './statusMeta';
import ConfirmDialog from './ConfirmDialog';

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
  const [commentModal, setCommentModal] = useState(null);
  const [commentError, setCommentError] = useState('');
  const [extraData, setExtraData] = useState(initialExtraData);
  const [error, setError] = useState('');
  const [confirmDeleteComment, setConfirmDeleteComment] = useState(false);
  const [deletingComment, setDeletingComment] = useState(false);

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

  const getCommentEntry = (order) => {
    const comments = (order.comments || []).filter(comment => comment.role === role);
    return comments.length > 0 ? comments[comments.length - 1] : null;
  };

  const getComment = (order) => {
    return getCommentEntry(order)?.text || '';
  };

  const closeCommentModal = () => {
    setCommentModal(null);
    setCommentError('');
    setConfirmDeleteComment(false);
  };

  const openCommentModal = (order, mode = 'replace') => {
    const currentText = getComment(order);
    setError('');
    setCommentError('');
    setCommentModal({
      orderId: order._id,
      orderName: order.name,
      currentText,
      draftText: mode === 'append' ? '' : currentText,
      mode: currentText ? mode : 'create',
    });
  };

  const setCommentMode = (mode) => {
    setCommentError('');
    setCommentModal(current => {
      if (!current) return current;
      return {
        ...current,
        mode,
        draftText: mode === 'append' ? '' : current.currentText,
      };
    });
  };

  const saveComment = async () => {
    if (!commentModal) return;
    const nextText = commentModal.mode === 'append' && commentModal.currentText
      ? [commentModal.currentText.trim(), commentModal.draftText.trim()].filter(Boolean).join('\n')
      : commentModal.draftText.trim();
    if (!nextText) {
      setCommentError('Введите текст примечания.');
      return;
    }
    setError('');
    setCommentError('');
    const res = await apiFetch(`/api/orders/${commentModal.orderId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, text: nextText }),
    });
    if (!res.ok) {
      setCommentError(await getErrorMessage(res, 'Не удалось сохранить примечание.'));
      return;
    }
    closeCommentModal();
    await fetchOrders();
  };

  const deleteComment = async () => {
    if (!commentModal?.currentText) return;
    setDeletingComment(true);
    setError('');
    setCommentError('');
    const res = await apiFetch(`/api/orders/${commentModal.orderId}/comments/${encodeURIComponent(role)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      setCommentError(await getErrorMessage(res, 'Не удалось удалить примечание.'));
      setDeletingComment(false);
      return;
    }
    setConfirmDeleteComment(false);
    setDeletingComment(false);
    closeCommentModal();
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
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          onClick={() => openCommentModal(order, text ? 'replace' : 'create')}
          style={{
            cursor: 'pointer',
            fontSize: 13,
            color: text ? '#333' : '#bbb',
            minHeight: 20,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
          title={text || 'Добавить примечание'}
        >
          {text ? (isLong ? text.slice(0, 40) + '...' : text) : '➕ Добавить'}
        </span>
        <span
          onClick={() => openCommentModal(order, text ? 'replace' : 'create')}
          style={{ cursor: 'pointer', fontSize: 14, color: '#999', userSelect: 'none', flexShrink: 0 }}
          title={text ? 'Открыть примечание' : 'Добавить примечание'}
        >
          {text ? '✏️' : '📝'}
        </span>
      </div>
    );
  };

  const renderStageButton = (order, stage) => {
    const badge = getBadgeMeta(stage.status);
    const nextStatusMeta = getNextStageStatusMeta(stage.status);
    return (
      <button
        className={`${badge.className} stage-status-button`}
        onClick={() => updateStage(order._id, stage)}
        aria-label={`Статус "${badge.label}". Нажатие переведет этап в "${nextStatusMeta.label}".`}
      >
        <span className="stage-status-button-label">{badge.label}</span>
        <span className="stage-status-button-next">Нажмите: {nextStatusMeta.label}</span>
      </button>
    );
  };

  const defaultSummaryCell = (order) => {
    const done = steps.filter(step => findStage(order, step)?.status === 'completed').length;
    return <span className="badge badge-active">{done}/{steps.length}</span>;
  };

  const getSummaryCell = (order) => {
    if (renderSummaryCell === null) return null;
    return renderSummaryCell ? renderSummaryCell(order, context) : defaultSummaryCell(order, context);
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
        <>
          <div className="table-scroll desktop-table-only">
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
                      <td>{getSummaryCell(order)}</td>
                    )}
                    <td style={{ minWidth: 160, maxWidth: 200 }}>{renderCommentCell(order)}</td>
                  </tr>
                ))}
                {orders.length === 0 && <tr><td colSpan={steps.length + extraColumns.length + (renderSummaryCell !== null ? 3 : 2)} style={{ textAlign: 'center', color: '#999' }}>{emptyOrdersText}</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="mobile-card-list">
            {orders.map(order => (
              <div key={order._id} className="mobile-order-card">
                <div className="mobile-order-card-header">
                  <div className="mobile-order-card-title">{order.name}</div>
                  {renderSummaryCell !== null && (
                    <div className="mobile-order-card-summary">{getSummaryCell(order)}</div>
                  )}
                </div>

                <div className="mobile-order-stage-list">
                  {steps.map(step => {
                    const stage = findStage(order, step);
                    return (
                      <div key={step._id} className="mobile-order-stage-row">
                        <div className="mobile-order-card-label">{step.stepName}</div>
                        <div className="mobile-order-stage-action">
                          {stage ? renderStageButton(order, stage) : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {extraColumns.length > 0 && (
                  <div className="mobile-order-card-grid">
                    {extraColumns.map(column => (
                      <div key={column.key} className="mobile-order-card-field">
                        <div className="mobile-order-card-label">{column.header}</div>
                        <div className="mobile-order-card-value">{column.render(order, context)}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mobile-order-card-note">
                  <div className="mobile-order-card-label">Примечание</div>
                  <div>{renderCommentCell(order)}</div>
                </div>
              </div>
            ))}
            {orders.length === 0 && <div className="mobile-empty-state">{emptyOrdersText}</div>}
          </div>
        </>
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

      {commentModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={closeCommentModal}>
          <div style={{ background: 'white', borderRadius: 14, padding: 24, maxWidth: 640, width: '92%', boxShadow: '0 12px 44px rgba(0,0,0,0.22)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, color: '#2c3e50', marginBottom: 4 }}>📝 Примечание</div>
                <div style={{ fontSize: 13, color: '#666' }}>{commentModal.orderName}</div>
              </div>
              <button className="btn" style={{ padding: '6px 10px' }} onClick={closeCommentModal}>✕</button>
            </div>

            {commentModal.currentText ? (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <button
                    className="btn"
                    style={{ background: commentModal.mode !== 'append' ? '#2c3e50' : '#f3f4f6', color: commentModal.mode !== 'append' ? 'white' : '#2c3e50' }}
                    onClick={() => setCommentMode('replace')}
                  >
                    Редактировать
                  </button>
                  <button
                    className="btn"
                    style={{ background: commentModal.mode === 'append' ? '#2c3e50' : '#f3f4f6', color: commentModal.mode === 'append' ? 'white' : '#2c3e50' }}
                    onClick={() => setCommentMode('append')}
                  >
                    Добавить текст
                  </button>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Текущий комментарий</div>
                  <div style={{ padding: '12px 14px', background: '#f7f8fa', borderRadius: 10, whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: 14 }}>
                    {commentModal.currentText}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ marginBottom: 14, padding: '12px 14px', background: '#f7f8fa', borderRadius: 10, color: '#666', fontSize: 14 }}>
                Комментарий пока не добавлен. Заполните текст ниже и сохраните его.
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>{commentModal.mode === 'append' && commentModal.currentText ? 'Текст, который нужно добавить' : 'Текст комментария'}</label>
              <textarea
                value={commentModal.draftText}
                onChange={e => {
                  const value = e.target.value;
                  setCommentError('');
                  setCommentModal(current => current ? { ...current, draftText: value } : current);
                }}
                placeholder={commentModal.mode === 'append' && commentModal.currentText ? 'Введите дополнение к текущему комментарию' : 'Введите комментарий'}
                rows={6}
                autoFocus
              />
            </div>

            {commentError && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fdecec', color: '#b42318' }}>{commentError}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                {commentModal.currentText && (
                  <button
                    className="btn"
                    style={{ background: '#e74c3c', color: 'white' }}
                    onClick={() => setConfirmDeleteComment(true)}
                  >
                    Удалить
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" onClick={closeCommentModal}>Отмена</button>
                <button className="btn btn-success" onClick={saveComment}>
                  {commentModal.mode === 'append' && commentModal.currentText
                    ? 'Добавить в конец'
                    : commentModal.currentText
                      ? 'Сохранить изменения'
                      : 'Сохранить комментарий'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmDeleteComment}
        title="Удалить комментарий?"
        message={commentModal ? `Комментарий для заказа "${commentModal.orderName}" будет удален без возможности восстановления.` : ''}
        confirmLabel="Удалить комментарий"
        onConfirm={deleteComment}
        onCancel={() => !deletingComment && setConfirmDeleteComment(false)}
        loading={deletingComment}
      />
    </div>
  );
}

export default WorkshopPage;
