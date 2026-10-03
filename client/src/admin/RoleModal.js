import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal, ModalHeader } from '../ui';
import { normalizePagePermissions, PAGE_KEYS } from '../appAuth';

const PAGE_OPTIONS = [
  { key: 'orders', label: 'Заказы' },
  { key: 'requests', label: 'Заявки' },
  { key: 'archive', label: 'Архив' },
  { key: 'customers', label: 'Заказчики' },
  { key: 'employees', label: 'Сотрудники' },
  { key: 'stages', label: 'Этапы производства' },
  { key: 'users', label: 'Пользователи' },
  { key: 'settings', label: 'Настройки' },
];

function safeGetObj(obj, key, fallback) {
  return obj && typeof obj === 'object' && key in obj ? obj[key] : fallback;
}

function RoleModal({
  open,
  mode = 'create',
  initialRole,
  onClose,
  onSubmit,
  submitting = false,
}) {
  const isEdit = mode === 'edit';
  const isSystemView = Boolean(initialRole?.isSystem);

  const [name, setName] = useState('');
  const [pages, setPages] = useState(() => normalizePagePermissions({}));
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [localError, setLocalError] = useState('');
  const dropdownAnchorRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName(initialRole?.name || '');
      setPages(normalizePagePermissions(initialRole?.pages || {}));
      setSearch('');
      setDropdownOpen(false);
      setLocalError('');
    }
  }, [open, initialRole]);

  useEffect(() => {
    if (!open || !dropdownOpen) return undefined;
    const handleClick = (e) => {
      if (!dropdownAnchorRef.current) return;
      if (!dropdownAnchorRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, dropdownOpen]);

  const togglePage = (key) => {
    if (isSystemView) return;
    setPages((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredPages = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return PAGE_OPTIONS;
    return PAGE_OPTIONS.filter(opt => opt.label.toLowerCase().includes(q));
  }, [search]);

  const checkedCount = useMemo(() => Object.values(pages).filter(Boolean).length, [pages]);

  const handleSubmit = () => {
    setLocalError('');
    if (!name.trim() || name.trim().length < 3) {
      setLocalError('Имя права должно содержать минимум 3 символа.');
      return;
    }
    if (name.trim().length > 50) {
      setLocalError('Имя права слишком длинное (50 символов макс.).');
      return;
    }
    onSubmit && onSubmit({
      name: name.trim(),
      pages: normalizePagePermissions(pages),
    });
  };

  return (
    <Modal open={open} onClose={onClose} size="md" className="role-modal">
      <ModalHeader
        title={isEdit ? (isSystemView ? 'Системное право' : 'Редактировать право') : 'Добавить право'}
        subtitle={isSystemView
          ? 'Это системное право с полным доступом — его нельзя изменить.'
          : 'Задайте имя и выберите страницы, доступные пользователям с этим правом.'}
        onClose={onClose}
        closeDisabled={submitting}
      />
      <div style={{ padding: '0 20px 8px' }}>
        {localError ? (
          <div className="settings-alert settings-alert-error mb-16">{localError}</div>
        ) : null}
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Имя права</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Закупки, Бухгалтер, Мастер"
            disabled={submitting || isSystemView}
            maxLength={50}
          />
        </div>

        <div ref={dropdownAnchorRef} className="form-group" style={{ marginBottom: 12 }}>
          <label>Доступные страницы</label>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn"
              style={{
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              onClick={() => setDropdownOpen(v => !v)}
              disabled={submitting || isSystemView}
            >
              <span>Отмечено: <strong>{checkedCount}</strong> / {PAGE_KEYS.length}</span>
              <span aria-hidden="true">{dropdownOpen ? '▴' : '▾'}</span>
            </button>
            {dropdownOpen ? (
              <div
                className="settings-dropdown-panel role-pages-dropdown"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 60,
                  maxHeight: 320,
                  overflowY: 'auto',
                  borderRadius: 10,
                  boxShadow: '0 10px 24px rgba(2,6,23,0.18)',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div style={{ padding: 10, borderBottom: '1px solid #eef2f7', position: 'sticky', top: 0, background: '#ffffff', zIndex: 1 }}>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск страницы..."
                    style={{ marginBottom: 0 }}
                  />
                </div>
                <div style={{ padding: 6 }}>
                  {filteredPages.length === 0 ? (
                    <div style={{ padding: 10, opacity: 0.6, fontSize: 13 }}>Ничего не найдено</div>
                  ) : (
                    filteredPages.map(opt => (
                      <label
                        key={opt.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          gap: 10,
                          padding: '9px 10px',
                          cursor: isSystemView ? 'default' : 'pointer',
                          borderRadius: 8,
                          userSelect: 'none',
                        }}
                        onMouseEnter={(e) => { if (!isSystemView) e.currentTarget.style.background = '#f3f7ff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(safeGetObj(pages, opt.key, false))}
                          onChange={() => togglePage(opt.key)}
                          disabled={isSystemView}
                          style={{ flexShrink: 0, width: 18, height: 18 }}
                        />
                        <span style={{
                          fontSize: 14,
                          color: '#0f172a',
                          fontWeight: 500,
                          lineHeight: 1.2,
                          flex: 1,
                          minWidth: 0,
                        }}>
                          {opt.label}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 8,
          padding: 10,
          background: '#f7f9fc',
          borderRadius: 10,
          border: '1px solid #eef2f7',
          minHeight: 22,
        }}>
          {PAGE_OPTIONS.filter(opt => Boolean(safeGetObj(pages, opt.key, false))).map(opt => (
            <span key={opt.key} style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '5px 12px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)',
              color: '#ffffff',
              boxShadow: '0 2px 6px rgba(249,115,22,0.22)',
              letterSpacing: 0.1,
            }}>
              {opt.label}
            </span>
          ))}
          {checkedCount === 0 ? (
            <span style={{ fontSize: 13, opacity: 0.6, padding: '4px 2px' }}>Нет отмеченных страниц</span>
          ) : null}
        </div>
      </div>
      <div className="modal-actions">
        <Button onClick={onClose} disabled={submitting}>Отмена</Button>
        <Button
          variant={isSystemView ? 'primary' : 'success'}
          onClick={isSystemView ? onClose : handleSubmit}
          disabled={submitting || isSystemView ? false : submitting}
        >
          {submitting ? 'Сохранение...' : (isSystemView ? 'Понятно' : (isEdit ? 'Сохранить' : 'Добавить'))}
        </Button>
      </div>
    </Modal>
  );
}

export default RoleModal;
export { PAGE_OPTIONS };
