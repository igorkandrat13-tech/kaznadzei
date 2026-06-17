import React from 'react';

function ColorModal({
  mode,
  editColor,
  newColor,
  setEditColor,
  setNewColor,
  onAdd,
  onUpdate,
  onClose,
}) {
  if (!mode) return null;

  const isEdit = mode === 'edit';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window modal-window-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? 'Редактировать цвет' : 'Добавить цвет'}</div>
            <div className="modal-subtitle">Настройка палитры для малярного цеха.</div>
          </div>
          <button className="btn btn-small modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="form-group">
          <label>Название</label>
          <input
            value={isEdit ? (editColor?.name || '') : newColor.name}
            onChange={e => (isEdit
              ? setEditColor({ ...editColor, name: e.target.value })
              : setNewColor({ ...newColor, name: e.target.value }))}
            placeholder="Например: Орех"
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
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>HEX</label>
            <input
              value={isEdit ? (editColor?.hex || '#000000') : newColor.hex}
              onChange={e => (isEdit
                ? setEditColor({ ...editColor, hex: e.target.value })
                : setNewColor({ ...newColor, hex: e.target.value }))}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-success" onClick={isEdit ? onUpdate : onAdd}>
            {isEdit ? 'Сохранить цвет' : 'Добавить цвет'}
          </button>
          <button className="btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

export default ColorModal;
