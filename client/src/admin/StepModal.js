import React from 'react';

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
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal-window modal-window-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? 'Редактировать этап' : 'Добавить этап'}</div>
            <div className="modal-subtitle">Настройка этапа для выбранной производственной роли.</div>
          </div>
          <button className="btn btn-small modal-close-btn" onClick={onClose} disabled={saving}>✕</button>
        </div>

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
          <button className="btn btn-success" onClick={isEdit ? onUpdate : onAdd} disabled={saving}>
            {saving ? (isEdit ? 'Сохранение...' : 'Добавление...') : (isEdit ? 'Сохранить этап' : 'Добавить этап')}
          </button>
          <button className="btn" onClick={onClose} disabled={saving}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

export default StepModal;
