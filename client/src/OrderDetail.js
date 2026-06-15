import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import { getNextStageStatusMeta, getOrderStatusMeta, getStageStatusMeta, STAGE_STATUS_CYCLE } from './statusMeta';
import {
  closeTelegramWebApp,
  getTelegramInitData,
  getTelegramWebApp,
  isTelegramWebApp,
  markTelegramWebAppSession,
  openTelegramQrScanner,
  persistTelegramInitData,
} from './telegramWebApp';

const ROLE_LABELS = {
  carpenter: 'Столяр',
  assembler: 'Комплектовщик',
  painter: 'Маляр',
  designer: 'Дизайнер',
};

function OrderDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [telegramEmployee, setTelegramEmployee] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [telegramActionError, setTelegramActionError] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [savingStageId, setSavingStageId] = useState('');
  const [stageError, setStageError] = useState('');

  const telegramMode = isTelegramWebApp();
  const telegramInitData = getTelegramInitData();

  const fetchOrder = useCallback(async ({ showLoader = false } = {}) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const res = await apiFetch(`/api/orders/${id}`);
      if (!res.ok) {
        throw new Error('Order not found');
      }
      const data = await parseJsonSafely(res);
      setOrder(data || null);
    } catch {
      setOrder(null);
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    fetchOrder({ showLoader: true });
  }, [fetchOrder]);

  const loadTelegramEmployeeSession = useCallback(() => {
    if (!telegramMode) return;
    if (!telegramInitData) {
      setTelegramEmployee(null);
      setSessionLoading(false);
      setSessionError('Telegram не передал данные сотрудника. Откройте заказ заново через кнопку в боте.');
      return;
    }
    setSessionLoading(true);
    setSessionError('');

    return apiFetch('/api/telegram/webapp/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: telegramInitData }),
    })
      .then(async res => {
        const data = await parseJsonSafely(res);
        if (!res.ok) {
          throw new Error(data?.message || 'Не удалось определить сотрудника Telegram.');
        }
        return data;
      })
      .then(data => setTelegramEmployee(data?.employee || null))
      .catch(error => {
        setTelegramEmployee(null);
        setSessionError(error.message || 'Не удалось определить сотрудника Telegram.');
      })
      .finally(() => setSessionLoading(false));
  }, [telegramInitData, telegramMode]);

  useEffect(() => {
    loadTelegramEmployeeSession();
  }, [loadTelegramEmployeeSession]);

  useEffect(() => {
    if (!telegramMode) return;

    const webApp = getTelegramWebApp();
    if (!webApp) return;

    markTelegramWebAppSession();
    persistTelegramInitData();

    if (typeof webApp.ready === 'function') {
      webApp.ready();
    }

    if (typeof webApp.expand === 'function') {
      webApp.expand();
    }
  }, [telegramMode]);

  useEffect(() => {
    if (!telegramMode) return undefined;

    const refreshOrder = () => {
      fetchOrder();
    };

    const intervalId = window.setInterval(refreshOrder, 10000);
    window.addEventListener('focus', refreshOrder);
    document.addEventListener('visibilitychange', refreshOrder);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshOrder);
      document.removeEventListener('visibilitychange', refreshOrder);
    };
  }, [fetchOrder, telegramMode]);

  const calcDuration = (start, end) => {
    if (!start || !end) return '—';
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff + ' дн.' : '—';
  };

  const statusMeta = getOrderStatusMeta(order?.overallStatus);
  const managerNotes = String(order?.notes || '').trim();
  const currentRoleComment = telegramEmployee?.role
    ? (order?.comments || []).find(comment => comment.role === telegramEmployee.role)?.text || ''
    : '';
  const roleStages = telegramEmployee?.role
    ? (order?.stages || []).filter(stage => stage.role === telegramEmployee.role)
    : [];
  const detailItems = order ? [
    { label: 'Заказчик', value: order.customer || '—' },
    { label: 'Наименование', value: order.name || '—' },
    { label: 'Кол-во изделий', value: order.quantity || 1 },
    { label: 'Материал', value: order.material || '—' },
    { label: 'Дата заказа', value: order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—' },
    { label: 'Начало изготовления', value: order.startDate ? new Date(order.startDate).toLocaleDateString() : '—' },
    { label: 'Окончание изготовления', value: order.endDate ? new Date(order.endDate).toLocaleDateString() : '—' },
    { label: 'Время изготовления', value: calcDuration(order.startDate, order.endDate) },
  ] : [];

  useEffect(() => {
    if (!telegramMode || !telegramEmployee) return;
    setCommentDraft(currentRoleComment);
  }, [currentRoleComment, telegramEmployee, telegramMode]);

  if (loading) {
    return (
      <div className="card">
        <h2>Загрузка заказа...</h2>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="card">
        <h2>🔍 Заказ не найден</h2>
        <p>Проверьте ссылку или обратитесь к менеджеру</p>
      </div>
    );
  }

  const saveTelegramComment = async () => {
    if (!telegramMode || !telegramEmployee) return;

    const text = commentDraft.trim();
    if (!text) {
      setCommentError('Введите текст комментария.');
      return;
    }

    setSavingComment(true);
    setCommentError('');

    const res = await apiFetch(`/api/orders/${id}/telegram-comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: telegramInitData,
        text,
      }),
    });

    if (!res.ok) {
      setCommentError(await getErrorMessage(res, 'Не удалось сохранить комментарий.'));
      setSavingComment(false);
      return;
    }

    await fetchOrder();
    setCommentDraft(text);
    setSavingComment(false);
  };

  const updateTelegramStage = async (stage) => {
    if (!telegramMode || !telegramEmployee || !telegramInitData) {
      setStageError('Не удалось определить сотрудника Telegram для смены статуса.');
      return;
    }

    const nextStatus = STAGE_STATUS_CYCLE[stage.status] || 'pending';
    setSavingStageId(stage.stepId);
    setStageError('');

    const res = await apiFetch(`/api/orders/${id}/telegram-stage-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: telegramInitData,
        stepId: stage.stepId,
        status: nextStatus,
      }),
    });

    if (!res.ok) {
      setStageError(await getErrorMessage(res, 'Не удалось изменить статус этапа.'));
      setSavingStageId('');
      return;
    }

    await fetchOrder();
    setSavingStageId('');
  };

  const handleScanAnotherQr = () => {
    setTelegramActionError('');
    openTelegramQrScanner({
      onSuccess: (orderPath) => navigate(orderPath),
      onError: setTelegramActionError,
    });
  };

  const handleCloseTelegramApp = () => {
    if (!closeTelegramWebApp()) {
      navigate('/telegram-app');
    }
  };

  return (
    <div className={`card order-detail-card${telegramMode ? ' telegram-order-card' : ''}`}>
      <h2>{telegramMode ? `Заказ: ${order.name}` : `📋 Заказ: ${order.name}`}</h2>
      {telegramMode && (
        <p className="telegram-order-subtitle">Просмотр заказа в Telegram Web App.</p>
      )}

      {telegramMode && (
        <div className="telegram-order-actions">
          <button className="btn btn-primary" onClick={handleScanAnotherQr}>
            Сканировать другой QR-код
          </button>
          <button className="btn" onClick={handleCloseTelegramApp}>
            Закрыть и вернуться в бот
          </button>
        </div>
      )}

      {telegramActionError && (
        <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
          {telegramActionError}
        </div>
      )}

      {telegramMode ? (
        <>
          <div className="telegram-order-summary">
            <div className="telegram-order-summary-label">Статус заказа</div>
            <div className="telegram-order-summary-value">
              <span className={statusMeta.className}>{statusMeta.label}</span>
            </div>
          </div>

          <div className="telegram-order-grid">
            {detailItems.map((item) => (
              <div key={item.label} className="detail-block">
                <div className="detail-label">{item.label}</div>
                <div className="detail-value">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="detail-block detail-block-wide">
            <div className="detail-label">Примечания менеджера</div>
            <div className="detail-value detail-value-multiline">
              {managerNotes || 'Менеджер пока не добавил примечание.'}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
              Данные заказа обновляются автоматически.
            </div>
          </div>

          <div className="telegram-stage-section">
            <div className="telegram-comment-title">Статус по вашей роли</div>

            {stageError && (
              <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
                {stageError}
              </div>
            )}

            {!sessionLoading && !telegramEmployee && (
              <div className="telegram-comment-placeholder">
                После определения сотрудника здесь появятся кнопки смены статуса.
              </div>
            )}

            {telegramEmployee && roleStages.length === 0 && (
              <div className="telegram-comment-placeholder">
                Для вашей роли в этом заказе пока нет назначенных этапов.
              </div>
            )}

            {telegramEmployee && roleStages.length > 0 && (
              <div className="telegram-stage-list">
                {roleStages.map((stage) => {
                  const stageMeta = getStageStatusMeta(stage.status);
                  const nextStageMeta = getNextStageStatusMeta(stage.status);
                  return (
                    <div key={stage.stepId} className="telegram-stage-card">
                      <div className="telegram-stage-card-top">
                        <div>
                          <div className="telegram-stage-card-title">{stage.stepName}</div>
                          <div className="telegram-stage-card-subtitle">Текущий статус</div>
                        </div>
                        <span className={stageMeta.className}>{stageMeta.label}</span>
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={() => updateTelegramStage(stage)}
                        disabled={savingStageId === stage.stepId}
                      >
                        {savingStageId === stage.stepId ? 'Обновление...' : `Перевести в "${nextStageMeta.label}"`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="table-scroll">
          <table>
            <tbody>
              <tr><td><strong>Заказчик</strong></td><td>{order.customer || '—'}</td></tr>
              <tr><td><strong>Наименование</strong></td><td>{order.name}</td></tr>
              <tr><td><strong>Кол-во изделий</strong></td><td>{order.quantity || 1}</td></tr>
              <tr><td><strong>Материал</strong></td><td>{order.material || '—'}</td></tr>
              <tr><td><strong>Примечания</strong></td><td>{order.notes || '—'}</td></tr>
              <tr><td><strong>Дата заказа</strong></td><td>{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}</td></tr>
              <tr><td><strong>Начало изготовления</strong></td><td>{order.startDate ? new Date(order.startDate).toLocaleDateString() : '—'}</td></tr>
              <tr><td><strong>Окончание изготовления</strong></td><td>{order.endDate ? new Date(order.endDate).toLocaleDateString() : '—'}</td></tr>
              <tr><td><strong>Время изготовления</strong></td><td>{calcDuration(order.startDate, order.endDate)}</td></tr>
              <tr><td><strong>Статус</strong></td><td><span className={statusMeta.className}>{statusMeta.label}</span></td></tr>
            </tbody>
          </table>
        </div>
      )}

      {telegramMode && (
        <div className="telegram-comment-section">
          <div className="telegram-comment-title">Комментарий сотрудника</div>

          {sessionLoading && (
            <div className="telegram-comment-placeholder">
              Определяю сотрудника Telegram...
            </div>
          )}

          {sessionError && (
            <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
              {sessionError}
            </div>
          )}

          {!sessionLoading && !telegramEmployee && (
            <div className="telegram-comment-placeholder">
              Комментарий сотрудника пока недоступен.
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-primary" onClick={loadTelegramEmployeeSession}>
                  Повторить определение сотрудника
                </button>
              </div>
            </div>
          )}

          {telegramEmployee && (
            <>
              <div className="telegram-comment-meta">
                <div><strong>Сотрудник:</strong> {telegramEmployee.fullName}</div>
                <div><strong>Роль:</strong> {ROLE_LABELS[telegramEmployee.role] || telegramEmployee.role}</div>
              </div>

              <div className="telegram-comment-label">
                Текущий комментарий по вашей роли
              </div>
              <div className={`telegram-comment-current${currentRoleComment ? '' : ' telegram-comment-current-empty'}`}>
                {currentRoleComment || 'Комментарий пока не добавлен.'}
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>{currentRoleComment ? 'Изменить комментарий' : 'Добавить комментарий'}</label>
                <textarea
                  value={commentDraft}
                  onChange={(e) => {
                    setCommentDraft(e.target.value);
                    setCommentError('');
                  }}
                  rows={5}
                  placeholder="Введите комментарий по заказу"
                />
              </div>

              {commentError && (
                <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
                  {commentError}
                </div>
              )}

              <div className="telegram-comment-actions">
                <button className="btn btn-success" onClick={saveTelegramComment} disabled={savingComment}>
                  {savingComment
                    ? 'Сохранение...'
                    : currentRoleComment
                      ? 'Сохранить комментарий'
                      : 'Добавить комментарий'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default OrderDetail;
