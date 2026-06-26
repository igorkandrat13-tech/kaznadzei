import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import { apiFetch, getErrorMessage, parseJsonSafely } from './api';
import { canAccessRole, getAppAuthRole } from './appAuth';
import { ORDER_STAGE_LEGEND, ORDER_STAGE_SECONDARY_HEADERS } from './orderStageLegend';
import { useRoleConfig } from './RoleConfigContext';
import useEscapeKey from './useEscapeKey';

const HIDDEN_TABLE_ROLE_KEYS = new Set(['assembler', 'painter', 'designer']);

function getCommentPreview(comments = []) {
  if (!Array.isArray(comments) || comments.length === 0) return '—';
  return comments
    .map(comment => `${comment.role}: ${comment.text}`)
    .join(' | ');
}

function formatDateDisplay(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '—';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? normalized : date.toLocaleDateString();
}

function formatManufacturingTime(startDate, endDate) {
  const normalizedStart = String(startDate || '').trim();
  if (!normalizedStart) return '—';

  const start = new Date(normalizedStart);
  if (Number.isNaN(start.getTime())) return '—';

  const normalizedEnd = String(endDate || '').trim() || new Date().toISOString().split('T')[0];
  const end = new Date(normalizedEnd);
  if (Number.isNaN(end.getTime())) return '—';

  const diffDays = Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
  return String(diffDays);
}

function escapeCsvValue(value) {
  const normalized = String(value ?? '');
  if (normalized.includes('"') || normalized.includes(';') || normalized.includes('\n')) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function createInlineDraft(row) {
  return {
    orderNumber: row.order.orderNumber || '',
    customer: row.order.customer || '',
    room: row.item.room || '',
    roomNumber: row.item.roomNumber || '',
    itemNumber: row.item.itemNumber || '',
    productNumber: row.item.productNumber || '',
    quantity: row.item.quantity || 1,
    name: row.item.name || '',
    deliveryDate: row.item.deliveryDate || '',
    material: row.item.material || '',
    packageName: row.item.packageName || '',
    photoLink: row.item.photoLink || '',
    notes: row.item.notes || '',
  };
}

const EMPTY_ITEM = {
  itemNumber: '',
  productNumber: '',
  room: '',
  roomNumber: '',
  name: '',
  quantity: 1,
  material: '',
  deliveryDate: '',
  packageName: '',
  photoLink: '',
  notes: '',
};

function createEmptyItem(index = 0) {
  return {
    ...EMPTY_ITEM,
    itemNumber: String(index + 1),
    clientKey: `new-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

function createEmptyOrderForm() {
  const today = new Date().toISOString().split('T')[0];
  return {
    orderNumber: '',
    customer: '',
    orderDate: today,
    startDate: '',
    endDate: '',
    items: [createEmptyItem(0)],
  };
}

function mapOrderToForm(order) {
  const items = Array.isArray(order?.items) && order.items.length > 0
    ? order.items.map((item, index) => ({
        itemId: item.itemId || '',
        clientKey: item.itemId || `edit-item-${index}`,
        itemNumber: item.itemNumber || String(index + 1),
        productNumber: item.productNumber || '',
        room: item.room || '',
        roomNumber: item.roomNumber || '',
        name: item.name || '',
        quantity: item.quantity || 1,
        material: item.material || '',
        deliveryDate: item.deliveryDate || '',
        packageName: item.packageName || '',
        photoLink: item.photoLink || '',
        notes: item.notes || '',
      }))
    : [createEmptyItem(0)];

  return {
    orderNumber: order?.orderNumber || '',
    customer: order?.customer || '',
    orderDate: order?.orderDate || '',
    startDate: order?.startDate || '',
    endDate: order?.endDate || '',
    items,
  };
}

function validateOrderForm(form) {
  const errors = {
    orderNumber: '',
    orderDate: '',
    endDate: '',
    items: [],
  };

  if (!String(form.orderNumber || '').trim()) {
    errors.orderNumber = 'Укажите номер заказа.';
  }
  if (!String(form.orderDate || '').trim()) {
    errors.orderDate = 'Укажите дату заказа.';
  }
  if (form.startDate && form.endDate && new Date(form.endDate) < new Date(form.startDate)) {
    errors.endDate = 'Дата окончания не может быть раньше даты начала.';
  }
  if (!Array.isArray(form.items) || form.items.length === 0) {
    errors.items = [{ name: 'Добавьте хотя бы одно изделие.', quantity: '' }];
    return errors;
  }

  errors.items = form.items.map((item) => {
    const itemErrors = { name: '', quantity: '' };
    if (!String(item.name || '').trim()) {
      itemErrors.name = 'Укажите наименование изделия.';
    }
    if ((Number(item.quantity) || 0) < 1) {
      itemErrors.quantity = 'Количество должно быть не меньше 1.';
    }
    return itemErrors;
  });

  return errors;
}

function hasOrderFormErrors(formErrors) {
  if (formErrors.orderNumber || formErrors.orderDate || formErrors.endDate) return true;
  return (formErrors.items || []).some(itemError => itemError.name || itemError.quantity);
}

function getOrderIdentity(row) {
  return row.order?._id || row.order?.orderNumber || row.key;
}

function OrdersWorkspace() {
  const authRole = getAppAuthRole();
  const { allRoleTabs } = useRoleConfig();
  const isAdmin = canAccessRole('admin', authRole);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [roomFilter, setRoomFilter] = useState('all');
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');
  const [downloadingKey, setDownloadingKey] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState('');
  const [orderForm, setOrderForm] = useState(createEmptyOrderForm);
  const [savingOrder, setSavingOrder] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmRemoveItemIndex, setConfirmRemoveItemIndex] = useState(null);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [inlineDrafts, setInlineDrafts] = useState({});
  const [inlineSavingKey, setInlineSavingKey] = useState('');
  const [qrPreview, setQrPreview] = useState(null);
  const [orderActionsOrder, setOrderActionsOrder] = useState(null);
  const [hoveredOrderId, setHoveredOrderId] = useState('');
  const [colors, setColors] = useState([]);

  const fetchOrders = useCallback(async ({ showLoader = false } = {}) => {
    if (showLoader) {
      setLoading(true);
    }
    setError('');
    try {
      const res = await apiFetch('/api/orders');
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось загрузить заказы.');
      }
      setOrders(Array.isArray(data) ? data : []);
      setLastRefreshedAt(new Date().toISOString());
    } catch (fetchError) {
      setError(fetchError.message || 'Не удалось загрузить заказы.');
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, []);

  const fetchColors = useCallback(async () => {
    try {
      const res = await apiFetch('/api/colors');
      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Не удалось загрузить цвета.');
      }
      setColors(Array.isArray(data) ? data : []);
    } catch {
      setColors([]);
    }
  }, []);

  useEffect(() => {
    fetchOrders({ showLoader: true });
    fetchColors();
  }, [fetchColors, fetchOrders]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (showForm) return;
      if (Object.keys(inlineDrafts).length > 0) return;
      if (inlineSavingKey) return;
      fetchOrders();
      fetchColors();
    };

    const intervalId = window.setInterval(refresh, 10000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fetchColors, fetchOrders, inlineDrafts, inlineSavingKey, showForm]);

  const legendColorMap = useMemo(() => {
    return ORDER_STAGE_LEGEND.reduce((acc, item) => {
      const savedColor = colors.find(color => String(color.name || '').trim() === item.storeName);
      acc[item.key] = savedColor?.hex || item.defaultHex;
      return acc;
    }, {});
  }, [colors]);

  const secondaryHeaderCells = useMemo(() => {
    return ORDER_STAGE_SECONDARY_HEADERS.map((item) => {
      const hex = item.legendKey ? (legendColorMap[item.legendKey] || '#FFFFFF') : '';
      return {
        ...item,
        hex,
        textColor: item.textHex || '#000000',
      };
    });
  }, [legendColorMap]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.flatMap(order => {
      const items = Array.isArray(order.items) && order.items.length > 0 ? order.items : [];
      return items
        .map(item => {
          const overallStatus = item?.overallStatus || order?.overallStatus || 'pending';
          const currentRole = (item?.stages || []).find(stage => stage.status === 'in_progress')?.role || '';
          const haystack = [
            order.orderNumber,
            order.customer,
            item.itemNumber,
            item.productNumber,
            item.room,
            item.roomNumber,
            item.name,
            item.material,
            item.packageName,
            item.notes,
            ...(item.comments || []).map(comment => comment.text),
          ].join(' ').toLowerCase();

          if (statusFilter !== 'all' && overallStatus !== statusFilter) return null;
          if (roleFilter !== 'all' && currentRole !== roleFilter) return null;
          if (roomFilter !== 'all' && String(item.room || '').trim() !== roomFilter) return null;
          if (query && !haystack.includes(query)) return null;

          return {
            key: `${order._id}:${item.itemId}`,
            orderId: order._id || '',
            order,
            item,
            overallStatus,
            currentRole,
          };
        })
        .filter(Boolean);
    });
  }, [orders, roleFilter, roomFilter, search, statusFilter]);

  const rowsByKey = useMemo(() => rows.reduce((acc, row) => {
    acc[row.key] = row;
    return acc;
  }, {}), [rows]);

  const visibleTableRoles = useMemo(
    () => allRoleTabs.filter(role => !HIDDEN_TABLE_ROLE_KEYS.has(role.key)),
    [allRoleTabs],
  );
  const firstOrderRowKeys = useMemo(() => {
    const seenOrders = new Set();
    return rows.reduce((acc, row) => {
      const orderId = getOrderIdentity(row);
      const isFirst = !seenOrders.has(orderId);
      if (isFirst) {
        seenOrders.add(orderId);
      }
      acc[row.key] = isFirst;
      return acc;
    }, {});
  }, [rows]);
  const orderRowSpans = useMemo(() => {
    const counts = rows.reduce((acc, row) => {
      const orderId = getOrderIdentity(row);
      acc[orderId] = (acc[orderId] || 0) + 1;
      return acc;
    }, {});

    return rows.reduce((acc, row) => {
      const orderId = getOrderIdentity(row);
      acc[row.key] = firstOrderRowKeys[row.key] ? counts[orderId] || 1 : 0;
      return acc;
    }, {});
  }, [firstOrderRowKeys, rows]);
  const lastOrderRowKeys = useMemo(() => {
    return rows.reduce((acc, row) => {
      const orderId = getOrderIdentity(row);
      acc[orderId] = row.key;
      return acc;
    }, {});
  }, [rows]);
  const orderDraftKeys = useMemo(() => {
    return Object.keys(inlineDrafts).reduce((acc, rowKey) => {
      const row = rowsByKey[rowKey];
      if (!row) return acc;
      const orderId = getOrderIdentity(row);
      if (!acc[orderId]) {
        acc[orderId] = [];
      }
      acc[orderId].push(rowKey);
      return acc;
    }, {});
  }, [inlineDrafts, rowsByKey]);

  const availableRooms = useMemo(() => {
    return Array.from(new Set(
      orders.flatMap(order => (order.items || []).map(item => String(item.room || '').trim()).filter(Boolean))
    )).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [orders]);

  const formErrors = useMemo(() => validateOrderForm(orderForm), [orderForm]);
  const isFormValid = useMemo(() => !hasOrderFormErrors(formErrors), [formErrors]);
  const handleDownloadQr = async (orderId, itemId, fileNameBase) => {
    const downloadKey = `${orderId}:${itemId}`;
    setDownloadingKey(downloadKey);
    try {
      const res = await apiFetch(`/api/orders/${orderId}/items/${itemId}/qrcode`);
      if (!res.ok) {
        throw new Error('Не удалось скачать QR-код.');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileNameBase || 'item'}-qr.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      window.alert(downloadError.message || 'Не удалось скачать QR-код.');
    } finally {
      setDownloadingKey('');
    }
  };

  const openQrPreview = (order, item) => {
    setQrPreview({
      orderId: order._id,
      itemId: item.itemId,
      orderNumber: order.orderNumber || '',
      itemNumber: item.itemNumber || '',
      itemName: item.name || '',
      fileNameBase: `${order.orderNumber || 'order'}-${item.itemNumber || 'item'}`,
    });
  };

  const handlePrintQr = () => {
    if (!qrPreview?.orderId || !qrPreview?.itemId) return;
    const qrUrl = `${window.location.origin}/api/orders/${qrPreview.orderId}/items/${qrPreview.itemId}/qrcode`;
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900');
    if (!printWindow) return;
    const title = `QR ${qrPreview.orderNumber || ''} ${qrPreview.itemNumber ? `- ${qrPreview.itemNumber}` : ''}`.trim();
    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 24px; text-align: center; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { margin: 0 0 18px; color: #444; }
      img { width: 320px; height: 320px; display: block; margin: 0 auto; }
    </style>
  </head>
  <body>
    <h1>${title || 'QR-код'}</h1>
    <p>${qrPreview.itemName || ''}</p>
    <img src="${qrUrl}" alt="QR code" onload="window.print(); setTimeout(() => window.close(), 150);" />
  </body>
</html>`);
    printWindow.document.close();
  };

  const openCreateForm = () => {
    setError('');
    setEditingOrderId('');
    setOrderForm(createEmptyOrderForm());
    setShowForm(true);
  };

  const openEditForm = (order) => {
    setError('');
    setEditingOrderId(order._id);
    setOrderForm(mapOrderToForm(order));
    setShowForm(true);
  };

  const resetFormState = () => {
    setShowForm(false);
    setEditingOrderId('');
    setOrderForm(createEmptyOrderForm());
  };

  useEscapeKey(() => {
    if (confirmRemoveItemIndex !== null && !savingOrder) {
      setConfirmRemoveItemIndex(null);
      return;
    }
    if (confirmDelete && !deletingOrder) {
      setConfirmDelete(null);
      return;
    }
    if (orderActionsOrder) {
      setOrderActionsOrder(null);
      return;
    }
    if (qrPreview && !downloadingKey) {
      setQrPreview(null);
      return;
    }
    if (showForm && !savingOrder) {
      closeForm();
    }
  }, Boolean(confirmRemoveItemIndex !== null || confirmDelete || orderActionsOrder || qrPreview || showForm));

  const closeForm = () => {
    if (savingOrder) return;
    resetFormState();
  };

  const handleOrderFieldChange = (field) => (event) => {
    const value = event.target.value;
    setError('');
    setOrderForm(current => ({ ...current, [field]: value }));
  };

  const handleItemFieldChange = (index, field) => (event) => {
    const value = event.target.value;
    setError('');
    setOrderForm(current => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index
          ? { ...item, [field]: field === 'quantity' ? value : value }
          : item
      )),
    }));
  };

  const addItem = () => {
    setOrderForm(current => ({
      ...current,
      items: [...current.items, createEmptyItem(current.items.length)],
    }));
  };

  const removeItem = (index) => {
    setOrderForm(current => {
      if (current.items.length <= 1) return current;
      const nextItems = current.items.filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({
          ...item,
          itemNumber: item.itemNumber || String(itemIndex + 1),
        }));
      return {
        ...current,
        items: nextItems,
      };
    });
  };

  const requestRemoveItem = (index) => {
    if (savingOrder || orderForm.items.length <= 1) return;
    setConfirmRemoveItemIndex(index);
  };

  const confirmRemoveItem = () => {
    if (confirmRemoveItemIndex === null) return;
    removeItem(confirmRemoveItemIndex);
    setConfirmRemoveItemIndex(null);
  };

  const handleSubmit = async () => {
    if (!isFormValid) {
      setError(formErrors.orderNumber || formErrors.orderDate || formErrors.endDate || formErrors.items.find(item => item.name || item.quantity)?.name || formErrors.items.find(item => item.name || item.quantity)?.quantity || 'Проверьте форму заказа.');
      return;
    }
    if (savingOrder) return;

    const preparedItems = orderForm.items.map((item, index) => ({
      ...(item.itemId ? { itemId: item.itemId } : {}),
      itemNumber: String(item.itemNumber || index + 1).trim() || String(index + 1),
      productNumber: String(item.productNumber || '').trim(),
      room: String(item.room || '').trim(),
      roomNumber: String(item.roomNumber || '').trim(),
      name: String(item.name || '').trim(),
      quantity: Number(item.quantity) || 1,
      material: String(item.material || '').trim(),
      deliveryDate: String(item.deliveryDate || '').trim(),
      packageName: String(item.packageName || '').trim(),
      photoLink: String(item.photoLink || '').trim(),
      notes: String(item.notes || '').trim(),
    }));
    const firstItem = preparedItems[0];
    const payload = {
      orderNumber: String(orderForm.orderNumber || '').trim(),
      customer: String(orderForm.customer || '').trim(),
      orderDate: String(orderForm.orderDate || '').trim(),
      startDate: String(orderForm.startDate || '').trim(),
      endDate: String(orderForm.endDate || '').trim(),
      name: firstItem?.name || '',
      quantity: firstItem?.quantity || 1,
      material: firstItem?.material || '',
      notes: firstItem?.notes || '',
      items: preparedItems,
    };

    setSavingOrder(true);
    setError('');
    try {
      const res = await apiFetch(editingOrderId ? `/api/orders/${editingOrderId}` : '/api/orders', {
        method: editingOrderId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await getErrorMessage(res, editingOrderId ? 'Не удалось сохранить заказ.' : 'Не удалось создать заказ.'));
        return;
      }
      resetFormState();
      await fetchOrders();
    } finally {
      setSavingOrder(false);
    }
  };

  const requestDelete = (order) => {
    setError('');
    setConfirmDelete({
      id: order._id,
      orderNumber: order.orderNumber || '',
      name: order.name || '',
      customer: order.customer || '',
    });
  };

  const openInlineEdit = (row) => {
    setError('');
    setInlineDrafts(current => ({
      ...current,
      [row.key]: current[row.key] || createInlineDraft(row),
    }));
  };

  const cancelInlineEdit = (rowKey) => {
    setInlineDrafts(current => {
      const next = { ...current };
      delete next[rowKey];
      return next;
    });
  };

  const handleInlineChange = (rowKey, field) => (event) => {
    const value = event.target.value;
    setError('');
    setInlineDrafts(current => ({
      ...current,
      [rowKey]: {
        ...current[rowKey],
        [field]: value,
      },
    }));
  };

  const handleOrderNumberCellChange = (rowKey, row) => (event) => {
    const value = event.target.value;
    setError('');
    setInlineDrafts(current => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] || createInlineDraft(row)),
        orderNumber: value,
      },
    }));
  };

  const saveInlineRow = async (rowKey) => {
    const row = rowsByKey[rowKey];
    const draft = inlineDrafts[rowKey];
    if (!row || !draft) return false;

    const orderNumber = String(draft.orderNumber || '').trim();
    const productName = String(draft.name || '').trim();
    const quantity = Number(draft.quantity) || 0;

    if (!orderNumber) {
      setError('Для быстрого редактирования укажите номер заказа.');
      return false;
    }
    if (!productName) {
      setError('Для быстрого редактирования укажите наименование изделия.');
      return false;
    }
    if (quantity < 1) {
      setError('Количество изделия должно быть не меньше 1.');
      return false;
    }

    const baseOrder = orders.find(order => order._id === row.order._id);
    if (!baseOrder) {
      setError('Заказ для быстрого редактирования не найден.');
      return false;
    }

    const nextItems = (baseOrder.items || []).map(item => (
      item.itemId === row.item.itemId
        ? {
            ...item,
            room: String(draft.room || '').trim(),
            roomNumber: String(draft.roomNumber || '').trim(),
            itemNumber: String(draft.itemNumber || '').trim(),
            productNumber: String(draft.productNumber || '').trim(),
            quantity,
            name: productName,
            deliveryDate: String(draft.deliveryDate || '').trim(),
            material: String(draft.material || '').trim(),
            packageName: String(draft.packageName || '').trim(),
            photoLink: String(draft.photoLink || '').trim(),
            notes: String(draft.notes || '').trim(),
          }
        : item
    ));

    const firstItem = nextItems[0] || {};
    const payload = {
      orderNumber,
      customer: String(draft.customer || '').trim(),
      orderDate: baseOrder.orderDate || '',
      startDate: baseOrder.startDate || '',
      endDate: baseOrder.endDate || '',
      name: firstItem.name || '',
      quantity: Number(firstItem.quantity) || 1,
      material: String(firstItem.material || '').trim(),
      notes: String(firstItem.notes || '').trim(),
      items: nextItems.map(item => ({
        itemId: item.itemId,
        itemNumber: item.itemNumber || '',
        productNumber: item.productNumber || '',
        room: item.room || '',
        roomNumber: item.roomNumber || '',
        name: item.name || '',
        quantity: Number(item.quantity) || 1,
        deliveryDate: item.deliveryDate || '',
        material: item.material || '',
        packageName: item.packageName || '',
        photoLink: item.photoLink || '',
        notes: item.notes || '',
      })),
    };

    setInlineSavingKey(rowKey);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${baseOrder._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось сохранить строку.'));
        return false;
      }
      cancelInlineEdit(rowKey);
      await fetchOrders();
      return true;
    } finally {
      setInlineSavingKey('');
    }
  };

  const saveAllInlineRows = async () => {
    const draftKeys = Object.keys(inlineDrafts);
    if (draftKeys.length === 0) return;
    for (const rowKey of draftKeys) {
      const saved = await saveInlineRow(rowKey);
      if (!saved) {
        break;
      }
    }
  };

  const cancelOrderInlineEdits = (orderId) => {
    const keys = orderDraftKeys[orderId] || [];
    if (keys.length === 0) return;
    setInlineDrafts(current => {
      const next = { ...current };
      keys.forEach((rowKey) => {
        delete next[rowKey];
      });
      return next;
    });
  };

  const exportRowsToCsv = () => {
    const headers = [
      'Номер заказа',
      'Заказчик',
      'Помещение',
      '№ помещения',
      '№ изделия в заказе',
      'Кол-во изделй',
      'Наименование',
      '',
      'Отгрузка до',
      'Материал',
      'Комплектация заказа',
      'Покраска',
      'Ссылка / фото',
      'Примечания',
      'СТОЛЯР',
      'Начало изготовления',
      'Окончание',
      'Время изготовления',
    ];

    const csvLines = [
      headers.map(escapeCsvValue).join(';'),
      ...rows.map(({ order, item }) => {
        const cells = [
          order.orderNumber || '',
          order.customer || '',
          item.room || '',
          item.roomNumber || '',
          item.itemNumber || '',
          item.quantity || '',
          item.name || '',
          '',
          item.deliveryDate || '',
          item.material || '',
          item.packageName || '',
          '',
          item.photoLink || '',
          item.notes || '',
          '',
          order.startDate || '',
          order.endDate || '',
          formatManufacturingTime(order.startDate, order.endDate),
        ];
        return cells.map(escapeCsvValue).join(';');
      }),
    ];

    const blob = new Blob([`\uFEFF${csvLines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!confirmDelete?.id || deletingOrder) return;
    setDeletingOrder(true);
    setError('');
    try {
      const res = await apiFetch(`/api/orders/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Не удалось удалить заказ.'));
        return;
      }
      if (editingOrderId === confirmDelete.id) {
        closeForm();
      }
      setConfirmDelete(null);
      await fetchOrders();
    } finally {
      setDeletingOrder(false);
    }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-header">
          <div>
            <h2 className="section-header-title">📋 Единая таблица заказов</h2>
          </div>
          <div className="section-header-actions">
            <button className="btn btn-primary" onClick={openCreateForm}>➕ Новый заказ</button>
            <button className="btn btn-secondary" onClick={exportRowsToCsv}>Экспорт CSV</button>
            <Link to="/archive" className="btn btn-secondary">Архив</Link>
            {canAccessRole('admin', authRole) ? (
              <Link to="/settings" className="btn btn-secondary">Настройки</Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="responsive-filters">
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 260 }}>
            <label>Поиск</label>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Заказ, изделие, помещение, материал, комментарий"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Статус</label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Все</option>
              <option value="pending">Ожидание</option>
              <option value="in_progress">В работе</option>
              <option value="completed">Завершено</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Активная роль</label>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="all">Все</option>
              {visibleTableRoles.map(role => (
                <option key={role.key} value={role.key}>{role.plainLabel || role.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Помещение</label>
            <select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)}>
              <option value="all">Все</option>
              {availableRooms.map(room => (
                <option key={room} value={room}>{room}</option>
              ))}
            </select>
          </div>
          <div className="filters-summary">Строк: {rows.length}</div>
        </div>

        {Object.keys(inlineDrafts).length > 0 ? (
          <div className="excel-bulk-toolbar">
            <div className="filters-summary">Изменено строк: {Object.keys(inlineDrafts).length}</div>
            <div className="table-action-group">
              <button className="btn btn-success" onClick={saveAllInlineRows} disabled={Boolean(inlineSavingKey)}>
                {inlineSavingKey ? 'Сохранение...' : 'Сохранить все'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setInlineDrafts({})}
                disabled={Boolean(inlineSavingKey)}
              >
                Отменить все
              </button>
            </div>
          </div>
        ) : null}

        {error && (
          <div className="settings-alert settings-alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="mobile-empty-state">Загрузка таблицы...</div>
        ) : (
          <div className="table-scroll">
            <table className="orders-table unified-orders-table">
              <colgroup>
                <col className="col-order-number" />
                <col className="col-customer" />
                <col className="col-room" />
                <col className="col-room-number" />
                <col className="col-item-number" />
                <col className="col-quantity" />
                <col className="col-name" />
                <col className="col-item-actions" />
                <col className="col-delivery-date" />
                <col className="col-material" />
                <col className="col-package" />
                <col className="col-paint" />
                <col className="col-photo" />
                <col className="col-notes" />
                <col className="col-carpenter" />
                <col className="col-start-date" />
                <col className="col-end-date" />
                <col className="col-duration" />
              </colgroup>
              <thead>
                <tr className="xlsx-header-row xlsx-header-row-primary">
                  <th className="sticky-col sticky-col-1 xlsx-header-primary-cell">Номер заказа</th>
                  <th className="sticky-col sticky-col-2 xlsx-header-primary-cell">Заказчик</th>
                  <th className="xlsx-header-primary-cell">Помещение</th>
                  <th className="xlsx-header-primary-cell">№ помещения</th>
                  <th className="xlsx-header-primary-cell">№ изделия в заказе</th>
                  <th className="xlsx-header-primary-cell">Кол-во изделй</th>
                  <th className="xlsx-header-primary-cell">Наименование</th>
                  <th className="xlsx-header-primary-cell">&nbsp;</th>
                  <th className="xlsx-header-primary-cell">Отгрузка до</th>
                  <th className="xlsx-header-primary-cell">Материал</th>
                  <th className="xlsx-header-primary-cell">Комплектация заказа</th>
                  <th className="xlsx-header-primary-cell">Покраска</th>
                  <th className="xlsx-header-primary-cell">Ссылка / фото</th>
                  <th className="xlsx-header-primary-cell">Примечания</th>
                  <th className="xlsx-header-primary-cell">СТОЛЯР</th>
                  <th className="xlsx-header-primary-cell">Начало изготовления</th>
                  <th className="xlsx-header-primary-cell">Окончание</th>
                  <th className="xlsx-header-primary-cell">Время изготовления</th>
                </tr>
                <tr className="xlsx-header-row xlsx-header-row-secondary">
                  {secondaryHeaderCells.map((cell, index) => (
                    <th
                      key={`${cell.label}-${index}`}
                      colSpan={cell.colSpan || 1}
                      className={`${cell.stickyCol ? `sticky-col ${cell.stickyCol} ` : ''}xlsx-header-secondary-cell${cell.legendKey ? ' xlsx-header-secondary-cell-colored' : ''}${(cell.colSpan || 1) > 1 ? ' xlsx-header-secondary-cell-merged' : ''}`}
                      style={{ background: cell.hex, color: cell.textColor }}
                    >
                      {cell.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody onMouseLeave={() => setHoveredOrderId('')}>
                {rows.map(({ key, order, item }) => {
                  const inlineDraft = inlineDrafts[key] || null;
                  const isInlineEditing = Boolean(inlineDraft);
                  const isFirstOrderRow = Boolean(firstOrderRowKeys[key]);
                  const orderId = getOrderIdentity({ key, order });
                  const isLastOrderRow = lastOrderRowKeys[orderId] === key;
                  const orderRowSpan = orderRowSpans[key] || 1;
                  const isHoveredOrder = hoveredOrderId === orderId;
                  const regularOutlineClass = `${isHoveredOrder ? ' order-outline-cell' : ''}${isHoveredOrder && isFirstOrderRow ? ' order-outline-top' : ''}${isHoveredOrder && isLastOrderRow ? ' order-outline-bottom' : ''}`.trim();
                  const currentOrderDraftKeys = orderDraftKeys[orderId] || [];
                  const orderInlineDraft = currentOrderDraftKeys.length > 0 ? inlineDrafts[currentOrderDraftKeys[0]] : null;
                  const isOrderInlineEditing = Boolean(orderInlineDraft);
                  const hasOrderDrafts = currentOrderDraftKeys.length > 0;
                  const commentPreview = getCommentPreview(item.comments);
                  return (
                    <tr
                      key={key}
                      className={isInlineEditing ? 'unified-orders-row-editing' : ''}
                      onMouseEnter={() => setHoveredOrderId(orderId)}
                    >
                      {isFirstOrderRow ? (
                        <td
                          rowSpan={orderRowSpan}
                          className={`sticky-col sticky-col-1 merged-order-cell merged-order-number-cell${isHoveredOrder ? ' order-outline-cell order-outline-top order-outline-bottom order-outline-left' : ''}`}
                        >
                          <div className="merged-order-number-content">
                            <div className="xlsx-order-cell">
                            {isAdmin ? (
                              <input
                                className="table-inline-input merged-order-number-input"
                                value={isOrderInlineEditing ? orderInlineDraft.orderNumber : (order.orderNumber || '')}
                                onChange={handleOrderNumberCellChange(key, { key, order, item })}
                                placeholder="Номер заказа"
                              />
                            ) : (
                              <Link className="order-link-button merged-order-number-link" to={`/order/${order._id}/item/${item.itemId}`}>
                                {order.orderNumber || '—'}
                              </Link>
                            )}
                            <button
                              className={`btn btn-secondary btn-small order-actions-trigger ${hasOrderDrafts ? 'order-actions-trigger-attention' : ''}`}
                              type="button"
                              aria-label={`Действия над заказом ${order.orderNumber || ''}`}
                              title={hasOrderDrafts ? 'Действия над заказом: есть быстрые правки' : 'Действия над заказом'}
                              onClick={() => setOrderActionsOrder(order)}
                            >
                              ...
                            </button>
                            </div>
                          </div>
                        </td>
                      ) : null}
                      {isFirstOrderRow ? (
                        <td
                          rowSpan={orderRowSpan}
                          className={`sticky-col sticky-col-2 merged-order-cell merged-order-customer-cell${isHoveredOrder ? ' order-outline-cell order-outline-top order-outline-bottom' : ''}`}
                        >
                          <div className="merged-order-customer-content">
                            {isOrderInlineEditing ? <input className="table-inline-input merged-order-customer-input" value={orderInlineDraft.customer} onChange={handleInlineChange(currentOrderDraftKeys[0], 'customer')} /> : <div className="merged-order-customer-text">{order.customer || '—'}</div>}
                          </div>
                        </td>
                      ) : null}
                      <td className={regularOutlineClass}>{isInlineEditing ? <input className="table-inline-input" value={inlineDraft.room} onChange={handleInlineChange(key, 'room')} /> : (item.room || '—')}</td>
                      <td className={regularOutlineClass}>{isInlineEditing ? <input className="table-inline-input table-inline-input-narrow" value={inlineDraft.roomNumber} onChange={handleInlineChange(key, 'roomNumber')} /> : (item.roomNumber || '—')}</td>
                      <td className={regularOutlineClass}>{isInlineEditing ? <input className="table-inline-input table-inline-input-narrow" value={inlineDraft.itemNumber} onChange={handleInlineChange(key, 'itemNumber')} /> : (item.itemNumber || '—')}</td>
                      <td className={regularOutlineClass}>{isInlineEditing ? <input type="number" min="1" className="table-inline-input table-inline-input-narrow" value={inlineDraft.quantity} onChange={handleInlineChange(key, 'quantity')} /> : (item.quantity || 1)}</td>
                      <td className={regularOutlineClass}>
                        {isInlineEditing ? (
                          <input className="table-inline-input" value={inlineDraft.name} onChange={handleInlineChange(key, 'name')} />
                        ) : (
                          <div className="order-primary-title"><strong>{item.name || '—'}</strong></div>
                        )}
                      </td>
                      <td className={`xlsx-empty-cell${regularOutlineClass ? ` ${regularOutlineClass}` : ''}`}>—</td>
                      <td className={regularOutlineClass}>{isInlineEditing ? <input type="date" className="table-inline-input" value={inlineDraft.deliveryDate} onChange={handleInlineChange(key, 'deliveryDate')} /> : formatDateDisplay(item.deliveryDate)}</td>
                      <td className={regularOutlineClass}>{isInlineEditing ? <input className="table-inline-input" value={inlineDraft.material} onChange={handleInlineChange(key, 'material')} /> : (item.material || '—')}</td>
                      <td className={regularOutlineClass}>{isInlineEditing ? <input className="table-inline-input" value={inlineDraft.packageName} onChange={handleInlineChange(key, 'packageName')} /> : (item.packageName || '—')}</td>
                      <td className={regularOutlineClass}>—</td>
                      <td className={`photo-cell${regularOutlineClass ? ` ${regularOutlineClass}` : ''}`}>
                        {isInlineEditing ? (
                          <input className="table-inline-input" value={inlineDraft.photoLink} onChange={handleInlineChange(key, 'photoLink')} placeholder="https://..." />
                        ) : item.photoLink ? (
                          <a className="table-inline-link" href={item.photoLink} target="_blank" rel="noreferrer">Открыть</a>
                        ) : '—'}
                      </td>
                      <td className={`notes-cell${regularOutlineClass ? ` ${regularOutlineClass}` : ''}`}>
                        {isInlineEditing ? (
                          <textarea className="table-inline-textarea" rows={3} value={inlineDraft.notes} onChange={handleInlineChange(key, 'notes')} />
                        ) : (
                          <>
                            {commentPreview !== '—' ? (
                              <div className="xlsx-order-cell-comment" title={commentPreview}>{commentPreview}</div>
                            ) : null}
                            {item.notes || (commentPreview !== '—' ? null : '—')}
                          </>
                        )}
                      </td>
                      <td className={regularOutlineClass}>—</td>
                      {isFirstOrderRow ? (
                        <td rowSpan={orderRowSpan} className={`merged-order-cell merged-order-meta-cell${isHoveredOrder ? ' order-outline-cell order-outline-top order-outline-bottom' : ''}`}>
                          <div className="merged-order-meta-content">{formatDateDisplay(order.startDate)}</div>
                        </td>
                      ) : null}
                      {isFirstOrderRow ? (
                        <td rowSpan={orderRowSpan} className={`merged-order-cell merged-order-meta-cell${isHoveredOrder ? ' order-outline-cell order-outline-top order-outline-bottom' : ''}`}>
                          <div className="merged-order-meta-content">{formatDateDisplay(order.endDate)}</div>
                        </td>
                      ) : null}
                      {isFirstOrderRow ? (
                        <td rowSpan={orderRowSpan} className={`merged-order-cell merged-order-meta-cell${isHoveredOrder ? ' order-outline-cell order-outline-top order-outline-bottom order-outline-right' : ''}`}>
                          <div className="merged-order-meta-content">{formatManufacturingTime(order.startDate, order.endDate)}</div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="empty-cell">Нет изделий по выбранным фильтрам</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        <div className="filters-summary" style={{ marginTop: 12 }}>
          Обновлено: {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleTimeString() : '—'}
        </div>
      </div>

      {showForm ? (
        <div className="modal-overlay" onClick={savingOrder ? undefined : closeForm}>
          <div className="modal-window modal-window-lg order-form-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{editingOrderId ? 'Редактирование заказа' : 'Новый заказ'}</div>
                <div className="modal-subtitle">Один заказ может содержать несколько изделий. QR формируется для каждого изделия отдельно.</div>
              </div>
              <button className="btn btn-small modal-close-btn" onClick={closeForm} disabled={savingOrder}>✕</button>
            </div>

            <div className="responsive-form-grid">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Номер заказа *</label>
                <input
                  value={orderForm.orderNumber}
                  onChange={handleOrderFieldChange('orderNumber')}
                  className={formErrors.orderNumber ? 'input-invalid' : ''}
                  placeholder="Например: 2026-015"
                />
                {formErrors.orderNumber ? <div className="field-error">{formErrors.orderNumber}</div> : null}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Заказчик</label>
                <input
                  value={orderForm.customer}
                  onChange={handleOrderFieldChange('customer')}
                  placeholder="ФИО или название"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Дата заказа *</label>
                <input
                  type="date"
                  value={orderForm.orderDate}
                  onChange={handleOrderFieldChange('orderDate')}
                  className={formErrors.orderDate ? 'input-invalid' : ''}
                />
                {formErrors.orderDate ? <div className="field-error">{formErrors.orderDate}</div> : null}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Начало изготовления</label>
                <input type="date" value={orderForm.startDate} onChange={handleOrderFieldChange('startDate')} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Окончание изготовления</label>
                <input
                  type="date"
                  value={orderForm.endDate}
                  onChange={handleOrderFieldChange('endDate')}
                  className={formErrors.endDate ? 'input-invalid' : ''}
                />
                {formErrors.endDate ? <div className="field-error">{formErrors.endDate}</div> : null}
              </div>
            </div>

            <div className="order-items-editor">
              <div className="order-items-editor-header">
                <div className="modal-title" style={{ fontSize: 16 }}>Изделия в заказе</div>
                <button className="btn btn-secondary btn-small" onClick={addItem} disabled={savingOrder}>Добавить изделие</button>
              </div>

              {orderForm.items.map((item, index) => {
                const itemErrors = formErrors.items[index] || {};
                return (
                  <div key={item.clientKey || item.itemId || index} className="order-item-editor-card">
                    <div className="order-item-editor-card-header">
                      <div>
                        <div className="order-item-editor-title">Изделие {index + 1}</div>
                        <div className="order-item-editor-subtitle">Отдельный QR и отдельные комментарии сотрудников</div>
                      </div>
                      <button
                        className="btn btn-danger btn-small"
                        onClick={() => requestRemoveItem(index)}
                        disabled={savingOrder || orderForm.items.length <= 1}
                      >
                        Удалить
                      </button>
                    </div>

                    <div className="responsive-form-grid">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>№ изделия в заказе</label>
                        <input value={item.itemNumber} onChange={handleItemFieldChange(index, 'itemNumber')} placeholder="1" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>№ изделия</label>
                        <input value={item.productNumber} onChange={handleItemFieldChange(index, 'productNumber')} placeholder="Артикул или код" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Помещение</label>
                        <input value={item.room} onChange={handleItemFieldChange(index, 'room')} placeholder="Кухня, спальня" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>№ помещения</label>
                        <input value={item.roomNumber} onChange={handleItemFieldChange(index, 'roomNumber')} placeholder="Например: 12" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Наименование *</label>
                        <input
                          value={item.name}
                          onChange={handleItemFieldChange(index, 'name')}
                          className={itemErrors.name ? 'input-invalid' : ''}
                          placeholder="Например: Шкаф, стол, стул"
                        />
                        {itemErrors.name ? <div className="field-error">{itemErrors.name}</div> : null}
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Кол-во *</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={handleItemFieldChange(index, 'quantity')}
                          className={itemErrors.quantity ? 'input-invalid' : ''}
                        />
                        {itemErrors.quantity ? <div className="field-error">{itemErrors.quantity}</div> : null}
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Материал</label>
                        <input value={item.material} onChange={handleItemFieldChange(index, 'material')} placeholder="ЛДСП, массив, МДФ" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Отгрузка до</label>
                        <input type="date" value={item.deliveryDate} onChange={handleItemFieldChange(index, 'deliveryDate')} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Комплектация</label>
                        <input value={item.packageName} onChange={handleItemFieldChange(index, 'packageName')} placeholder="Фурнитура, стекло, ручки" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Ссылка на фото</label>
                        <input value={item.photoLink} onChange={handleItemFieldChange(index, 'photoLink')} placeholder="https://..." />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                        <label>Примечания по изделию</label>
                        <textarea
                          value={item.notes}
                          onChange={handleItemFieldChange(index, 'notes')}
                          placeholder="ТЗ, пожелания, особенности по изделию"
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={closeForm} disabled={savingOrder}>Отмена</button>
              <button className="btn btn-success" onClick={handleSubmit} disabled={!isFormValid || savingOrder}>
                {savingOrder ? (editingOrderId ? 'Сохранение...' : 'Создание...') : (editingOrderId ? 'Сохранить заказ' : 'Создать заказ')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {qrPreview ? (
        <div className="modal-overlay" onClick={downloadingKey ? undefined : () => setQrPreview(null)}>
          <div className="modal-window modal-window-sm qr-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title mb-16">QR-код заказа {qrPreview.orderNumber ? `№ ${qrPreview.orderNumber}` : ''}</div>
            <div className="modal-subtitle mb-16">
              {qrPreview.itemName || 'Изделие'}{qrPreview.itemNumber ? ` · позиция ${qrPreview.itemNumber}` : ''}
            </div>
            <img
              src={`/api/orders/${qrPreview.orderId}/items/${qrPreview.itemId}/qrcode`}
              alt="QR Code"
              className="qr-image"
            />
            <div className="modal-actions modal-actions-between">
              <button className="btn btn-secondary" onClick={() => setQrPreview(null)} disabled={Boolean(downloadingKey)}>
                Закрыть
              </button>
              <div className="modal-actions-group">
                <button
                  className="btn btn-primary"
                  onClick={() => handleDownloadQr(qrPreview.orderId, qrPreview.itemId, qrPreview.fileNameBase)}
                  disabled={downloadingKey === `${qrPreview.orderId}:${qrPreview.itemId}`}
                >
                  {downloadingKey === `${qrPreview.orderId}:${qrPreview.itemId}` ? 'Скачивание...' : 'Скачать'}
                </button>
                <button className="btn btn-secondary" onClick={handlePrintQr}>
                  Печать
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {orderActionsOrder ? (
        <div className="modal-overlay" onClick={() => setOrderActionsOrder(null)}>
          <div className="modal-window modal-window-sm" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Действия над заказом</div>
                <div className="modal-subtitle">
                  {orderActionsOrder.orderNumber ? `Заказ № ${orderActionsOrder.orderNumber}` : 'Без номера'}
                  {orderActionsOrder.customer ? ` · ${orderActionsOrder.customer}` : ''}
                </div>
              </div>
              <button className="btn btn-small modal-close-btn" onClick={() => setOrderActionsOrder(null)}>✕</button>
            </div>

            <div className="order-actions-modal-list">
              <button
                className="btn btn-primary order-actions-modal-btn"
                type="button"
                onClick={() => {
                  setOrderActionsOrder(null);
                  openEditForm(orderActionsOrder);
                }}
              >
                Редактировать весь заказ
              </button>
              {Array.isArray(orderActionsOrder.items) && orderActionsOrder.items.length > 0 ? (
                <div className="order-actions-qr-section">
                  <div className="order-actions-qr-title">QR-коды изделий</div>
                  <div className="order-actions-qr-list">
                    {orderActionsOrder.items.map((item, index) => (
                      <button
                        key={item.itemId || `${orderActionsOrder._id || orderActionsOrder.orderNumber || 'order'}-${index}`}
                        className="btn btn-secondary order-actions-modal-btn"
                        type="button"
                        onClick={() => {
                          setOrderActionsOrder(null);
                          openQrPreview(orderActionsOrder, item);
                        }}
                      >
                        {`QR ${String(item.name || '').trim() || `изделие ${index + 1}`}`}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {(orderDraftKeys[orderActionsOrder._id || orderActionsOrder.orderNumber || ''] || []).length > 0 ? (
                <button
                  className="btn btn-secondary order-actions-modal-btn"
                  type="button"
                  onClick={() => {
                    cancelOrderInlineEdits(orderActionsOrder._id || orderActionsOrder.orderNumber || '');
                    setOrderActionsOrder(null);
                  }}
                >
                  Отменить быстрые правки по заказу
                </button>
              ) : null}
              <button
                className="btn btn-danger order-actions-modal-btn"
                type="button"
                onClick={() => {
                  requestDelete(orderActionsOrder);
                  setOrderActionsOrder(null);
                }}
              >
                Удалить заказ
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Удалить заказ?"
        message={confirmDelete ? `Заказ № ${confirmDelete.orderNumber || '—'} будет удален без возможности восстановления.\nОсновное изделие: ${confirmDelete.name || '—'}\nЗаказчик: ${confirmDelete.customer || '—'}` : ''}
        confirmLabel="Удалить заказ"
        onConfirm={handleDelete}
        onCancel={() => !deletingOrder && setConfirmDelete(null)}
        loading={deletingOrder}
      />
      <ConfirmDialog
        open={confirmRemoveItemIndex !== null}
        title="Удалить изделие?"
        message={confirmRemoveItemIndex !== null ? `Изделие ${confirmRemoveItemIndex + 1} будет удалено из текущего заказа до сохранения формы.` : ''}
        confirmLabel="Удалить изделие"
        onConfirm={confirmRemoveItem}
        onCancel={() => !savingOrder && setConfirmRemoveItemIndex(null)}
        loading={false}
      />
    </div>
  );
}

export default OrdersWorkspace;
