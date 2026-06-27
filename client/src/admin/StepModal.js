import React from 'react';
import { Button, Modal, ModalHeader } from '../ui';

function StepModal({
  mode,
  editStep,
  newStep,
  setEditStep,
  setNewStep,
  onAdd,
  onUpdate,
  onClose,
  saving = false,
}) {
  if (!mode) return null;

  const isEdit = mode === 'edit';

  return (
    <Modal open={Boolean(mode)} onClose={onClose} closeDisabled={saving} size="lg">
      <ModalHeader
        title={isEdit ? 'Редактировать этап' : 'Добавить этап'}
        subtitle="Настройка этапа для выбранной производственной роли."
        onClose={onClose}
        closeDisabled={saving}
      />

      <div className="form-group">
        <label>Название</label>
        <input
          value={isEdit ? (editStep?.stepName || '') : newStep.stepName}
          onChange={e => (isEdit
            ? setEditStep({ ...editStep, stepName: e.target.value })
            : setNewStep({ ...newStep, stepName: e.target.value }))}
          placeholder="Например: Шлифовка"
          disabled={saving}
        />
      </div>

      <div className="form-group">
        <label>Описание</label>
        <textarea
          value={isEdit ? (editStep?.description || '') : newStep.description}
          onChange={e => (isEdit
            ? setEditStep({ ...editStep, description: e.target.value })
            : setNewStep({ ...newStep, description: e.target.value }))}
          placeholder="Краткое описание этапа"
          disabled={saving}
        />
      </div>

      <div className="form-group">
        <label>Порядок</label>
        <input
          type="number"
          value={isEdit ? (editStep?.order || 1) : newStep.order}
          onChange={e => (isEdit
            ? setEditStep({ ...editStep, order: Number(e.target.value) })
            : setNewStep({ ...newStep, order: Number(e.target.value) }))}
          disabled={saving}
        />
      </div>

      <div className="modal-actions">
        <Button variant="success" onClick={isEdit ? onUpdate : onAdd} disabled={saving}>
          {saving ? (isEdit ? 'Сохранение...' : 'Добавление...') : (isEdit ? 'Сохранить этап' : 'Добавить этап')}
        </Button>
        <Button onClick={onClose} disabled={saving}>Отмена</Button>
      </div>
    </Modal>
  );
}

export default StepModal;
