import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import { apiFetch, getErrorMessage, parseJsonSafely, toUserErrorMessage } from './api';
import { canAccessRole, getAppAuthRole } from './appAuth';
import { useGlobalErrorEffect } from './globalErrors';
import { Button, Modal, ModalHeader } from './ui';

function createEmptyCustomerDraft(name = '') {
  return {
    customerId: '',
    fullName: String(name || '').trim(),
    phone: '',
    telegram: '',
    email: '',
    address: '',
    notes: '',
  };
}

function mapCustomerToDraft(customer) {
  return {
    customerId: customer?._id || '',
    fullName: customer?.fullName || '',
    phone: customer?.phone || '',
    telegram: customer?.telegram || '',
    email: customer?.email || '',
    address: customer?.address || '',
    notes: customer?.notes || '',
  };
}

function getCustomerApiMessage({ status = 0, message = '', fallback = 'Не удалось выполнить операцию с карточкой заказчика.' } = {}) {
  const normalizedMessage = String(message || '').trim();
  const loweredMessage = normalizedMessage.toLowerCase();

  if (
    status === 404
    || /cannot\s+(get|post|put|delete)/i.test(normalizedMessage)
    || loweredMessage === 'not found'
    || loweredMessage === 'http 404'
  ) {
    return 'API карточек заказчиков (`/api/customers`) не найден на сервере. Вероятно, backend не обновлён.';
  }
  if (status === 405) {
    return 'Сервер не поддерживает этот метод для карточек заказчиков.';
  }
  if (status === 401) {
    return 'Сессия истекла или вход не выполнен. Войдите снова и повторите действие.';
  }
  if (status === 403) {
    return 'Недостаточно прав для работы с карточками заказчиков.';
  }
  if (status === 503) {
    return normalizedMessage || 'Сервис карточек заказчиков временно недоступен.';
  }
  if (/^<!doctype html|^<html[\s>]/i.test(normalizedMessage)) {
    return 'Сервер вернул HTML вместо ответа API карточек заказчиков. Проверьте proxy и backend.';
  }

  return normalizedMessage || fallback;
}

async function copyTextToClipboard(text) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    throw new Error('Нет текста для копирования.');
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalizedText);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = normalizedText;
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error('Не удалось скопировать ссылку в буфер обмена.');
  }
}

function getTelegramAccessLabel(access = null) {
  if (!access?.hasAccess) {
    return 'PIN еще не создан';
  }

  return [
    access.pinLast4 ? `PIN: ••••${access.pinLast4}` : 'PIN создан',
    access.telegramLinkedAt ? 'Telegram привязан' : 'Telegram еще не привязан',
    Number.isFinite(Number(access.logCount)) ? `логов: ${access.logCount}` : '',
  ].filter(Boolean).join(' · ');
}

function getTelegramAccessStatusMeta(access = null) {
  if (!access?.hasAccess) {
    return {
      label: 'Доступ не создан',
      tone: 'idle',
    };
  }
  if (access.telegramLinkedAt) {
    return {
      label: 'Telegram подключен',
      tone: 'success',
    };
  }
  return {
    label: 'Ожидает привязки',
    tone: 'warning',
  };
}

function normalizeComparableCustomerName(value = '') {
  return String(value || '').trim().toLowerCase();
}

function getReadableOrderStatusLabel(status = '') {
  if (status === 'completed') return 'Завершен';
  if (status === 'in_progress') return 'В работе';
  if (status === 'archived') return 'В архиве';
  return 'Ожидает запуска';
}

function getReadableItemStatusLabel(status = '') {
  if (status === 'completed') return 'Готово';
  if (status === 'in_progress') return 'В работе';
  return 'Ожидает';
}

function getOrderAccessItemsSummary(item = {}, order = null) {
  if (Array.isArray(item?.orderItems) && item.orderItems.length > 0) {
    return item.orderItems;
  }
  return Array.isArray(order?.items)
    ? order.items.map((entry, index) => ({
        itemId: entry?.itemId || '',
        itemNumber: String(entry?.itemNumber || index + 1).trim() || String(index + 1),
        name: String(entry?.name || '').trim() || `Изделие ${index + 1}`,
        room: String(entry?.room || '').trim(),
        roomNumber: String(entry?.roomNumber || '').trim(),
        status: String(entry?.overallStatus || '').trim() || 'pending',
        currentStage: Array.isArray(entry?.stages)
          ? (entry.stages.find((stage) => stage?.status === 'in_progress')?.stepName
            || [...entry.stages].reverse().find((stage) => stage?.status === 'completed')?.stepName
            || '')
          : '',
      }))
    : [];
}

function getAccessItemTitle(item = {}, order = null) {
  const itemCount = Number(item?.itemCount) || (Array.isArray(order?.items) ? order.items.length : 0);
  return [item?.orderNumber || order?.orderNumber || 'Без номера', itemCount > 0 ? `${itemCount} изд.` : '']
    .filter(Boolean)
    .join(' · ');
}

function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [customerDraft, setCustomerDraft] = useState(() => createEmptyCustomerDraft());
  const [customerSaving, setCustomerSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deletingCustomerId, setDeletingCustomerId] = useState('');
  const [confirmTelegramAccessClose, setConfirmTelegramAccessClose] = useState(null);
  const [telegramAccessModal, setTelegramAccessModal] = useState({
    open: false,
    customer: null,
    items: [],
    loading: false,
    error: '',
  });
  const [telegramCredentials, setTelegramCredentials] = useState(null);
  const [telegramLogsModal, setTelegramLogsModal] = useState({
    open: false,
    customer: null,
    order: null,
    access: null,
    logs: [],
    loading: false,
    error: '',
  });
  const [telegramActionLoadingKey, setTelegramActionLoadingKey] = useState('');
  const authRole = getAppAuthRole();
  const canDeleteCustomers = canAccessRole('admin', authRole);
  useGlobalErrorEffect(error, 'Ошибка при работе с заказчиками.');

  const fetchPageData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [customersRes, ordersRes] = await Promise.all([
        apiFetch('/api/customers'),
        apiFetch('/api/orders'),
      ]);
      const [customersData, ordersData] = await Promise.all([
        parseJsonSafely(customersRes),
        parseJsonSafely(ordersRes),
      ]);

      if (!customersRes.ok) {
        throw new Error(getCustomerApiMessage({
          status: customersRes.status,
          message: customersData?.message || customersData?.details || '',
          fallback: 'Не удалось загрузить заказчиков.',
        }));
      }

      if (!ordersRes.ok) {
        throw new Error(await getErrorMessage(ordersRes, 'Не удалось загрузить заказы для связей с заказчиками.'));
      }

      setCustomers(Array.isArray(customersData) ? customersData : []);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
    } catch (fetchError) {
      setCustomers([]);
      setOrders([]);
      setError(toUserErrorMessage(fetchError, 'Не удалось загрузить список заказчиков.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  const customerOrderStats = useMemo(() => orders.reduce((acc, order) => {
    const customerId = String(order?.customerId || '').trim();
    if (!customerId) return acc;
    if (!acc[customerId]) {
      acc[customerId] = { total: 0, active: 0, archived: 0 };
    }
    acc[customerId].total += 1;
    if (order?.archivedAt) {
      acc[customerId].archived += 1;
    } else {
      acc[customerId].active += 1;
    }
    return acc;
  }, {}), [orders]);

  const ordersByCustomerId = useMemo(() => {
    const nextMap = {};
    const uniqueCustomerNameMap = customers.reduce((acc, customer) => {
      const normalizedName = normalizeComparableCustomerName(customer?.fullName);
      if (!normalizedName) return acc;
      acc[normalizedName] = (acc[normalizedName] || 0) + 1;
      return acc;
    }, {});

    for (const order of orders) {
      const linkedCustomerId = String(order?.customerId || '').trim();
      if (linkedCustomerId) {
        if (!nextMap[linkedCustomerId]) {
          nextMap[linkedCustomerId] = [];
        }
        nextMap[linkedCustomerId].push(order);
        continue;
      }

      const normalizedCustomerName = normalizeComparableCustomerName(order?.customer);
      if (!normalizedCustomerName || uniqueCustomerNameMap[normalizedCustomerName] !== 1) {
        continue;
      }

      const matchedCustomer = customers.find((customer) => (
        normalizeComparableCustomerName(customer?.fullName) === normalizedCustomerName
      ));
      if (!matchedCustomer?._id) continue;

      if (!nextMap[matchedCustomer._id]) {
        nextMap[matchedCustomer._id] = [];
      }
      nextMap[matchedCustomer._id].push(order);
    }

    return nextMap;
  }, [customers, orders]);

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = String(search || '').trim().toLowerCase();
    if (!normalizedSearch) return customers;

    return customers.filter((customer) => (
      [
        customer.fullName,
        customer.phone,
        customer.telegram,
        customer.email,
        customer.address,
        customer.notes,
      ].join(' ').toLowerCase().includes(normalizedSearch)
    ));
  }, [customers, search]);

  const fetchCustomerTelegramAccess = useCallback(async (customerId) => {
    const res = await apiFetch(`/api/customers/${customerId}/telegram-access`);
    const data = await parseJsonSafely(res);
    if (!res.ok) {
      throw new Error(getCustomerApiMessage({
        status: res.status,
        message: data?.message || data?.details || '',
        fallback: 'Не удалось загрузить Telegram-доступ заказчика.',
      }));
    }
    return Array.isArray(data?.items) ? data.items : [];
  }, []);

  const openTelegramAccessModal = useCallback(async (customer) => {
    if (!customer?._id) return;
    setTelegramAccessModal({
      open: true,
      customer,
      items: [],
      loading: true,
      error: '',
    });
    try {
      const items = await fetchCustomerTelegramAccess(customer._id);
      setTelegramAccessModal({
        open: true,
        customer,
        items,
        loading: false,
        error: '',
      });
    } catch (modalError) {
      setTelegramAccessModal({
        open: true,
        customer,
        items: [],
        loading: false,
        error: toUserErrorMessage(modalError, 'Не удалось загрузить Telegram-доступ заказчика.'),
      });
    }
  }, [fetchCustomerTelegramAccess]);

  const refreshTelegramAccessModal = useCallback(async (customer) => {
    if (!customer?._id) return [];
    const items = await fetchCustomerTelegramAccess(customer._id);
    setTelegramAccessModal((current) => (
      current.open && current.customer?._id === customer._id
        ? {
            ...current,
            items,
            loading: false,
            error: '',
          }
        : current
    ));
    return items;
  }, [fetchCustomerTelegramAccess]);

  const openCreateEditor = () => {
    setSuccessMessage('');
    setCustomerDraft(createEmptyCustomerDraft());
    setEditorOpen(true);
  };

  const openEditEditor = (customer) => {
    setSuccessMessage('');
    setCustomerDraft(mapCustomerToDraft(customer));
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (customerSaving) return;
    setEditorOpen(false);
    setCustomerDraft(createEmptyCustomerDraft());
  };

  const handleDraftFieldChange = (field) => (event) => {
    const value = event.target.value;
    setCustomerDraft((current) => ({
      ...current,
      [field]: field === 'telegram'
        ? value.replace(/\s+/g, '')
        : value,
    }));
  };

  const handleSaveCustomer = async () => {
    if (customerSaving) return;

    const fullName = String(customerDraft.fullName || '').trim();
    if (!fullName) {
      setError('Укажите имя заказчика.');
      return;
    }

    setCustomerSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      const customerId = String(customerDraft.customerId || '').trim();
      const res = await apiFetch(customerId ? `/api/customers/${customerId}` : '/api/customers', {
        method: customerId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          phone: String(customerDraft.phone || '').trim(),
          telegram: String(customerDraft.telegram || '').trim(),
          email: String(customerDraft.email || '').trim(),
          address: String(customerDraft.address || '').trim(),
          notes: String(customerDraft.notes || '').trim(),
        }),
      });
      const data = await parseJsonSafely(res);

      if (!res.ok) {
        setError(getCustomerApiMessage({
          status: res.status,
          message: data?.message || data?.details || '',
        }));
        return;
      }

      setEditorOpen(false);
      setCustomerDraft(createEmptyCustomerDraft());
      setSuccessMessage(customerId ? 'Карточка заказчика обновлена.' : 'Карточка заказчика создана.');
      await fetchPageData();
    } catch (saveError) {
      setError(saveError.message || 'Не удалось сохранить карточку заказчика.');
    } finally {
      setCustomerSaving(false);
    }
  };

  const requestDeleteCustomer = (customer) => {
    setSuccessMessage('');
    setConfirmDelete(customer);
  };

  const handleDeleteCustomer = async () => {
    const customerId = String(confirmDelete?._id || '').trim();
    if (!customerId || deletingCustomerId) return;

    setDeletingCustomerId(customerId);
    setError('');
    setSuccessMessage('');
    try {
      const res = await apiFetch(`/api/customers/${customerId}`, { method: 'DELETE' });
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        setError(getCustomerApiMessage({
          status: res.status,
          message: data?.message || data?.details || '',
          fallback: 'Не удалось удалить карточку заказчика.',
        }));
        return;
      }

      setConfirmDelete(null);
      setSuccessMessage('Карточка заказчика удалена.');
      await fetchPageData();
    } catch (deleteError) {
      setError(deleteError.message || 'Не удалось удалить карточку заказчика.');
    } finally {
      setDeletingCustomerId('');
    }
  };

  const loadTelegramLogs = useCallback(async (customer, order) => {
    if (!customer?._id || !order?._id) return;
    setTelegramLogsModal({
      open: true,
      customer,
      order,
      access: null,
      logs: [],
      loading: true,
      error: '',
    });
    try {
      const res = await apiFetch(`/api/customers/${customer._id}/telegram-access/${order._id}/logs`);
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(getCustomerApiMessage({
          status: res.status,
          message: data?.message || data?.details || '',
          fallback: 'Не удалось загрузить журнал Telegram-сообщений.',
        }));
      }

      setTelegramLogsModal({
        open: true,
        customer,
        order,
        access: data?.access || null,
        logs: Array.isArray(data?.logs) ? data.logs : [],
        loading: false,
        error: '',
      });
    } catch (logsError) {
      setTelegramLogsModal({
        open: true,
        customer,
        order,
        access: null,
        logs: [],
        loading: false,
        error: toUserErrorMessage(logsError, 'Не удалось загрузить журнал Telegram-сообщений.'),
      });
    }
  }, []);

  const runTelegramAction = useCallback(async ({ customer, order, access, action }) => {
    if (!customer?._id || !order?._id || !action) return;
    const actionKey = `${action}:${order._id}`;
    setTelegramActionLoadingKey(actionKey);
    setError('');
    setSuccessMessage('');

    try {
      if (action === 'logs') {
        await loadTelegramLogs(customer, order);
        return;
      }

      const endpoint = action === 'rotate'
        ? `/api/customers/${customer._id}/telegram-access/${order._id}/regenerate`
        : action === 'revoke'
          ? `/api/customers/${customer._id}/telegram-access/${order._id}/revoke`
          : `/api/customers/${customer._id}/telegram-access/${order._id}/issue`;

      const res = await apiFetch(endpoint, {
        method: 'POST',
      });
      const data = await parseJsonSafely(res);

      if (!res.ok) {
        throw new Error(getCustomerApiMessage({
          status: res.status,
          message: data?.message || data?.details || '',
          fallback: 'Не удалось выполнить действие с Telegram-доступом заказчика.',
        }));
      }

      if (action === 'issue' || action === 'rotate') {
        setTelegramCredentials({
          customer,
          order,
          access: data?.access || null,
          pinCode: data?.pinCode || '',
          deepLinkUrl: data?.deepLinkUrl || '',
          qrDataUrl: data?.qrDataUrl || '',
          botUsername: data?.botUsername || '',
          createdNewCredentials: Boolean(data?.createdNewCredentials || action === 'rotate'),
        });
        setSuccessMessage(
          action === 'rotate'
            ? `PIN для заказа "${order.orderNumber || order._id}" перевыпущен.`
            : (data?.createdNewCredentials
                ? `Доступ для заказа "${order.orderNumber || order._id}" создан.`
                : `Открыт существующий доступ для заказа "${order.orderNumber || order._id}".`)
        );
      }

      if (action === 'revoke') {
        setTelegramCredentials((current) => (
          current?.order?._id === order._id ? null : current
        ));
        setConfirmTelegramAccessClose(null);
        setSuccessMessage(`Доступ для заказа "${order.orderNumber || order._id}" закрыт.`);
      }

      await refreshTelegramAccessModal(customer).catch(() => []);
    } catch (telegramError) {
      setError(toUserErrorMessage(telegramError, 'Не удалось выполнить действие с Telegram-доступом.'));
    } finally {
      setTelegramActionLoadingKey('');
    }
  }, [loadTelegramLogs, refreshTelegramAccessModal]);

  const closeTelegramAccessModal = () => {
    if (telegramActionLoadingKey) return;
    setTelegramAccessModal({
      open: false,
      customer: null,
      items: [],
      loading: false,
      error: '',
    });
  };

  const closeTelegramCredentials = () => {
    setTelegramCredentials(null);
  };

  const closeTelegramLogsModal = () => {
    if (telegramLogsModal.loading) return;
    setTelegramLogsModal({
      open: false,
      customer: null,
      order: null,
      access: null,
      logs: [],
      loading: false,
      error: '',
    });
  };

  const requestTelegramAccessClose = (payload) => {
    setConfirmTelegramAccessClose(payload || null);
  };

  const handleConfirmTelegramAccessClose = async () => {
    if (!confirmTelegramAccessClose?.customer || !confirmTelegramAccessClose?.order) return;
    await runTelegramAction({
      customer: confirmTelegramAccessClose.customer,
      order: confirmTelegramAccessClose.order,
      access: confirmTelegramAccessClose.access,
      action: 'revoke',
    });
  };

  return (
    <div>
      <div className="card section-spaced">
        <div className="section-header">
          <div>
            <h2>Заказчики</h2>
            <p>Единый список заказчиков с поиском, созданием, редактированием и удалением карточек.</p>
          </div>
          <div className="section-header-actions">
            <Button variant="success" onClick={openCreateEditor}>Добавить заказчика</Button>
            <Link to="/orders" className="btn btn-secondary">К заказам</Link>
            {canAccessRole('admin', authRole) ? (
              <Link to="/settings" className="btn btn-secondary">К настройкам</Link>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="settings-alert settings-alert-error" style={{ marginTop: 12, marginBottom: 0 }}>
            {error}
          </div>
        ) : null}
        {successMessage ? (
          <div className="settings-alert settings-alert-success" style={{ marginTop: 12, marginBottom: 0 }}>
            {successMessage}
          </div>
        ) : null}

        <div className="responsive-filters">
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
            <label>Поиск</label>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Имя, телефон, Telegram, email, адрес"
            />
          </div>
          <div className="filters-summary">Всего: {customers.length}</div>
          <div className="filters-summary">Найдено: {filteredCustomers.length}</div>
        </div>
      </div>

      <div className="customer-card-list">
        {loading ? (
          <div className="card">
            <div className="empty-cell">Загружаю список заказчиков...</div>
          </div>
        ) : null}

        {!loading && filteredCustomers.length === 0 ? (
          <div className="card">
            <div className="empty-cell">
              {customers.length === 0
                ? 'Заказчики пока не добавлены.'
                : 'По вашему запросу заказчики не найдены.'}
            </div>
          </div>
        ) : null}

        {!loading && filteredCustomers.map((customer) => {
          const stats = customerOrderStats[customer._id] || { total: 0, active: 0, archived: 0 };
          const customerOrders = ordersByCustomerId[customer._id] || [];
          const telegramButtonsDisabled = customerOrders.length === 0;
          return (
            <div key={customer._id} className="mobile-order-card customer-card">
              <div className="mobile-order-card-header">
                <div>
                  <div className="mobile-order-card-title">{customer.fullName || 'Без имени'}</div>
                  <div className="mobile-order-card-subtitle">
                    {stats.total > 0
                      ? `Связано заказов: ${stats.total} · активных: ${stats.active} · архив: ${stats.archived}`
                      : 'Пока не привязан ни к одному заказу'}
                  </div>
                </div>
              </div>

              <div className="mobile-order-card-grid">
                <div className="mobile-order-card-field">
                  <div className="mobile-order-card-label">Телефон</div>
                  <div className="mobile-order-card-value">{customer.phone || '—'}</div>
                </div>
                <div className="mobile-order-card-field">
                  <div className="mobile-order-card-label">Telegram</div>
                  <div className="mobile-order-card-value">{customer.telegram || '—'}</div>
                </div>
                <div className="mobile-order-card-field">
                  <div className="mobile-order-card-label">Email</div>
                  <div className="mobile-order-card-value">{customer.email || '—'}</div>
                </div>
                <div className="mobile-order-card-field">
                  <div className="mobile-order-card-label">Обновлено</div>
                  <div className="mobile-order-card-value">
                    {customer.updatedAt ? new Date(customer.updatedAt).toLocaleString() : '—'}
                  </div>
                </div>
              </div>

              <div className="mobile-order-card-note customer-card-note customer-card-note-address">
                <div className="mobile-order-card-label">Адрес</div>
                <div className="mobile-order-card-value customer-card-note-value">{customer.address || '—'}</div>
              </div>

              <div className="mobile-order-card-note customer-card-note customer-card-note-notes">
                <div className="mobile-order-card-label">Примечания</div>
                <div className="mobile-order-card-value customer-card-note-value">{customer.notes || '—'}</div>
              </div>

              <div className="customer-card-note customer-card-telegram">
                <div className="mobile-order-card-label">Telegram-доступ к заказу</div>
                <div className="mobile-order-card-value customer-card-note-value">
                  {telegramButtonsDisabled
                    ? 'Сначала привяжите к заказчику хотя бы один заказ.'
                    : (customerOrders.length === 1
                        ? 'Откройте доступ к заказу: внутри будет PIN, ссылка и QR-код для всего заказа.'
                        : 'У заказчика несколько заказов. Откройте модалку и выберите нужный заказ целиком.' )}
                </div>
              </div>

              <div className="customer-card-actions customer-card-actions-telegram">
                <Button disabled={telegramButtonsDisabled} onClick={() => openTelegramAccessModal(customer)}>Доступ заказчика</Button>
              </div>

              <div className="customer-card-actions">
                <Button variant="secondary" onClick={() => openEditEditor(customer)}>Редактировать</Button>
                {canDeleteCustomers ? (
                  <Button variant="danger" onClick={() => requestDeleteCustomer(customer)}>Удалить</Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={telegramAccessModal.open}
        onClose={closeTelegramAccessModal}
        closeDisabled={Boolean(telegramActionLoadingKey)}
        size="lg"
        className="order-form-modal customer-access-modal"
      >
        <ModalHeader
          title="Доступ заказчика"
          subtitle={telegramAccessModal.customer
            ? `Выберите заказ для ${telegramAccessModal.customer.fullName || 'заказчика'} и откройте доступ ко всему заказу.`
            : 'Выберите заказ.'}
          onClose={closeTelegramAccessModal}
          closeDisabled={Boolean(telegramActionLoadingKey)}
        />

        {telegramAccessModal.error ? (
          <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
            {telegramAccessModal.error}
          </div>
        ) : null}

        {telegramAccessModal.loading ? (
          <div className="empty-cell">Загружаю Telegram-доступы по заказам...</div>
        ) : null}

        {!telegramAccessModal.loading && telegramAccessModal.items.length === 0 ? (
          <div className="empty-cell">Для этого заказчика пока нет связанных заказов.</div>
        ) : null}

        {!telegramAccessModal.loading && telegramAccessModal.items.length > 0 ? (
          <div className="customer-telegram-order-list">
            {telegramAccessModal.items.map((item) => {
              const buttonPrefix = item.orderId || item.orderNumber || 'order';
              const order = orders.find((entry) => entry._id === item.orderId) || {
                _id: item.orderId,
                orderNumber: item.orderNumber,
                archivedAt: item.archivedAt,
                items: item.orderItems || [],
              };
              const orderItems = getOrderAccessItemsSummary(item, order);
              const accessStatus = getTelegramAccessStatusMeta(item.access);
              return (
                <div key={item.orderId} className="customer-telegram-order-card">
                  <div className="customer-telegram-order-head">
                    <div>
                      <div className="mobile-order-card-title">
                        {getAccessItemTitle(item, order)}
                      </div>
                      <div className="mobile-order-card-subtitle">
                        {getReadableOrderStatusLabel(item.status)} · {getTelegramAccessLabel(item.access)}
                      </div>
                    </div>
                    <div className={`customer-telegram-status-badge customer-telegram-status-${accessStatus.tone}`}>
                      {accessStatus.label}
                    </div>
                  </div>
                  {orderItems.length > 0 ? (
                    <div className="customer-telegram-order-items">
                      {orderItems.map((orderItem) => (
                        <div key={`${item.orderId}:${orderItem.itemId || orderItem.itemNumber}`} className="customer-telegram-order-item-row">
                          <div className="customer-telegram-order-item-name">
                            {orderItem.itemNumber ? `${orderItem.itemNumber}. ` : ''}{orderItem.name}
                            {orderItem.roomNumber ? ` · пом. ${orderItem.roomNumber}` : (orderItem.room ? ` · ${orderItem.room}` : '')}
                          </div>
                          <div className="customer-telegram-order-item-meta">
                            {getReadableItemStatusLabel(orderItem.status)}
                            {orderItem.currentStage ? ` · ${orderItem.currentStage}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="customer-card-actions customer-card-actions-telegram">
                    <Button
                      disabled={telegramActionLoadingKey === `issue:${buttonPrefix}`}
                      onClick={() => runTelegramAction({
                        customer: telegramAccessModal.customer,
                        order,
                        access: item.access,
                        action: 'issue',
                      })}
                    >
                      {telegramActionLoadingKey === `issue:${buttonPrefix}`
                        ? 'Открытие...'
                        : (item.access?.hasAccess ? 'Открыть доступ' : 'Создать доступ')}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={telegramActionLoadingKey === `logs:${buttonPrefix}`}
                      onClick={() => runTelegramAction({
                        customer: telegramAccessModal.customer,
                        order,
                        access: item.access,
                        action: 'logs',
                      })}
                    >
                      {telegramActionLoadingKey === `logs:${buttonPrefix}` ? 'Загрузка...' : 'Логи'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(telegramCredentials)}
        onClose={closeTelegramCredentials}
        size="lg"
        className="order-form-modal customer-access-modal"
      >
        <ModalHeader
          title="Доступ к заказу"
          subtitle={telegramCredentials
            ? `${telegramCredentials.customer?.fullName || 'Заказчик'} · ${telegramCredentials.order?.orderNumber || 'Без номера'}`
            : 'Данные доступа'}
          onClose={closeTelegramCredentials}
        />

        {telegramCredentials ? (
          <div className={`customer-telegram-status-badge customer-telegram-status-${getTelegramAccessStatusMeta(telegramCredentials.access).tone}`} style={{ marginBottom: 12 }}>
            {getTelegramAccessStatusMeta(telegramCredentials.access).label}
          </div>
        ) : null}

        {telegramCredentials?.pinCode ? (
          <div className="settings-alert settings-alert-success" style={{ marginBottom: 12 }}>
            {telegramCredentials?.createdNewCredentials ? 'PIN доступа: ' : 'Текущий PIN доступа: '}<strong>{telegramCredentials.pinCode}</strong>
          </div>
        ) : null}

        <div className="customer-telegram-access-note">
          Заказчик вводит этот PIN один раз при первой привязке Telegram к заказу.
        </div>

        <div className="customer-telegram-share-grid">
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label>Ссылка в Telegram-бота</label>
            <textarea readOnly rows={3} value={telegramCredentials?.deepLinkUrl || ''} />
          </div>
          <div className="customer-card-actions customer-telegram-inline-actions">
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await copyTextToClipboard(telegramCredentials?.deepLinkUrl || '');
                  setSuccessMessage('Ссылка на Telegram-бота скопирована.');
                } catch (copyError) {
                  setError(toUserErrorMessage(copyError, 'Не удалось скопировать ссылку.'));
                }
              }}
            >
              Скопировать ссылку
            </Button>
            {telegramCredentials?.order?._id ? (
              <Button
                variant="secondary"
                disabled={telegramActionLoadingKey === `rotate:${telegramCredentials.order._id}`}
                onClick={() => runTelegramAction({
                  customer: telegramCredentials.customer,
                  order: telegramCredentials.order,
                  access: telegramCredentials.access,
                  action: 'rotate',
                })}
              >
                {telegramActionLoadingKey === `rotate:${telegramCredentials.order._id}` ? 'Перевыпуск...' : 'Перевыпустить PIN'}
              </Button>
            ) : null}
            {telegramCredentials?.access?.hasAccess ? (
              <Button
                variant="danger"
                disabled={telegramActionLoadingKey === `revoke:${telegramCredentials.order?._id || ''}`}
                onClick={() => requestTelegramAccessClose({
                  customer: telegramCredentials.customer,
                  order: telegramCredentials.order,
                  access: telegramCredentials.access,
                })}
              >
                Закрыть доступ
              </Button>
            ) : null}
          </div>
          <div className="customer-telegram-qr-preview">
            {telegramCredentials?.qrDataUrl ? (
              <img
                src={telegramCredentials.qrDataUrl}
                alt="QR-код доступа к заказу"
                className="customer-telegram-qr-image"
              />
            ) : (
              <div className="empty-cell">QR-код недоступен.</div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={telegramLogsModal.open}
        onClose={closeTelegramLogsModal}
        closeDisabled={telegramLogsModal.loading}
        size="lg"
        className="order-form-modal"
      >
        <ModalHeader
          title="Логи Telegram"
          subtitle={telegramLogsModal.order
            ? `${telegramLogsModal.customer?.fullName || 'Заказчик'} · ${telegramLogsModal.order.orderNumber || 'Без номера'}`
            : 'Журнал отправок заказчику'}
          onClose={closeTelegramLogsModal}
          closeDisabled={telegramLogsModal.loading}
        />

        {telegramLogsModal.error ? (
          <div className="settings-alert settings-alert-error" style={{ marginBottom: 12 }}>
            {telegramLogsModal.error}
          </div>
        ) : null}

        {telegramLogsModal.access ? (
          <div className="settings-alert settings-alert-success" style={{ marginBottom: 12 }}>
            {getTelegramAccessLabel(telegramLogsModal.access)}
          </div>
        ) : null}

        {telegramLogsModal.loading ? (
          <div className="empty-cell">Загружаю журнал отправок...</div>
        ) : null}

        {!telegramLogsModal.loading && telegramLogsModal.logs.length === 0 ? (
          <div className="empty-cell">Отправок по этому заказу пока нет.</div>
        ) : null}

        {!telegramLogsModal.loading && telegramLogsModal.logs.length > 0 ? (
          <div className="customer-telegram-log-list">
            {telegramLogsModal.logs.map((log) => (
              <div key={log._id} className="customer-telegram-log-card">
                <div className="customer-telegram-log-meta">
                  <strong>{log.status === 'sent' ? 'Отправлено' : log.status === 'failed' ? 'Ошибка' : 'Пропущено'}</strong>
                  <span>{log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}</span>
                  <span>{log.type || 'message'}</span>
                </div>
                <div className="customer-telegram-log-text">{log.text || '—'}</div>
                {log.errorMessage ? (
                  <div className="customer-telegram-log-error">{log.errorMessage}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </Modal>

      <Modal open={editorOpen} onClose={closeEditor} closeDisabled={customerSaving} size="lg" className="order-form-modal">
        <ModalHeader
          title={customerDraft.customerId ? 'Редактирование заказчика' : 'Новый заказчик'}
          subtitle={customerDraft.customerId ? 'Обновите карточку заказчика.' : 'Создайте новую карточку заказчика.'}
          onClose={closeEditor}
          closeDisabled={customerSaving}
        />

        <div className="responsive-form-grid">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Имя / название *</label>
            <input
              value={customerDraft.fullName}
              onChange={handleDraftFieldChange('fullName')}
              placeholder="Например: Иван Петров или ООО Ромашка"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Телефон</label>
            <input
              value={customerDraft.phone}
              onChange={handleDraftFieldChange('phone')}
              placeholder="+375..."
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Telegram</label>
            <input
              value={customerDraft.telegram}
              onChange={handleDraftFieldChange('telegram')}
              placeholder="@username"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Email</label>
            <input
              value={customerDraft.email}
              onChange={handleDraftFieldChange('email')}
              placeholder="mail@example.com"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label>Адрес</label>
            <textarea
              value={customerDraft.address}
              onChange={handleDraftFieldChange('address')}
              placeholder="Адрес объекта или доставки"
              rows={2}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label>Примечания</label>
            <textarea
              value={customerDraft.notes}
              onChange={handleDraftFieldChange('notes')}
              placeholder="Контакты, пожелания, особенности по работе с заказчиком"
              rows={4}
            />
          </div>
        </div>

        <div className="modal-actions">
          <Button onClick={closeEditor} disabled={customerSaving}>Отмена</Button>
          <Button variant="success" onClick={handleSaveCustomer} disabled={customerSaving}>
            {customerSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Удалить заказчика?"
        message={confirmDelete ? `Карточка "${confirmDelete.fullName || 'Без имени'}" будет удалена. Связь в заказах снимется автоматически.` : ''}
        confirmLabel="Удалить"
        onConfirm={handleDeleteCustomer}
        onCancel={() => !deletingCustomerId && setConfirmDelete(null)}
        loading={Boolean(deletingCustomerId)}
        variant="danger"
      />
      <ConfirmDialog
        open={Boolean(confirmTelegramAccessClose)}
        title="Закрыть доступ заказчика?"
        message={confirmTelegramAccessClose
          ? `Заказчик перестанет получать уведомления по заказу "${confirmTelegramAccessClose.order?.orderNumber || 'Без номера'}" в Telegram. Действие потребует повторного создания доступа.`
          : ''}
        confirmLabel="Закрыть доступ"
        onConfirm={handleConfirmTelegramAccessClose}
        onCancel={() => !telegramActionLoadingKey && setConfirmTelegramAccessClose(null)}
        loading={Boolean(telegramActionLoadingKey && confirmTelegramAccessClose)}
        variant="danger"
      />
    </div>
  );
}

export default CustomersPage;
