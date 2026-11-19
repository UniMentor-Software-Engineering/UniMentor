// "My Sessions" for students and tutors.
// CU-08 step 9: landing page after a booking (?booked=1 shows the confirmation).
// CU-09: "Cancel Session" with an optional reason; late cancellations (< 4 h) are warned
// about before confirming (A1) and the cancelled session moves to the past/cancelled tab (step 7).
// Every text from the API is written with textContent (NFR-02, XSS).
import { api } from './api.js';
import { currentUser, homeFor, logout, renderNav, showToast } from './session.js';
import { SESSION_TYPES, el, hoursUntil, sessionLabel } from './dates.js';

const LATE_HOURS = 4; // BR-CONF-02

const lists = {
  upcoming: document.getElementById('list-upcoming'),
  past: document.getElementById('list-past'),
};
const tabs = {
  upcoming: document.getElementById('tab-upcoming'),
  past: document.getElementById('tab-past'),
};

const dialog = document.getElementById('cancel-dialog');
const cancelForm = document.getElementById('cancel-form');
const cancelSummary = document.getElementById('cancel-summary');
const lateWarning = document.getElementById('cancel-late-warning');
const cancelError = document.getElementById('cancel-error');
const confirmCancel = document.getElementById('confirm-cancel');

let selected = null;

function counterpart(appointment) {
  return appointment.my_role === 'STUDENT'
    ? `with ${appointment.tutor_first_name} ${appointment.tutor_last_name}`
    : `with ${appointment.student_first_name} ${appointment.student_last_name} (student)`;
}

function statusBadge(appointment) {
  if (appointment.status === 'CANCELLED') {
    const who = appointment.cancelled_by_me ? 'by you' : 'by the other participant';
    const late = appointment.is_late_cancellation ? ' · late' : '';
    return el('span', `Cancelled ${who}${late}`, `badge ${appointment.is_late_cancellation ? 'badge-warning' : 'badge-danger'}`);
  }
  if (appointment.status === 'COMPLETED') return el('span', 'Completed', 'badge badge-success');
  // CONFIRMED but already over: P5 (CU-12) will mark it completed.
  if (new Date(appointment.end_time) <= new Date()) return el('span', 'Finished', 'badge badge-muted');
  return el('span', 'Confirmed', 'badge badge-success');
}

// Only https links from the tutor's profile are rendered as links (NFR-02).
function meetingLink(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    const link = el('a', 'Join meeting', 'btn btn-primary');
    link.href = parsed.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  } catch {
    return null;
  }
}

function appointmentCard(appointment, scope) {
  const card = el('article', undefined, 'card appointment-card');

  const head = el('div', undefined, 'appointment-head');
  head.append(el('h3', sessionLabel(appointment.start_time, appointment.end_time)), statusBadge(appointment));
  card.append(head);

  const meta = el('div', undefined, 'appointment-meta');
  meta.append(el('span', counterpart(appointment)));
  const type = SESSION_TYPES[appointment.session_type];
  if (type) meta.append(el('span', type.label, 'badge badge-info'));
  card.append(meta);

  if (appointment.student_inquiry) {
    card.append(el('p', `“${appointment.student_inquiry}”`, 'appointment-inquiry'));
  }
  if (appointment.status === 'CANCELLED' && appointment.cancellation_reason) {
    card.append(el('p', `Reason: ${appointment.cancellation_reason}`, 'appointment-inquiry'));
  }

  if (scope === 'upcoming') {
    const actions = el('div', undefined, 'appointment-actions');
    const join = appointment.meeting_url && meetingLink(appointment.meeting_url);
    if (join) actions.append(join);

    // A session that has already started cannot be cancelled any more.
    if (new Date(appointment.start_time) > new Date()) {
      const cancel = el('button', 'Cancel Session', 'btn btn-secondary');
      cancel.type = 'button';
      cancel.addEventListener('click', () => openCancel(appointment));
      actions.append(cancel);
    }
    if (actions.children.length) card.append(actions);
  }
  return card;
}

const EMPTY = {
  upcoming: 'You have no upcoming sessions.',
  past: 'No past or cancelled sessions yet.',
};

async function loadList(scope) {
  const list = lists[scope];
  list.replaceChildren(el('p', 'Loading…', 'text-muted'));
  try {
    const appointments = await api.get(`/appointments/me?scope=${scope}`);
    if (appointments.length === 0) {
      const empty = el('p', EMPTY[scope], 'card empty-state');
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(...appointments.map((a) => appointmentCard(a, scope)));
  } catch (err) {
    list.replaceChildren(el('p', err.message, 'field-error'));
  }
}

function selectTab(scope) {
  Object.entries(tabs).forEach(([name, tab]) => {
    const active = name === scope;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    lists[name].hidden = !active;
  });
  loadList(scope);
}

tabs.upcoming.addEventListener('click', () => selectTab('upcoming'));
tabs.past.addEventListener('click', () => selectTab('past'));

// ---------- CU-09: cancel ----------

function openCancel(appointment) {
  selected = appointment;
  cancelForm.reset();
  cancelError.textContent = '';
  cancelSummary.textContent = `${sessionLabel(appointment.start_time, appointment.end_time)} ${counterpart(appointment)}.`;
  // A1: warn before confirming when less than 4 hours remain.
  lateWarning.hidden = hoursUntil(appointment.start_time) >= LATE_HOURS;
  confirmCancel.disabled = false;
  dialog.showModal();
}

cancelForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selected) return;
  confirmCancel.disabled = true;
  cancelError.textContent = '';
  try {
    const reason = cancelForm.elements.reason.value.trim();
    const result = await api.patch(`/appointments/${encodeURIComponent(selected.id)}/cancel`, reason ? { reason } : {});
    dialog.close();
    showToast(result.message, result.appointment?.is_late_cancellation ? 'error' : 'success');
    loadList('upcoming');
  } catch (err) {
    cancelError.textContent = err.message;
    confirmCancel.disabled = false;
  }
});

dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { selected = null; });

// ---------- Start ----------

async function init() {
  const user = await currentUser();
  // Only students and tutors have sessions; the admin goes back to their panel.
  if (user.role !== 'STUDENT' && user.role !== 'TUTOR') {
    window.location.href = homeFor(user.role);
    return;
  }
  renderNav(user);
  document.getElementById('user-name').textContent = `${user.first_name} ${user.last_name}`;
  document.getElementById('logout-button').addEventListener('click', logout);

  const params = new URLSearchParams(window.location.search);
  if (params.get('booked') === '1') {
    showToast('Session booked. You will find the meeting link here.');
    window.history.replaceState(null, '', window.location.pathname);
  }
  selectTab('upcoming');
}

init().catch((err) => showToast(err.message, 'error'));
