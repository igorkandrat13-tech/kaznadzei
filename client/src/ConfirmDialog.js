import React from 'react';
import useEscapeKey from './useEscapeKey';

function ConfirmDialog({
  open,
  title = 'Подтвердите действие',
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  onConfirm,
  onCancel,
  loading = false,
  variant = 'danger',
}) {
  if (!open) return null;

  useEscapeKey(() => {
    if (!loading) onCancel();
  });

  return (
    <div className="modal-overlay" onClick={loading ? undefined : onCancel}>
      <div className="modal-window confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            {message ? <div className="modal-subtitle confirm-dialog-message">{message}</div> : null}
          </div>
          <button className="btn btn-small modal-close-btn" onClick={onCancel} disabled={loading}>
            ✕
          </button>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${variant === 'danger' ? 'confirm-dialog-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Выполнение...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
