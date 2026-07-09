import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
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
      setError(fetchError.message || 'Не удалось загрузить список заказчиков.');
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
    </div>
  );
}

export default CustomersPage;
