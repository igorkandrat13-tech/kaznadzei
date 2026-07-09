import { getAppAuthToken, getSettingsPinSessionToken } from './appAuth';

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
  const authToken = getAppAuthToken();
  if (authToken) {
    nextHeaders.set('Authorization', `Bearer ${authToken}`);
  }
  const settingsPinToken = getSettingsPinSessionToken();
  if (settingsPinToken) {
    nextHeaders.set('X-Settings-Pin-Token', settingsPinToken);
  }
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
    const trimmed = text.trim();
    if (/^<!doctype html|^<html[\s>]/i.test(trimmed)) {
      const titleMatch = trimmed.match(/<title>([^<]+)<\/title>/i);
      const headingMatch = trimmed.match(/<h1>([^<]+)<\/h1>/i);
      const htmlMessage = titleMatch?.[1] || headingMatch?.[1] || `HTTP ${response.status}`;
      return { message: htmlMessage };
    }
    return { message: text };
  }
}

export async function getErrorMessage(response, fallbackMessage) {
  const data = await parseJsonSafely(response);
  return data?.details || data?.message || fallbackMessage;
}
