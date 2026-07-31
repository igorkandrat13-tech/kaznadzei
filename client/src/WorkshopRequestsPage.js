import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, parseJsonSafely, toUserErrorMessage } from './api';
import { formatDateTimeDisplay } from './dateTime';
import { useGlobalErrorEffect } from './globalErrors';
import { Button } from './ui';

function createChecklistItemId() {
  return `check-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function compareOrderNumbersAsc(leftOrder = {}, rightOrder = {}) {
  const leftNumber = String(leftOrder?.orderNumber || '').trim();
  const rightNumber = String(rightOrder?.orderNumber || '').trim();
  if (!leftNumber && !rightNumber) return 0;
  if (!leftNumber) return 1;
  if (!rightNumber) return -1;
  return leftNumber.localeCompare(rightNumber, 'ru', {
    numeric: true,
    sensitivity: 'base',
  });
}

function normalizeItemAttachments(attachments = []) {
  const sourceAttachments = Array.isArray(attachments) ? attachments : [];
  return sourceAttachments.reduce((acc, attachment) => {
    if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return acc;
    const attachmentId = String(attachment.attachmentId || '').trim();
    const name = String(attachment.name || '').trim();
    if (!attachmentId || !name) return acc;
    acc.push({
      attachmentId,
      name,
      type: String(attachment.type || '').trim(),
      size: Number(attachment.size) || 0,
      uploadedAt: String(attachment.uploadedAt || '').trim(),
      url: String(attachment.url || '').trim(),
    });
    return acc;
  }, []);
}

function normalizePackageItems(items = [], legacyPackageName = '') {
  const sourceItems = Array.isArray(items) ? items : [];
  const normalizedItems = sourceItems.reduce((acc, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return acc;
    const name = String(item.name || '').trim();
    if (!name) return acc;
    acc.push({
      id: String(item.id || createChecklistItemId()).trim(),
      name,
      isCompleted: Boolean(item.isCompleted),
      completedAt: item.isCompleted ? (String(item.completedAt || '').trim() || new Date().toISOString().split('T')[0]) : null,
    });
    return acc;
  }, []);
  if (normalizedItems.length > 0) return normalizedItems;

  return String(legacyPackageName || '')
    .split(/[\n,;]+/g)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const isCompleted = /^(\+|\[x\]|x\s+|✓\s+|✔\s+)/i.test(token);
      const normalizedName = token
        .replace(/^(\+|\-|\[x\]|\[\s\]|x\s+|✓\s+|✔\s+)/i, '')
        .trim();
      return {
        id: createChecklistItemId(),
        name: normalizedName || token,
        isCompleted,
        completedAt: isCompleted ? new Date().toISOString().split('T')[0] : null,
      };
    })
    .filter((item) => item.name);
}

function normalizeMaterialRequestItems(items = [], legacyRequests = '') {
  const sourceItems = Array.isArray(items) ? items : [];
  const normalizedItems = sourceItems.reduce((acc, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return acc;
    const name = String(item.name || '').trim();
    if (!name) return acc;
    acc.push({
      id: String(item.id || createChecklistItemId()).trim(),
      name,
      kind: String(item.kind || (Array.isArray(item.attachments) && item.attachments.length > 0 ? 'photo' : 'text')).trim() || 'text',
      comment: String(item.comment || '').trim(),
      isCompleted: Boolean(item.isCompleted),
      completedAt: item.isCompleted ? (String(item.completedAt || '').trim() || new Date().toISOString().split('T')[0]) : null,
      attachments: normalizeItemAttachments(item.attachments),
    });
    return acc;
  }, []);
  if (normalizedItems.length > 0) return normalizedItems;
  return normalizePackageItems(items, legacyRequests).map((item) => ({
    ...item,
    kind: 'text',
    comment: '',
    attachments: [],
  }));
}

function getMaterialRequestItemDisplayName(item = {}) {
  const normalizedName = String(item.name || '').trim();
  if (normalizedName && normalizedName.toLowerCase() !== 'фото') return normalizedName;
  const legacyComment = String(item.comment || '').trim();
  if (legacyComment) return legacyComment;
  const firstAttachmentName = String(item.attachments?.[0]?.name || '').trim();
  if (firstAttachmentName) return firstAttachmentName;
  return normalizedName || 'Фото';
}

function getAttachmentOpenUrl(orderId, itemId, materialRequestItemId, attachment = {}) {
  if (String(attachment.url || '').trim()) {
    return String(attachment.url || '').trim();
  }
  const attachmentId = String(attachment.attachmentId || '').trim();
  if (!orderId || !itemId || !materialRequestItemId || !attachmentId) return '';
  return `/api/orders/${orderId}/items/${itemId}/material-request-items/${materialRequestItemId}/attachments/${attachmentId}/file`;
}

function getUnifiedSourceLabel(source = '') {
  if (source === 'package') return 'Комплектация';
  if (source === 'material') return 'Расходники';
  return 'Цех';
}

function buildRequestRows(orders = [], workshopRequests = []) {
  const workshopRows = (Array.isArray(workshopRequests) ? workshopRequests : []).map((request) => ({
    key: `workshop:${request._id}`,
    source: 'workshop',
    sourceLabel: getUnifiedSourceLabel('workshop'),
    status: String(request.status || '').trim() === 'completed' ? 'completed' : 'open',
    text: String(request.text || '').trim(),
    orderNumber: '',
    customer: '',
    room: '',
    itemNumber: '',
    itemName: '',
    author: String(request.employeeName || '').trim(),
    createdAt: String(request.createdAt || '').trim(),
    updatedAt: String(request.updatedAt || '').trim(),
    attachmentsCount: 0,
    openUrl: '',
    requestId: String(request._id || '').trim(),
    toggleKind: 'workshop',
    canToggleStatus: true,
  }));

  const orderRows = [...(Array.isArray(orders) ? orders : [])]
    .sort(compareOrderNumbersAsc)
    .flatMap((order) => {
      const orderItems = Array.isArray(order.items) ? order.items : [];
      return orderItems.flatMap((item) => {
        const packageRows = normalizePackageItems(item.packageItems, item.packageName).map((packageItem) => ({
          key: `package:${order._id}:${item.itemId}:${packageItem.id}`,
          source: 'package',
          sourceLabel: getUnifiedSourceLabel('package'),
          status: packageItem.isCompleted ? 'completed' : 'open',
          text: packageItem.name,
          orderNumber: String(order.orderNumber || '').trim(),
          customer: String(order.customer || '').trim(),
          room: String(item.room || '').trim(),
          itemNumber: String(item.itemNumber || '').trim(),
          itemName: String(item.name || '').trim(),
          author: '',
          createdAt: String(packageItem.completedAt || item.updatedAt || order.updatedAt || order.createdAt || '').trim(),
          updatedAt: String(item.updatedAt || order.updatedAt || order.createdAt || '').trim(),
          attachmentsCount: 0,
          openUrl: '',
          requestId: '',
          toggleKind: '',
          canToggleStatus: false,
        }));

        const materialRows = normalizeMaterialRequestItems(item.materialRequestItems, item.materialRequests).map((requestItem) => {
          const firstAttachment = Array.isArray(requestItem.attachments) ? requestItem.attachments[0] : null;
          return {
            key: `material:${order._id}:${item.itemId}:${requestItem.id}`,
            source: 'material',
            sourceLabel: getUnifiedSourceLabel('material'),
            status: requestItem.isCompleted ? 'completed' : 'open',
            text: getMaterialRequestItemDisplayName(requestItem),
            orderNumber: String(order.orderNumber || '').trim(),
            customer: String(order.customer || '').trim(),
            room: String(item.room || '').trim(),
            itemNumber: String(item.itemNumber || '').trim(),
            itemName: String(item.name || '').trim(),
            author: '',
            createdAt: String(requestItem.completedAt || firstAttachment?.uploadedAt || item.updatedAt || order.updatedAt || order.createdAt || '').trim(),
            updatedAt: String(item.updatedAt || order.updatedAt || order.createdAt || '').trim(),
            attachmentsCount: Array.isArray(requestItem.attachments) ? requestItem.attachments.length : 0,
            openUrl: firstAttachment ? getAttachmentOpenUrl(order._id, item.itemId, requestItem.id, firstAttachment) : '',
            requestId: '',
            orderId: String(order._id || '').trim(),
            itemId: String(item.itemId || '').trim(),
            materialRequestItemId: String(requestItem.id || '').trim(),
            toggleKind: 'material',
            canToggleStatus: true,
          };
        });

        return [...packageRows, ...materialRows];
      });
    });

  return [...workshopRows, ...orderRows].sort((left, right) => {
    const leftTime = new Date(left.createdAt || left.updatedAt || 0).getTime();
    const rightTime = new Date(right.createdAt || right.updatedAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function WorkshopRequestsPage() {
  const [orders, setOrders] = useState([]);
  const [workshopRequests, setWorkshopRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [authorFilter, setAuthorFilter] = useState('all');
  const [orderFilter, setOrderFilter] = useState('all');
  const [updatingKey, setUpdatingKey] = useState('');

  useGlobalErrorEffect(error, 'Ошибка раздела заявок.');

  const fetchData = useCallback(async ({ showLoader = true } = {}) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const [ordersRes, requestsRes] = await Promise.all([
        apiFetch('/api/orders'),
        apiFetch('/api/workshop-requests'),
      ]);
      const [ordersData, requestsData] = await Promise.all([
        parseJsonSafely(ordersRes),
        parseJsonSafely(requestsRes),
      ]);
      if (!ordersRes.ok) {
        throw new Error(ordersData?.message || 'Не удалось загрузить заказы.');
      }
      if (!requestsRes.ok) {
        throw new Error(requestsData?.message || 'Не удалось загрузить цеховые заявки.');
      }
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setWorkshopRequests(Array.isArray(requestsData?.items) ? requestsData.items : []);
    } catch (loadError) {
      setError(toUserErrorMessage(loadError, 'Не удалось загрузить сводную таблицу заявок.'));
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData({ showLoader: true });
  }, [fetchData]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (updatingKey) return;
      fetchData({ showLoader: false });
    };

    const intervalId = window.setInterval(refresh, 3000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fetchData, updatingKey]);

  const rows = useMemo(
    () => buildRequestRows(orders, workshopRequests),
    [orders, workshopRequests],
  );

  const authorOptions = useMemo(() => Array.from(new Set(
    rows.map((row) => String(row.author || '').trim()).filter(Boolean),
  )).sort((left, right) => left.localeCompare(right, 'ru', { sensitivity: 'base' })), [rows]);

  const orderOptions = useMemo(() => Array.from(new Set(
    rows.map((row) => String(row.orderNumber || '').trim()).filter(Boolean),
  )).sort((left, right) => left.localeCompare(right, 'ru', { numeric: true, sensitivity: 'base' })), [rows]);

  const filteredRows = useMemo(() => {
    const query = String(search || '').trim().toLowerCase();
    return rows.filter((row) => {
      if (sourceFilter !== 'all' && row.source !== sourceFilter) return false;
      if (authorFilter !== 'all' && row.author !== authorFilter) return false;
      if (orderFilter !== 'all' && row.orderNumber !== orderFilter) return false;
      if (!query) return true;
      const haystack = [
        row.text,
        row.orderNumber,
        row.customer,
        row.room,
        row.itemNumber,
        row.itemName,
        row.author,
        row.sourceLabel,
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [authorFilter, orderFilter, rows, search, sourceFilter]);

  const summary = useMemo(() => ({
    total: rows.length,
    workshop: rows.filter((row) => row.source === 'workshop').length,
    linkedToOrders: rows.filter((row) => row.source !== 'workshop').length,
  }), [rows]);

  const handleToggleRequestStatus = useCallback(async (row) => {
    if (!row?.canToggleStatus) return;
    const nextStatus = row.status === 'completed' ? 'open' : 'completed';
    setUpdatingKey(row.key);
    setError('');
    try {
      let res = null;
      if (row.toggleKind === 'workshop') {
        res = await apiFetch(`/api/workshop-requests/${row.requestId}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: nextStatus }),
        });
      } else if (row.toggleKind === 'material') {
        res = await apiFetch(`/api/orders/${row.orderId}/material-request-items/${row.materialRequestItemId}/toggle`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ itemId: row.itemId }),
        });
      } else {
        return;
      }
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось изменить статус заявки.');
      }
      await fetchData({ showLoader: false });
    } catch (toggleError) {
      setError(toUserErrorMessage(toggleError, 'Не удалось изменить статус заявки.'));
    } finally {
      setUpdatingKey('');
    }
  }, [fetchData]);

  return (
    <div className="workshop-requests-page">
      <div className="card orders-workspace-table-card">
        <div className="section-header">
          <div>
            <h2 style={{ margin: 0 }}>Все заявки</h2>
            <div className="filters-summary">
              Общий реестр цеховых заявок, комплектации заказа и заявок на расходники.
            </div>
          </div>
          <div className="table-action-group">
            <Button
              variant="secondary"
              className="section-toolbar-btn"
              onClick={() => fetchData({ showLoader: false })}
              disabled={loading || Boolean(updatingKey)}
            >
              Обновить
            </Button>
          </div>
        </div>

        <div className="overview-stats-grid" style={{ marginBottom: 16 }}>
          <div className="overview-stat-card">
            <strong>Всего строк</strong>
            {summary.total}
          </div>
          <div className="overview-stat-card">
            <strong>Цеховые</strong>
            {summary.workshop}
          </div>
          <div className="overview-stat-card">
            <strong>По заказам</strong>
            {summary.linkedToOrders}
          </div>
        </div>

        <div className="responsive-filters workshop-requests-filters">
          <label className="workshop-filter-field">
            <span className="workshop-filter-label">Поиск</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Заявка, заказ, изделие, автор"
            />
          </label>
          <label className="workshop-filter-field">
            <span className="workshop-filter-label">Источник</span>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              <option value="all">Все</option>
              <option value="workshop">Цех</option>
              <option value="package">Комплектация</option>
              <option value="material">Расходники</option>
            </select>
          </label>
          <label className="workshop-filter-field">
            <span className="workshop-filter-label">Автор</span>
            <select value={authorFilter} onChange={(event) => setAuthorFilter(event.target.value)}>
              <option value="all">Все</option>
              {authorOptions.map((author) => (
                <option key={author} value={author}>{author}</option>
              ))}
            </select>
          </label>
          <label className="workshop-filter-field">
            <span className="workshop-filter-label">Заказ</span>
            <select value={orderFilter} onChange={(event) => setOrderFilter(event.target.value)}>
              <option value="all">Все</option>
              {orderOptions.map((orderNumber) => (
                <option key={orderNumber} value={orderNumber}>{orderNumber}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="filters-summary" style={{ marginTop: 8 }}>
          Показано строк: {filteredRows.length}
        </div>

        {error ? (
          <div className="settings-alert settings-alert-error" style={{ marginTop: 16 }}>
            {error}
          </div>
        ) : null}

        <div className="table-scroll" style={{ marginTop: 16 }}>
          <table className="unified-orders-table workshop-requests-table">
            <thead>
              <tr>
                <th>Источник</th>
                <th>Чек</th>
                <th>Заявка</th>
                <th>Заказ</th>
                <th>Помещение / изделие</th>
                <th>Автор</th>
                <th>Дата</th>
                <th>Вложения</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="order-card-empty">По текущим фильтрам заявки не найдены.</div>
                  </td>
                </tr>
              ) : null}
              {filteredRows.map((row) => {
                const isUpdating = updatingKey === row.key;
                return (
                  <tr key={row.key}>
                    <td>
                      <span className={`workshop-badge workshop-badge-source workshop-badge-source-${row.source}`}>
                        {row.sourceLabel}
                      </span>
                    </td>
                    <td>
                      {row.canToggleStatus ? (
                        <label className="workshop-check-cell">
                          <input
                            type="checkbox"
                            checked={row.status === 'completed'}
                            onChange={() => handleToggleRequestStatus(row)}
                            disabled={isUpdating}
                          />
                          <span>{isUpdating ? '...' : ''}</span>
                        </label>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="workshop-request-main">
                        {row.openUrl ? (
                          <a href={row.openUrl} target="_blank" rel="noreferrer" className="workshop-request-link">
                            {row.text}
                          </a>
                        ) : (
                          <span>{row.text}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {row.orderNumber ? (
                        <div className="workshop-cell-stack">
                          <strong>№ {row.orderNumber}</strong>
                          <span>{row.customer || 'Без заказчика'}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {row.itemName ? (
                        <div className="workshop-cell-stack">
                          <strong>{row.itemName}</strong>
                          <span>{[row.room, row.itemNumber ? `изд. ${row.itemNumber}` : ''].filter(Boolean).join(' • ') || '—'}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{row.author || '—'}</td>
                    <td>{formatDateTimeDisplay(row.createdAt || row.updatedAt) || '—'}</td>
                    <td>{row.attachmentsCount > 0 ? row.attachmentsCount : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default WorkshopRequestsPage;
