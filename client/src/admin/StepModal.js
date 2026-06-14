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
}) {
  if (!mode) return null;

  const isEdit = mode === 'edit';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window" style={{ maxWidth: 760 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? 'Редактировать этап' : 'Добавить этап'}</div>
            <div className="modal-subtitle">Настройка этапа для выбранной производственной роли.</div>
          </div>
          <button className="btn" style={{ padding: '6px 10px' }} onClick={onClose}>✕</button>
        </div>

        <div className="form-group">
          <label>Название</label>
          <input
            value={isEdit ? (editStep?.stepName || '') : newStep.stepName}
            onChange={e => (isEdit
              ? setEditStep({ ...editStep, stepName: e.target.value })
              : setNewStep({ ...newStep, stepName: e.target.value }))}
            placeholder="Например: Шлифовка"
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
          />
        </div>

        <div className="modal-actions">
          <button className="btn btn-success" onClick={isEdit ? onUpdate : onAdd}>
            {isEdit ? 'Сохранить этап' : 'Добавить этап'}
          </button>
          <button className="btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

export default StepModal;
