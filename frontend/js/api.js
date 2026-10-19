// Shared HTTP client for the whole frontend. Every page talks to the backend through
// this module and never calls fetch() directly, so the following rules live in one place:
//  - credentials: 'include' -> the browser sends the HttpOnly JWT cookie to the API on
//    another site (ADR 4). Frontend JavaScript never reads or stores the token.
//  - JSON in, JSON out.
//  - X-Requested-With header on every request: a custom header cannot be sent cross-site
//    without passing CORS, which is the basis of the CSRF protection required by ADR 4.
//  - Errors use the backend format { error: { status, message, code } } and are thrown
//    as ApiError, so pages only need try/catch.
//  - 401 (missing/expired session) redirects to the login page (CU-11, A1).
import { API_BASE_URL, LOGIN_PAGE } from './config.js';

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body) {
  const options = {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.', 'NETWORK_ERROR');
  }

  // 204 No Content (e.g. DELETE) has no body to parse.
  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error?.message || `Request failed with status ${response.status}`;
    const error = new ApiError(response.status, message, data?.error?.code);

    const onLoginPage = window.location.pathname.endsWith(LOGIN_PAGE);
    if (response.status === 401 && !onLoginPage) {
      window.location.href = LOGIN_PAGE;
    }
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};
