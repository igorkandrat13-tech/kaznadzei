import React from 'react';
import useEscapeKey from '../useEscapeKey';

function ColorModal({
  mode,
  editColor,
  newColor,
  setEditColor,
  setNewColor,
  onAdd,
  onUpdate,
  onClose,
  saving = false,
}) {
  if (!mode) return null;

  const isEdit = mode === 'edit';
  useEscapeKey(() => {
    if (!saving) onClose();
  });

  return (
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal-window modal-window-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? 'Редактировать цвет' : 'Добавить цвет'}</div>
            <div className="modal-subtitle">Настройка цветов справочника и легенды этапов.</div>
          </div>
          <button className="btn btn-small modal-close-btn" onClick={onClose} disabled={saving}>✕</button>
        </div>

        <div className="form-group">
          <label>Название</label>
          <input
            value={isEdit ? (editColor?.name || '') : newColor.name}
            onChange={e => (isEdit
              ? setEditColor({ ...editColor, name: e.target.value })
              : setNewColor({ ...newColor, name: e.target.value }))}
            placeholder="Например: Орех"
            disabled={saving}
          />
        </div>

        <div className="settings-color-grid">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Цвет</label>
            <input
              type="color"
              value={isEdit ? (editColor?.hex || '#000000') : newColor.hex}
              onChange={e => (isEdit
                ? setEditColor({ ...editColor, hex: e.target.value })
                : setNewColor({ ...newColor, hex: e.target.value }))}
              disabled={saving}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>HEX</label>
            <input
              value={isEdit ? (editColor?.hex || '#000000') : newColor.hex}
              onChange={e => (isEdit
                ? setEditColor({ ...editColor, hex: e.target.value })
                : setNewColor({ ...newColor, hex: e.target.value }))}
              disabled={saving}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-success" onClick={isEdit ? onUpdate : onAdd} disabled={saving}>
            {saving ? (isEdit ? 'Сохранение...' : 'Добавление...') : (isEdit ? 'Сохранить цвет' : 'Добавить цвет')}
          </button>
          <button className="btn" onClick={onClose} disabled={saving}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

export default ColorModal;
