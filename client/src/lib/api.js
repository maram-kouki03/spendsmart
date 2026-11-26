const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// Called when any (non-auth) request comes back 401, so the app can drop the user and show /login.
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn || (() => {});
}

/**
 * An error with the HTTP status attached, so callers can tell 401/409/429 apart. `code` is the
 * server's machine-readable reason (e.g. "email_not_verified") and `data` the whole JSON body.
 */
export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.code = data.code;
    this.data = data;
  }
}

/** Every request gives up after this long, so nothing can spin forever. */
export const REQUEST_TIMEOUT_MS = 30000;
export const TIMEOUT_MESSAGE = "The server didn't respond. Please try again.";

async function request(method, path, body) {
  const headers = {};
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    // The session lives in an httpOnly cookie; `include` sends it (also when the API is on another origin).
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      body: payload,
      credentials: 'include',
      signal: ctrl.signal,
    });
    return await finish(res, path);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // Aborted by the timer (fetch, or reading the body), or the network failed.
    if (ctrl.signal.aborted) throw new ApiError(TIMEOUT_MESSAGE, 0, { code: 'timeout' });
    throw new ApiError("Can't reach the server — check your connection and try again.", 0, { code: 'network' });
  } finally {
    clearTimeout(timer);
  }
}

async function finish(res, path) {
  // Auth endpoints (wrong password, /auth/me while logged out…) handle their own 401s.
  if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
  if (res.status === 204) return null;
  const data = await res.json().catch((e) => {
    if (e?.name === 'AbortError') throw e;
    return {};
  });
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b),
  put: (p, b) => request('PUT', p, b),
  del: (p, b) => request('DELETE', p, b),
};

export function qs(params) {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== 'all') s.set(k, v);
  });
  const str = s.toString();
  return str ? `?${str}` : '';
}
