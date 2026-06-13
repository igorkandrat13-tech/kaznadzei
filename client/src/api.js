const ADMIN_TOKEN_KEY = 'kaznadzei_admin_token';

export function getAdminToken() {
  return window.localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

export function setAdminToken(token) {
  const normalized = (token || '').trim();
  if (!normalized) {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(ADMIN_TOKEN_KEY, normalized);
}

export function clearAdminToken() {
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
}

function withAdminHeaders(headers = {}) {
  const nextHeaders = new Headers(headers);
  const token = getAdminToken();
  if (token) {
    nextHeaders.set('X-Admin-Token', token);
  }
  return nextHeaders;
}

export async function apiFetch(input, init = {}) {
  return fetch(input, {
    ...init,
    headers: withAdminHeaders(init.headers),
  });
}

export async function parseJsonSafely(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function getErrorMessage(response, fallbackMessage) {
  const data = await parseJsonSafely(response);
  return data?.details || data?.message || fallbackMessage;
}
