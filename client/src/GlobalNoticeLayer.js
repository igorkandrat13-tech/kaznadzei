import React, { useEffect, useState } from 'react';
import { dismissGlobalNotice, subscribeToGlobalNotices } from './globalErrors';
import { Button } from './ui';

function GlobalNoticeLayer() {
  const [notices, setNotices] = useState([]);

  useEffect(() => {
    return subscribeToGlobalNotices(setNotices);
  }, []);

  if (notices.length === 0) {
    return null;
  }

  return (
    <div className="global-notice-layer" aria-live="assertive" aria-atomic="true">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`global-notice global-notice-${notice.type || 'error'}`}
          role="alert"
        >
          <div className="global-notice-body">
            {notice.title ? <div className="global-notice-title">{notice.title}</div> : null}
            <div className="global-notice-message">{notice.message}</div>
          </div>
          <Button
            size="sm"
            className="global-notice-close"
            onClick={() => dismissGlobalNotice(notice.id)}
            aria-label="Закрыть сообщение об ошибке"
          >
            ✕
          </Button>
        </div>
      ))}
    </div>
  );
}

export default GlobalNoticeLayer;
