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
  const [savingComment, setSavingComment] = useState(false);
  const [savingStageKey, setSavingStageKey] = useState('');

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

  useEffect(() => {
    const refreshData = () => {
      fetchOrders().catch(() => setOrders([]));

      if (!fetchExtraData) return;
      fetchExtraData()
        .then(data => setExtraData(data || initialExtraData))
        .catch(() => setExtraData(initialExtraData));
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      refreshData();
    };

    const intervalId = window.setInterval(refreshData, 10000);
    window.addEventListener('focus', refreshData);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshData);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [fetchExtraData, initialExtraData]);

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
    if (savingComment || deletingComment) return;
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
    if (savingComment) return;
    setError('');
    setCommentError('');
    setSavingComment(true);
    const res = await apiFetch(`/api/orders/${commentModal.orderId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, text: nextText }),
    });
    if (!res.ok) {
      setCommentError(await getErrorMessage(res, 'Не удалось сохранить примечание.'));
      setSavingComment(false);
      return;
    }
    setSavingComment(false);
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
    const savingKey = `${orderId}:${stage.stepId}`;
    if (savingStageKey === savingKey) return;
    setError('');
    setSavingStageKey(savingKey);
    const res = await apiFetch(`/api/orders/${orderId}/stages/${stage.stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: STAGE_STATUS_CYCLE[stage.status] || 'pending' }),
    });
    if (!res.ok) {
      setError(await getErrorMessage(res, 'Не удалось обновить статус этапа.'));
      setSavingStageKey('');
      return;
    }
    await fetchOrders();
    setSavingStageKey('');
  };

  const renderCommentCell = (order) => {
    const text = getComment(order);
    const isLong = text.length > 40;
    return (
      <div className="workshop-comment-cell">
        <span
          onClick={() => openCommentModal(order, text ? 'replace' : 'create')}
          className={`workshop-comment-text ${text ? 'workshop-comment-text-filled' : 'workshop-comment-text-empty'}`}
          title={text || 'Добавить примечание'}
        >
          {text ? (isLong ? text.slice(0, 40) + '...' : text) : '➕ Добавить'}
        </span>
        <span
          onClick={() => openCommentModal(order, text ? 'replace' : 'create')}
          className="workshop-comment-icon"
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
        disabled={savingStageKey === `${order._id}:${stage.stepId}`}
        aria-label={`Статус "${badge.label}". Нажатие переведет этап в "${nextStatusMeta.label}".`}
      >
        <span className="stage-status-button-label">{badge.label}</span>
        <span className="stage-status-button-next">{savingStageKey === `${order._id}:${stage.stepId}` ? 'Обновление...' : `Нажмите: ${nextStatusMeta.label}`}</span>
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
      {error && <div className="settings-alert settings-alert-error mb-16">{error}</div>}

      {renderBeforeTable ? renderBeforeTable(context) : null}

      {steps.length === 0 ? (
        renderNoSteps ? renderNoSteps(context) : <p className="text-subtle">{emptyStepsText}</p>
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
                    <td>
                      <div className="order-primary-title"><strong>{order.name}</strong></div>
                      <div className="order-primary-subtitle">№ {order.orderNumber || '—'}</div>
                    </td>
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
                {orders.length === 0 && <tr><td colSpan={steps.length + extraColumns.length + (renderSummaryCell !== null ? 3 : 2)} className="empty-cell">{emptyOrdersText}</td></tr>}
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
        <div className="modal-overlay" onClick={() => setPopupText(null)}>
          <div className="modal-window modal-window-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-title mb-10">📝 Примечание</div>
            <div className="modal-note-box">{popupText}</div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setPopupText(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {commentModal && (
        <div className="modal-overlay" onClick={savingComment || deletingComment ? undefined : closeCommentModal}>
          <div className="modal-window modal-window-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">📝 Примечание</div>
                <div className="modal-subtitle">{commentModal.orderName}</div>
              </div>
              <button className="btn btn-small modal-close-btn" onClick={closeCommentModal} disabled={savingComment || deletingComment}>✕</button>
            </div>

            {commentModal.currentText ? (
              <>
                <div className="modal-actions-group mb-12">
                  <button
                    className={`btn ${commentModal.mode !== 'append' ? 'btn-secondary' : ''}`}
                    onClick={() => setCommentMode('replace')}
                    disabled={savingComment || deletingComment}
                  >
                    Редактировать
                  </button>
                  <button
                    className={`btn ${commentModal.mode === 'append' ? 'btn-secondary' : ''}`}
                    onClick={() => setCommentMode('append')}
                    disabled={savingComment || deletingComment}
                  >
                    Добавить текст
                  </button>
                </div>

                <div className="modal-section">
                  <div className="modal-text-meta">Текущий комментарий</div>
                  <div className="modal-note-box">
                    {commentModal.currentText}
                  </div>
                </div>
              </>
            ) : (
              <div className="modal-note-box modal-note-box-muted mb-14">
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
                disabled={savingComment || deletingComment}
              />
            </div>

            {commentError && <div className="settings-alert settings-alert-error">{commentError}</div>}

            <div className="modal-actions modal-actions-between">
              <div>
                {commentModal.currentText && (
                  <button
                    className="btn btn-danger"
                    onClick={() => setConfirmDeleteComment(true)}
                    disabled={savingComment || deletingComment}
                  >
                    Удалить
                  </button>
                )}
              </div>
              <div className="modal-actions-group">
                <button className="btn" onClick={closeCommentModal} disabled={savingComment || deletingComment}>Отмена</button>
                <button className="btn btn-success" onClick={saveComment} disabled={savingComment || deletingComment}>
                  {commentModal.mode === 'append' && commentModal.currentText
                    ? (savingComment ? 'Сохранение...' : 'Добавить в конец')
                    : commentModal.currentText
                      ? (savingComment ? 'Сохранение...' : 'Сохранить изменения')
                      : (savingComment ? 'Сохранение...' : 'Сохранить комментарий')}
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
