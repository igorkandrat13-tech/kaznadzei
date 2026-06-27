import React from 'react';
import { Button, Modal, ModalHeader } from '../ui';

function CommentsModal({
  commentsModal,
  closeCommentsModal,
  setCommentsModal,
  getRoleLabel,
  getCommentPreview,
}) {
  if (!commentsModal) return null;

  return (
    <Modal open={Boolean(commentsModal)} onClose={closeCommentsModal} size="xl">
      <ModalHeader
        title="📝 Примечания по заказу"
        subtitle={commentsModal.orderName}
        onClose={closeCommentsModal}
      />

      <div className="comments-modal-layout">
        <div className="comments-modal-sidebar">
          {commentsModal.comments.map((comment, index) => (
            <button
              key={`${comment.role}-${index}`}
              className={`comments-modal-item ${commentsModal.activeRole === comment.role ? 'comments-modal-item-active' : ''}`}
              onClick={() => setCommentsModal(current => (current ? { ...current, activeRole: comment.role } : current))}
              type="button"
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
        <Button variant="primary" onClick={closeCommentsModal}>Закрыть</Button>
      </div>
    </Modal>
  );
}

export default CommentsModal;
