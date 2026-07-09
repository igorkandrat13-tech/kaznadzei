import { useEffect } from 'react';

const DEFAULT_ERROR_MESSAGE = 'Не удалось выполнить действие. Повторите попытку.';
const NETWORK_ERROR_MESSAGE = 'Не удалось связаться с сервером. Проверьте подключение и повторите попытку.';

let noticeSequence = 0;
let notices = [];
const listeners = new Set();

function emitNotices() {
  listeners.forEach((listener) => listener(notices));
}

function asString(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeErrorMessage(errorOrMessage, fallbackMessage = DEFAULT_ERROR_MESSAGE) {
  const fallback = asString(fallbackMessage) || DEFAULT_ERROR_MESSAGE;

  if (!errorOrMessage) {
    return fallback;
  }

  const rawMessage = typeof errorOrMessage === 'string'
    ? errorOrMessage
    : (
      errorOrMessage.details
      || errorOrMessage.message
      || errorOrMessage.error
      || errorOrMessage.statusText
      || ''
    );

  const message = asString(rawMessage);
  if (!message || message === 'Error' || message === '[object Object]') {
    return fallback;
  }

  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return NETWORK_ERROR_MESSAGE;
  }

  if (/^http\s*\d+$/i.test(message)) {
    return fallback;
  }

  return message;
}

export function pushGlobalNotice({
  type = 'error',
  title = '',
  message = '',
  durationMs = 7000,
} = {}) {
  const normalizedMessage = normalizeErrorMessage(message, DEFAULT_ERROR_MESSAGE);
  const normalizedTitle = asString(title);
  const duplicateNotice = notices.find((notice) => (
    notice.type === type
    && notice.title === normalizedTitle
    && notice.message === normalizedMessage
  ));

  if (duplicateNotice) {
    return duplicateNotice.id;
  }

  const noticeId = `global-notice-${Date.now()}-${noticeSequence += 1}`;
  notices = [
    ...notices,
    {
      id: noticeId,
      type,
      title: normalizedTitle,
      message: normalizedMessage,
    },
  ];
  emitNotices();

  if (durationMs > 0) {
    window.setTimeout(() => {
      dismissGlobalNotice(noticeId);
    }, durationMs);
  }

  return noticeId;
}

export function showGlobalError(errorOrMessage, fallbackMessage = DEFAULT_ERROR_MESSAGE) {
  return pushGlobalNotice({
    type: 'error',
    title: 'Ошибка',
    message: normalizeErrorMessage(errorOrMessage, fallbackMessage),
  });
}

export function dismissGlobalNotice(id) {
  const nextNotices = notices.filter((notice) => notice.id !== id);
  if (nextNotices.length === notices.length) return;
  notices = nextNotices;
  emitNotices();
}

export function clearGlobalNotices() {
  if (notices.length === 0) return;
  notices = [];
  emitNotices();
}

export function subscribeToGlobalNotices(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  listeners.add(listener);
  listener(notices);
  return () => {
    listeners.delete(listener);
  };
}

export function useGlobalErrorEffect(errorMessage, fallbackMessage = DEFAULT_ERROR_MESSAGE) {
  useEffect(() => {
    if (!errorMessage) return;
    showGlobalError(errorMessage, fallbackMessage);
  }, [errorMessage, fallbackMessage]);
}
