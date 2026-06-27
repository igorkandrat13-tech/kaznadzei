import React from 'react';
import { Button, Modal, ModalHeader } from './ui';

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
  return (
    <Modal open={open} onClose={onCancel} closeDisabled={loading} size="md" className="confirm-dialog">
      <ModalHeader
        title={title}
        subtitle={message ? <span className="confirm-dialog-message">{message}</span> : null}
        onClose={onCancel}
        closeDisabled={loading}
      />

      <div className="modal-actions">
        <Button onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={loading}>
          {loading ? 'Выполнение...' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
