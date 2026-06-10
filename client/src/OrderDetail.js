import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/orders/${id}`)
      .then(async res => {
        if (!res.ok) {
          throw new Error('Order not found');
        }
        return res.json();
      })
      .then(data => setOrder(data || null))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

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

  const calcDuration = (start, end) => {
    if (!start || !end) return '—';
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff + ' дн.' : '—';
  };

  const statusLabel = {
    pending: 'Ожидание',
    in_progress: 'В работе',
    completed: 'Завершён',
  };

  return (
    <div className="card">
      <h2>📋 Заказ: {order.name}</h2>
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
          <tr><td><strong>Статус</strong></td><td><span className={order.overallStatus === 'completed' ? 'badge badge-active' : order.overallStatus === 'in_progress' ? 'badge badge-pending' : 'badge'}>{statusLabel[order.overallStatus] || 'Ожидание'}</span></td></tr>
        </tbody>
      </table>
    </div>
  );
}

export default OrderDetail;
