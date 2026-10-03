import React from 'react';
import { Link } from 'react-router-dom';

function AdminTokenControls() {
  return (
    <div className="panel-soft">
      <div className="panel-soft-title">Доступ к настройкам</div>
      <div className="panel-soft-text">
        Управление пользователями, паролями и правами доступа осуществляется в отдельном разделе&nbsp;
        <Link to="/users" className="settings-link">Пользователи</Link>.
      </div>
    </div>
  );
}

export default AdminTokenControls;
