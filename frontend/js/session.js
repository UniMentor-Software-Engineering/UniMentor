// Session helpers shared by the pages. The JWT lives in an HttpOnly cookie that
// JavaScript cannot read (ADR 4), so the session is known through GET /auth/me.
import { api } from './api.js';

// Role-specific landing page after login (CU-02, step 6): students and tutors land on
// their CU-11 dashboard, the admin on the admin panel.
const HOME_BY_ROLE = {
  ADMIN: 'admin.html',
  TUTOR: 'dashboard.html', // CU-11
  STUDENT: 'dashboard.html', // CU-11
};

export function homeFor(role) {
  return HOME_BY_ROLE[role] || 'index.html';
}

// Returns the signed-in user. Without a session api.js redirects to the login page.
export function currentUser() {
  return api.get('/auth/me');
}

// For public pages: returns the signed-in user, or null for an anonymous visitor,
// who stays on the page instead of being redirected.
export async function optionalUser() {
  try {
    return await api.get('/auth/me', { redirectOn401: false });
  } catch {
    return null;
  }
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    window.location.href = 'login.html';
  }
}

// Header links for each role (P4 pages included). The admin keeps its own panel.
const NAV_BY_ROLE = {
  STUDENT: [['tutors.html', 'Find tutors'], ['dashboard.html', 'Dashboard']],
  TUTOR: [['dashboard.html', 'Dashboard'], ['availability.html', 'Availability'], ['profile.html', 'Profile']],
  ADMIN: [['admin.html', 'Admin panel']],
};

// Fills <nav id="app-nav"> with the links of the signed-in user's role and marks the
// current page. Uses textContent only (NFR-02).
export function renderNav(user) {
  const nav = document.getElementById('app-nav');
  if (!nav) return;
  // Works with and without the .html extension (/dashboard is rewritten in vercel.json).
  const page = window.location.pathname.split('/').pop() || 'index';
  const current = page.endsWith('.html') ? page : `${page}.html`;
  const links = (user && NAV_BY_ROLE[user.role]) || [];
  nav.replaceChildren(...links.map(([href, label]) => {
    const link = document.createElement('a');
    link.className = 'btn btn-secondary';
    link.href = href;
    link.textContent = label;
    if (href === current) link.setAttribute('aria-current', 'page');
    return link;
  }));
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
