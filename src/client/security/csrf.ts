const CSRF_COOKIE = '__Host-sos_sf_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfToken(): string | null {
  const prefix = `${CSRF_COOKIE}=`;
  const value = document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

export function privateHeaders(method: string | undefined, input?: HeadersInit): Headers {
  const headers = new Headers(input);
  headers.set('Accept', 'application/json');
  const normalized = (method ?? 'GET').toUpperCase();
  if (!SAFE_METHODS.has(normalized)) {
    const token = csrfToken();
    if (token) headers.set('X-CSRF-Token', token);
  }
  return headers;
}
