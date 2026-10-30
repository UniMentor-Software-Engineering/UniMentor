// Session helpers shared by the pages. The JWT lives in an HttpOnly cookie that
// JavaScript cannot read (ADR 4), so the session is known through GET /auth/me.
import { api } from './api.js';

// Role-specific landing page after login (CU-02, step 6).
// TODO(P5): point STUDENT and TUTOR to the CU-11 dashboard when it exists.
const HOME_BY_ROLE = {
  ADMIN: 'admin.html',
  TUTOR: 'index.html',
  STUDENT: 'index.html',
};

export function homeFor(role) {
  return HOME_BY_ROLE[role] || 'index.html';
}

// Returns the signed-in user. Without a session api.js redirects to the login page.
export function currentUser() {
  return api.get('/auth/me');
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    window.location.href = 'login.html';
  }
}

// Shows a toast (base.css) for a few seconds. Text only, never HTML (NFR-02, XSS).
export function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 4000);
}
