import React from 'react';
import { Button, Modal, ModalHeader } from '../ui';

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

  return (
    <Modal open={Boolean(mode)} onClose={onClose} closeDisabled={saving} size="md">
      <ModalHeader
        title={isEdit ? 'Редактировать цвет' : 'Добавить цвет'}
        subtitle="Настройка цветов справочника и легенды этапов."
        onClose={onClose}
        closeDisabled={saving}
      />

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
        <Button variant="success" onClick={isEdit ? onUpdate : onAdd} disabled={saving}>
          {saving ? (isEdit ? 'Сохранение...' : 'Добавление...') : (isEdit ? 'Сохранить цвет' : 'Добавить цвет')}
        </Button>
        <Button onClick={onClose} disabled={saving}>Отмена</Button>
      </div>
    </Modal>
  );
}

export default ColorModal;
