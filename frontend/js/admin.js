// Admin panel: CU-13 (user directory and suspension) and CU-14 (metrics and audit log).
// Every user-supplied text is written with textContent, never innerHTML (NFR-02, XSS).
import { api } from './api.js';
import { currentUser, homeFor, logout, showToast } from './session.js';

const PAGE_SIZE = 20;
const state = {
  admin: null,
  users: { offset: 0, filters: {} },
  audit: { offset: 0, action: '' },
  dialogTarget: null,
};

// ---------- Small DOM helpers ----------
function el(tag, { text, className } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function row(cells) {
  const tr = document.createElement('tr');
  cells.forEach((cell) => {
    const td = document.createElement('td');
    if (cell instanceof Node) td.append(cell);
    else td.textContent = cell ?? '';
    tr.append(td);
  });
  return tr;
}

function messageRow(tbody, columns, text) {
  const td = el('td', { text, className: 'text-muted' });
  td.colSpan = columns;
  const tr = document.createElement('tr');
  tr.append(td);
  tbody.replaceChildren(tr);
}

function query(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== undefined && value !== null) search.set(key, value);
  });
  return search.toString();
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

// ---------- CU-14: metrics ----------
async function loadMetrics() {
  const grid = document.getElementById('metrics');
  try {
    const m = await api.get('/admin/metrics');
    const cards = [
      ['Total bookings', m.total_bookings],
      ['Completed sessions', m.completed_sessions],
      ['Cancellation rate', `${(m.cancellation_rate * 100).toFixed(1)} %`],
      ['Late cancellations', m.late_cancellations],
      ['Active tutors', m.active_tutors],
      ['Free future slots', m.available_future_slots],
      ['Students', m.students],
      ['Suspended accounts', m.suspended_users],
    ];
    grid.replaceChildren(...cards.map(([label, value]) => {
      const card = el('div', { className: 'metric' });
      card.append(el('div', { text: value, className: 'metric-value' }), el('div', { text: label, className: 'metric-label' }));
      return card;
    }));
    renderSessionsChart(m);
  } catch (err) {
    grid.replaceChildren(el('p', { text: err.message, className: 'field-error' }));
  }
}

function renderSessionsChart(m) {
  const chart = document.getElementById('sessions-chart');
  const total = m.total_bookings || 0;
  const bars = [
    ['Confirmed', m.confirmed_sessions, 'bar-confirmed'],
    ['Completed', m.completed_sessions, 'bar-completed'],
    ['Cancelled', m.cancelled_sessions, 'bar-cancelled'],
  ];
  chart.replaceChildren(...bars.map(([label, value, color]) => {
    const line = el('div', { className: 'bar-row' });
    const track = el('div', { className: 'bar-track' });
    const fill = el('div', { className: `bar-fill ${color}` });
    fill.style.width = total > 0 ? `${(value / total) * 100}%` : '0';
    track.append(fill);
    track.setAttribute('role', 'img');
    track.setAttribute('aria-label', `${label}: ${value} of ${total}`);
    line.append(el('span', { text: label }), track, el('span', { text: value }));
    return line;
  }));
}

// ---------- CU-13: user directory ----------
function statusBadge(status) {
  return el('span', {
    text: status === 'ACTIVE' ? 'Active' : 'Suspended',
    className: `badge ${status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`,
  });
}

function userRow(user) {
  let action = el('span');
  // Business rule: an administrator cannot suspend their own account.
  if (user.id !== state.admin.id) {
    const suspend = user.status === 'ACTIVE';
    action = el('button', {
      text: suspend ? 'Suspend Account' : 'Reactivate',
      className: `btn ${suspend ? 'btn-danger' : 'btn-secondary'}`,
    });
    action.type = 'button';
    action.addEventListener('click', () => openDialog(user, suspend ? 'suspend' : 'reactivate'));
  }
  const tr = row([`${user.first_name} ${user.last_name}`, user.email, user.role, statusBadge(user.status), action]);
  tr.dataset.userId = user.id;
  return tr;
}

async function loadUsers() {
  const tbody = document.getElementById('users-body');
  const { offset, filters } = state.users;
  try {
    const users = await api.get(`/admin/users?${query({ ...filters, limit: PAGE_SIZE, offset })}`);
    if (users.length === 0) messageRow(tbody, 5, 'No users match these filters.');
    else tbody.replaceChildren(...users.map(userRow));
    updatePagination('users', offset, users.length);
  } catch (err) {
    messageRow(tbody, 5, err.message);
  }
}

// ---------- CU-14: audit log ----------
function describeDetails(details) {
  if (!details) return '';
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.length : value}`)
    .join(' · ');
}

async function loadAuditLogs() {
  const tbody = document.getElementById('audit-body');
  const { offset, action } = state.audit;
  try {
    const logs = await api.get(`/admin/audit-logs?${query({ action, limit: PAGE_SIZE, offset })}`);
    if (logs.length === 0) {
      messageRow(tbody, 5, 'No audit entries yet.');
    } else {
      tbody.replaceChildren(...logs.map((log) => {
        const details = el('span', { text: describeDetails(log.details), className: 'details-cell' });
        return row([
          dateFormat.format(new Date(log.created_at)),
          log.action,
          log.actor_email || 'System',
          log.target_id ? `${log.target_type} ${log.target_id.slice(0, 8)}…` : log.target_type,
          details,
        ]);
      }));
    }
    updatePagination('audit', offset, logs.length);
  } catch (err) {
    messageRow(tbody, 5, err.message);
  }
}

// The API returns a page of results without a total: "Next" is enabled when the page is full.
function updatePagination(name, offset, count) {
  document.getElementById(`${name}-prev`).disabled = offset === 0;
  document.getElementById(`${name}-next`).disabled = count < PAGE_SIZE;
  document.getElementById(`${name}-page`).textContent = `Page ${offset / PAGE_SIZE + 1}`;
}

// ---------- Suspend / reactivate dialog (CU-13, step 3) ----------
const dialog = document.getElementById('status-dialog');
const dialogForm = document.getElementById('status-form');
const reasonInput = document.getElementById('reason');
const reasonError = document.getElementById('reason-error');
const confirmButton = document.getElementById('dialog-confirm');

function openDialog(user, mode) {
  state.dialogTarget = { user, mode };
  const name = `${user.first_name} ${user.last_name}`;
  document.getElementById('dialog-title').textContent = mode === 'suspend' ? `Suspend ${name}?` : `Reactivate ${name}?`;
  document.getElementById('dialog-text').textContent = mode === 'suspend'
    ? 'The account will be blocked immediately, its upcoming sessions cancelled and their slots released.'
    : 'The account will be able to sign in again.';
  confirmButton.textContent = mode === 'suspend' ? 'Suspend Account' : 'Reactivate';
  confirmButton.className = `btn ${mode === 'suspend' ? 'btn-danger' : 'btn-primary'}`;
  reasonInput.value = '';
  reasonError.textContent = '';
  reasonInput.setAttribute('aria-invalid', 'false');
  dialog.showModal();
  reasonInput.focus();
}

document.getElementById('dialog-cancel').addEventListener('click', () => dialog.close());

dialogForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const reason = reasonInput.value.trim();
  if (!reason) {
    reasonError.textContent = 'A reason is required.';
    reasonInput.setAttribute('aria-invalid', 'true');
    return;
  }

  const { user, mode } = state.dialogTarget;
  confirmButton.disabled = true;
  try {
    const result = await api.post(`/admin/users/${user.id}/${mode}`, { reason });
    dialog.close();
    // Step 6: the status badge changes at once, without reloading the list.
    const current = document.querySelector(`tr[data-user-id="${CSS.escape(user.id)}"]`);
    if (current) current.replaceWith(userRow(result.user));
    showToast(mode === 'suspend'
      ? `Account suspended. ${result.cancelledAppointments} upcoming session(s) cancelled.`
      : 'Account reactivated.');
    loadMetrics();
    loadAuditLogs();
  } catch (err) {
    reasonError.textContent = err.message;
  } finally {
    confirmButton.disabled = false;
  }
});

// ---------- Events ----------
document.getElementById('users-filters').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  state.users = {
    offset: 0,
    filters: { search: form.search.value.trim(), role: form.role.value, status: form.status.value },
  };
  loadUsers();
});

document.getElementById('audit-action').addEventListener('change', (event) => {
  state.audit = { offset: 0, action: event.target.value };
  loadAuditLogs();
});

[['users', loadUsers], ['audit', loadAuditLogs]].forEach(([name, load]) => {
  document.getElementById(`${name}-prev`).addEventListener('click', () => {
    state[name].offset = Math.max(0, state[name].offset - PAGE_SIZE);
    load();
  });
  document.getElementById(`${name}-next`).addEventListener('click', () => {
    state[name].offset += PAGE_SIZE;
    load();
  });
});

document.getElementById('refresh-metrics').addEventListener('click', loadMetrics);
document.getElementById('logout-button').addEventListener('click', logout);

// ---------- Start ----------
async function init() {
  const user = await currentUser(); // without a session, api.js redirects to login.html
  if (user.role !== 'ADMIN') {
    window.location.href = homeFor(user.role);
    return;
  }
  state.admin = user;
  document.getElementById('admin-name').textContent = `${user.first_name} ${user.last_name}`;
  await Promise.all([loadMetrics(), loadUsers(), loadAuditLogs()]);
}

init().catch((err) => showToast(err.message, 'error'));
