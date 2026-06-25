import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import { getOrderStatusMeta, getStageStatusMeta } from './statusMeta';
import {
  buildTelegramOrderPath,
  closeTelegramWebApp,
  getTelegramEmployeeSessionToken,
  getTelegramInitData,
  getTelegramUnsafeUser,
  getTelegramWebApp,
  isTelegramEmployeeSessionTokenExpired,
  isTelegramWebApp,
  markTelegramWebAppSession,
  openTelegramQrScanner,
  persistTelegramInitData,
  persistTelegramUnsafeUser,
  setTelegramEmployeeSessionToken,
} from './telegramWebApp';
import { useRoleConfig } from './RoleConfigContext';

function isRecoverableTelegramSessionMessage(message) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('session token telegram web app')
    && (
      normalized.includes('истек')
      || normalized.includes('истёк')
      || normalized.includes('устарел')
      || normalized.includes('не прош')
      || normalized.includes('некоррект')
      || normalized.includes('непол')
    );
}

function OrderDetail() {
  const { getRoleShortLabel } = useRoleConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const { id, itemId } = useParams();
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
  const [scanActivationError, setScanActivationError] = useState('');
  const [telegramAuth, setTelegramAuth] = useState({ initData: '', unsafeUser: null });
  const [telegramAuthResolved, setTelegramAuthResolved] = useState(false);
  const [telegramSessionBootstrapKey, setTelegramSessionBootstrapKey] = useState(0);
  const telegramSessionTokenRef = useRef(getTelegramEmployeeSessionToken());
  const activatedItemKeyRef = useRef('');

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

  const updateTelegramSessionToken = useCallback((nextToken = '') => {
    const normalizedToken = String(nextToken || '');
    telegramSessionTokenRef.current = normalizedToken;
    setTelegramEmployeeSessionToken(normalizedToken);
  }, []);

  const getActiveTelegramSessionToken = useCallback(() => {
    return telegramSessionTokenRef.current || getTelegramEmployeeSessionToken();
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
    const hasTelegramAuthPayload = Boolean(telegramInitData || telegramUnsafeUser?.id);
    const currentSessionToken = getActiveTelegramSessionToken();
    if (!hasTelegramAuthPayload && !currentSessionToken) {
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

    const resolveSession = async (sessionTokenOverride = currentSessionToken) => {
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
        const canRetryWithoutToken = currentSessionToken
          && hasTelegramAuthPayload
          && isRecoverableTelegramSessionMessage(error.message);
        if (!canRetryWithoutToken) {
          throw error;
        }
        updateTelegramSessionToken('');
        return resolveSession('');
      })
      .then(data => {
        const nextSessionToken = data?.sessionToken || '';
        updateTelegramSessionToken(nextSessionToken);
        setTelegramEmployee(data?.employee || null);
        setSessionError('');
      })
      .catch(error => {
        setTelegramEmployee(null);
        setSessionError(error.message || 'Не удалось определить ваш профиль.');
      })
      .finally(() => setSessionLoading(false));
  }, [getActiveTelegramSessionToken, telegramAuthResolved, telegramInitData, telegramMode, telegramUnsafeUser, updateTelegramSessionToken]);

  useEffect(() => {
    if (!telegramMode) return;

    const params = new URLSearchParams(location.search);
    const sessionTokenFromUrl = params.get('employeeSessionToken');
    if (!sessionTokenFromUrl) return;

    if (!isTelegramEmployeeSessionTokenExpired(sessionTokenFromUrl)) {
      updateTelegramSessionToken(sessionTokenFromUrl);
    } else {
      updateTelegramSessionToken('');
    }
    setTelegramSessionBootstrapKey(current => current + 1);
    params.delete('employeeSessionToken');

    navigate({
      pathname: location.pathname,
      search: params.toString() ? `?${params.toString()}` : '',
    }, { replace: true });
  }, [location.pathname, location.search, navigate, telegramMode, updateTelegramSessionToken]);

  useEffect(() => {
    loadTelegramEmployeeSession();
  }, [loadTelegramEmployeeSession, telegramSessionBootstrapKey]);

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
      if (document.visibilityState === 'hidden') return;
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
      if (document.visibilityState === 'hidden') return;
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

  const selectedItem = order
    ? ((Array.isArray(order.items) ? order.items : []).find(item => item.itemId === itemId)
      || (Array.isArray(order.items) ? order.items[0] : null))
    : null;
  const statusMeta = getOrderStatusMeta(selectedItem?.overallStatus || order?.overallStatus);
  const orderNotes = String(selectedItem?.notes || order?.notes || '').trim();
  const currentRoleComment = telegramEmployee?.role
    ? (selectedItem?.comments || []).find(comment => comment.role === telegramEmployee.role)?.text || ''
    : '';
  const roleStages = telegramEmployee?.role
    ? (selectedItem?.stages || []).filter(stage => stage.role === telegramEmployee.role)
    : [];
  const detailItems = order ? [
    { label: 'Номер заказа', value: order.orderNumber || '—' },
    { label: 'Заказчик', value: order.customer || '—' },
    { label: 'Изделие', value: selectedItem?.name || order.name || '—' },
    { label: '№ изделия в заказе', value: selectedItem?.itemNumber || '—' },
    { label: 'Артикул изделия', value: selectedItem?.productNumber || '—' },
    { label: 'Помещение', value: selectedItem?.room || '—' },
    { label: '№ помещения', value: selectedItem?.roomNumber || '—' },
    { label: 'Кол-во', value: selectedItem?.quantity || order.quantity || 1 },
    { label: 'Материал', value: selectedItem?.material || order.material || '—' },
    { label: 'Комплектация', value: selectedItem?.packageName || '—' },
    { label: 'Отгрузка до', value: selectedItem?.deliveryDate ? new Date(selectedItem.deliveryDate).toLocaleDateString() : '—' },
    { label: 'Дата заказа', value: order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—' },
    { label: 'Начало изготовления', value: order.startDate ? new Date(order.startDate).toLocaleDateString() : '—' },
    { label: 'Окончание изготовления', value: order.endDate ? new Date(order.endDate).toLocaleDateString() : '—' },
    { label: 'Время изготовления', value: calcDuration(order.startDate, order.endDate) },
  ] : [];
  useEffect(() => {
    if (!telegramMode || !telegramEmployee || commentEditing) return;
    setCommentDraft(currentRoleComment);
  }, [commentEditing, currentRoleComment, telegramEmployee, telegramMode]);

  useEffect(() => {
    if (!telegramMode || !telegramEmployee || !selectedItem?.itemId) return;
    const activationKey = `${id}:${selectedItem.itemId}:${telegramEmployee.role}`;
    if (activatedItemKeyRef.current === activationKey) return;

    const activateItem = async () => {
      const sessionToken = getActiveTelegramSessionToken();
      const res = await apiFetch(`/api/orders/${id}/telegram-item-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: telegramInitData,
          unsafeUser: telegramUnsafeUser,
          sessionToken,
          itemId: selectedItem.itemId,
        }),
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, 'Не удалось отметить изделие как взятое в работу.'));
      }
      activatedItemKeyRef.current = activationKey;
      setScanActivationError('');
      await fetchOrder();
    };

    activateItem().catch(error => {
      setScanActivationError(error.message || 'Не удалось отметить изделие как взятое в работу.');
    });
  }, [
    fetchOrder,
    getActiveTelegramSessionToken,
    id,
    selectedItem?.itemId,
    telegramEmployee,
    telegramInitData,
    telegramMode,
    telegramUnsafeUser,
  ]);

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
        <p>Проверьте ссылку или обратитесь к администратору системы</p>
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
      const sessionToken = getActiveTelegramSessionToken();
      const res = await apiFetch(`/api/orders/${id}/telegram-comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: telegramInitData,
          unsafeUser: telegramUnsafeUser,
          sessionToken,
                  itemId: selectedItem?.itemId || '',
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

  const handleScanAnotherQr = () => {
    setTelegramActionError('');
    openTelegramQrScanner({
      onSuccess: (orderPath) => navigate(buildTelegramOrderPath(orderPath)),
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
      <h2>{telegramMode ? `Изделие: ${selectedItem?.name || order.name}` : `📋 Изделие: ${selectedItem?.name || order.name}`}</h2>
      {telegramMode && (
        <p className="telegram-order-subtitle">Актуальная информация по изделию в заказе.</p>
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
            <div className="telegram-order-summary-label">Статус изделия</div>
            <div className="telegram-order-summary-value">
              <span className={statusMeta.className}>{statusMeta.label}</span>
            </div>
          </div>

          {scanActivationError && (
            <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
              {scanActivationError}
            </div>
          )}

          <div className="telegram-order-grid">
            {detailItems.map((item) => (
              <div key={item.label} className="detail-block">
                <div className="detail-label">{item.label}</div>
                <div className="detail-value">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="detail-block detail-block-wide">
            <div className="detail-label">Примечания по заказу</div>
            <div className="detail-value detail-value-multiline">
              {orderNotes || 'Примечание по заказу пока не добавлено.'}
            </div>
            <div className="mt-8 text-small text-subtle">
              Данные заказа обновляются автоматически.
            </div>
          </div>

          <div className="telegram-stage-section">
            <div className="telegram-comment-title">Этапы по вашей роли</div>

            {!sessionLoading && !telegramEmployee && (
              <div className="telegram-comment-placeholder">
                После проверки доступа здесь появится статус изделия по вашей роли.
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
                  return (
                    <div key={stage.stepId} className="telegram-stage-card">
                      <div className="telegram-stage-card-top">
                        <div>
                          <div className="telegram-stage-card-title">{stage.stepName}</div>
                          <div className="telegram-stage-card-subtitle">Текущий статус</div>
                        </div>
                        <span className={stageMeta.className}>{stageMeta.label}</span>
                      </div>
                      <div className="telegram-comment-placeholder" style={{ marginTop: 10 }}>
                        При открытии изделия по QR статус "В работе" выставляется автоматически. Из Telegram доступен только комментарий.
                      </div>
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
              <tr><td><strong>Номер заказа</strong></td><td>{order.orderNumber || '—'}</td></tr>
              <tr><td><strong>Заказчик</strong></td><td>{order.customer || '—'}</td></tr>
              <tr><td><strong>Изделие</strong></td><td>{selectedItem?.name || order.name}</td></tr>
              <tr><td><strong>№ изделия в заказе</strong></td><td>{selectedItem?.itemNumber || '—'}</td></tr>
              <tr><td><strong>Артикул изделия</strong></td><td>{selectedItem?.productNumber || '—'}</td></tr>
              <tr><td><strong>Помещение</strong></td><td>{selectedItem?.room || '—'}</td></tr>
              <tr><td><strong>№ помещения</strong></td><td>{selectedItem?.roomNumber || '—'}</td></tr>
              <tr><td><strong>Кол-во изделий</strong></td><td>{selectedItem?.quantity || order.quantity || 1}</td></tr>
              <tr><td><strong>Материал</strong></td><td>{selectedItem?.material || order.material || '—'}</td></tr>
              <tr><td><strong>Комплектация</strong></td><td>{selectedItem?.packageName || '—'}</td></tr>
              <tr><td><strong>Примечания</strong></td><td>{selectedItem?.notes || order.notes || '—'}</td></tr>
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
                <div><strong>Роль:</strong> {getRoleShortLabel(telegramEmployee.role)}</div>
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
