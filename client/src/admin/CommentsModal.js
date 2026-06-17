import React from 'react';

function CommentsModal({
  commentsModal,
  closeCommentsModal,
  setCommentsModal,
  getRoleLabel,
  getCommentPreview,
}) {
  if (!commentsModal) return null;

  return (
    <div className="modal-overlay" onClick={closeCommentsModal}>
      <div className="modal-window modal-window-xl" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">📝 Примечания по заказу</div>
            <div className="modal-subtitle">{commentsModal.orderName}</div>
          </div>
          <button className="btn btn-small modal-close-btn" onClick={closeCommentsModal}>✕</button>
        </div>

        <div className="comments-modal-layout">
          <div className="comments-modal-sidebar">
            {commentsModal.comments.map((comment, index) => (
              <button
                key={`${comment.role}-${index}`}
                className={`comments-modal-item ${commentsModal.activeRole === comment.role ? 'comments-modal-item-active' : ''}`}
                onClick={() => setCommentsModal(current => (current ? { ...current, activeRole: comment.role } : current))}
              >
                <div className="comments-modal-item-title">{getRoleLabel(comment.role)}</div>
                <div className="comments-modal-item-preview">
                  {getCommentPreview(comment.text)}
                </div>
              </button>
            ))}
          </div>

          <div className="comments-modal-body">
            {(() => {
              const activeComment = commentsModal.comments.find(comment => comment.role === commentsModal.activeRole) || commentsModal.comments[0];
              return (
                <>
                  <div className="comments-modal-body-title">
                    {getRoleLabel(activeComment.role)}
                  </div>
                  <div className="comments-modal-body-date">
                    {activeComment.createdAt ? new Date(activeComment.createdAt).toLocaleString() : 'Дата не указана'}
                  </div>
                  <div className="comments-modal-body-text">
                    {activeComment.text}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={closeCommentsModal}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

export default CommentsModal;
