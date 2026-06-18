import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import { getNextStageStatusMeta, getOrderStatusMeta, getStageStatusMeta, STAGE_STATUS_CYCLE } from './statusMeta';
import {
  closeTelegramWebApp,
  getTelegramEmployeeSessionToken,
  getTelegramInitData,
  getTelegramUnsafeUser,
  getTelegramWebApp,
  isTelegramWebApp,
  markTelegramWebAppSession,
  openTelegramQrScanner,
  persistTelegramInitData,
  persistTelegramUnsafeUser,
  setTelegramEmployeeSessionToken,
} from './telegramWebApp';

const ROLE_LABELS = {
  carpenter: 'Столяр',
  assembler: 'Комплектовщик',
  painter: 'Маляр',
  designer: 'Дизайнер',
};

function isExpiredTelegramSessionMessage(message) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('session token telegram web app')
    && (normalized.includes('истек') || normalized.includes('истёк') || normalized.includes('устарел'));
}

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
  const [commentEditing, setCommentEditing] = useState(false);
  const [savingStageId, setSavingStageId] = useState('');
  const [stageError, setStageError] = useState('');
  const [telegramAuth, setTelegramAuth] = useState({ initData: '', unsafeUser: null });
  const [telegramAuthResolved, setTelegramAuthResolved] = useState(false);
  const [telegramSessionToken, setTelegramSessionTokenState] = useState('');

  const telegramMode = isTelegramWebApp();
  const telegramInitData = telegramAuth.initData;
  const telegramUnsafeUser = telegramAuth.unsafeUser;

  const refreshTelegramAuth = useCallback(() => {
    const nextInitData = persistTelegramInitData() || getTelegramInitData();
    const nextUnsafeUser = persistTelegramUnsafeUser() || getTelegramUnsafeUser();

    setTelegramAuth(current => {
      const sameUnsafeUserId = String(current?.unsafeUser?.id || '') === String(nextUnsafeUser?.id || '');
      if (current.initData === nextInitData && sameUnsafeUserId) {
        return current;
      }
      return {
        initData: nextInitData,
        unsafeUser: nextUnsafeUser,
      };
    });
  }, []);

  useEffect(() => {
    setTelegramSessionTokenState(getTelegramEmployeeSessionToken());
  }, []);

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
    if (!telegramInitData && !telegramUnsafeUser?.id && !telegramSessionToken) {
      if (!telegramAuthResolved) {
        setSessionLoading(true);
        setSessionError('');
        return;
      }
      setTelegramEmployee(null);
      setSessionLoading(false);
      setSessionError('Не удалось подтвердить ваш доступ. Откройте заказ заново через кнопку в боте.');
      return;
    }
    setSessionLoading(true);
    setSessionError('');

    const resolveSession = async (sessionTokenOverride = telegramSessionToken) => {
      const res = await apiFetch('/api/telegram/webapp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: telegramInitData,
          unsafeUser: telegramUnsafeUser,
          sessionToken: sessionTokenOverride,
        }),
      });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось определить ваш профиль.');
      }
      return data;
    };

    return resolveSession()
      .catch(async (error) => {
        const canRetryWithoutToken = telegramSessionToken
          && (telegramInitData || telegramUnsafeUser?.id)
          && isExpiredTelegramSessionMessage(error.message);
        if (!canRetryWithoutToken) {
          throw error;
        }
        setTelegramEmployeeSessionToken('');
        setTelegramSessionTokenState('');
        return resolveSession('');
      })
      .then(data => {
        const nextSessionToken = data?.sessionToken || '';
        setTelegramEmployeeSessionToken(nextSessionToken);
        setTelegramSessionTokenState(nextSessionToken);
        setTelegramEmployee(data?.employee || null);
        setSessionError('');
      })
      .catch(error => {
        setTelegramEmployee(null);
        setSessionError(error.message || 'Не удалось определить ваш профиль.');
      })
      .finally(() => setSessionLoading(false));
  }, [telegramAuthResolved, telegramInitData, telegramMode, telegramSessionToken, telegramUnsafeUser]);

  useEffect(() => {
    loadTelegramEmployeeSession();
  }, [loadTelegramEmployeeSession]);

  useEffect(() => {
    if (!telegramMode) return;

    const webApp = getTelegramWebApp();
    if (!webApp) return;

    markTelegramWebAppSession();
    refreshTelegramAuth();

    if (typeof webApp.ready === 'function') {
      webApp.ready();
    }

    if (typeof webApp.expand === 'function') {
      webApp.expand();
    }

    const retryTimers = [100, 350, 800, 1500].map(delay => window.setTimeout(refreshTelegramAuth, delay));
    const finishTimer = window.setTimeout(() => {
      refreshTelegramAuth();
      setTelegramAuthResolved(true);
    }, 1700);

    return () => {
      retryTimers.forEach(timerId => window.clearTimeout(timerId));
      window.clearTimeout(finishTimer);
    };
  }, [refreshTelegramAuth, telegramMode]);

  useEffect(() => {
    if (!telegramMode) return undefined;

    const handleVisibilityRefresh = () => {
      if (commentEditing) return;
      refreshTelegramAuth();
    };

    window.addEventListener('focus', handleVisibilityRefresh);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      window.removeEventListener('focus', handleVisibilityRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [commentEditing, refreshTelegramAuth, telegramMode]);

  useEffect(() => {
    if (!telegramMode) return undefined;

    const refreshOrder = () => {
      if (commentEditing) return;
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
  }, [commentEditing, fetchOrder, telegramMode]);

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
    if (!telegramMode || !telegramEmployee || commentEditing) return;
    setCommentDraft(currentRoleComment);
  }, [commentEditing, currentRoleComment, telegramEmployee, telegramMode]);

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
    try {
      const res = await apiFetch(`/api/orders/${id}/telegram-comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: telegramInitData,
          unsafeUser: telegramUnsafeUser,
          sessionToken: telegramSessionToken,
          text,
        }),
      });

      if (!res.ok) {
        setCommentError(await getErrorMessage(res, 'Не удалось сохранить комментарий.'));
        return;
      }

      await fetchOrder();
      setCommentDraft(text);
      setCommentEditing(false);
    } finally {
      setSavingComment(false);
    }
  };

  const updateTelegramStage = async (stage) => {
    if (!telegramMode || !telegramEmployee || (!telegramInitData && !telegramUnsafeUser?.id && !telegramSessionToken)) {
      setStageError('Не удалось определить ваш профиль для смены статуса.');
      return;
    }

    const nextStatus = STAGE_STATUS_CYCLE[stage.status] || 'pending';
    setSavingStageId(stage.stepId);
    setStageError('');
    try {
      const res = await apiFetch(`/api/orders/${id}/telegram-stage-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: telegramInitData,
          unsafeUser: telegramUnsafeUser,
          sessionToken: telegramSessionToken,
          stepId: stage.stepId,
          status: nextStatus,
        }),
      });

      if (!res.ok) {
        setStageError(await getErrorMessage(res, 'Не удалось изменить статус этапа.'));
        return;
      }

      await fetchOrder();
    } finally {
      setSavingStageId('');
    }
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
        <p className="telegram-order-subtitle">Актуальная информация по заказу.</p>
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
            <div className="mt-8 text-small text-subtle">
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
                После проверки доступа здесь появятся кнопки смены статуса.
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
              Проверяю доступ...
            </div>
          )}

          {sessionError && (
            <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
              {sessionError}
            </div>
          )}

          {!sessionLoading && !telegramEmployee && (
            <div className="telegram-comment-placeholder">
              Комментарий пока недоступен.
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-primary" onClick={loadTelegramEmployeeSession}>
                  {sessionLoading ? 'Проверка...' : 'Повторить проверку'}
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
                  onFocus={() => setCommentEditing(true)}
                  onBlur={() => setCommentEditing(false)}
                  rows={5}
                  placeholder="Введите комментарий по заказу"
                  style={{ fontSize: 16 }}
                  disabled={savingComment}
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
