import React from 'react';
import useEscapeKey from './useEscapeKey';

const BUTTON_VARIANT_CLASS = {
  default: '',
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  success: 'btn-success',
  danger: 'btn-danger',
  archive: 'btn-archive',
};

const BUTTON_SIZE_CLASS = {
  md: '',
  sm: 'btn-small',
  wide: 'btn-wide',
  inline: 'btn-inline',
};

const MODAL_SIZE_CLASS = {
  sm: 'modal-window-sm',
  md: 'modal-window-md',
  lg: 'modal-window-lg',
  xl: 'modal-window-xl',
};

export function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function getButtonClassName({ variant = 'default', size = 'md', className = '' } = {}) {
  return cn('btn', BUTTON_VARIANT_CLASS[variant] || '', BUTTON_SIZE_CLASS[size] || '', className);
}

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...props
}) {
  return (
    <button type={type} className={getButtonClassName({ variant, size, className })} {...props}>
      {children}
    </button>
  );
}

export function getModalWindowClassName({ size = 'lg', className = '' } = {}) {
  return cn('modal-window', MODAL_SIZE_CLASS[size] || MODAL_SIZE_CLASS.lg, className);
}

export function Modal({
  open = true,
  onClose,
  closeDisabled = false,
  size = 'lg',
  className = '',
  children,
}) {
  const canClose = typeof onClose === 'function' && !closeDisabled;

  useEscapeKey(() => {
    if (canClose) onClose();
  }, open && canClose);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={canClose ? onClose : undefined}>
      <div className={getModalWindowClassName({ size, className })} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  title,
  subtitle,
  onClose,
  closeDisabled = false,
  closeButtonClassName = '',
}) {
  return (
    <div className="modal-header">
      <div>
        <div className="modal-title">{title}</div>
        {subtitle ? <div className="modal-subtitle">{subtitle}</div> : null}
      </div>
      {onClose ? (
        <Button
          size="sm"
          className={cn('modal-close-btn', closeButtonClassName)}
          onClick={onClose}
          disabled={closeDisabled}
          aria-label="Закрыть окно"
        >
          ✕
        </Button>
      ) : null}
    </div>
  );
}
