// CU-11: personal dashboard for students and tutors.
//  - GET /api/appointments/me returns { upcoming, history } (step 3); sessions that have
//    ended are already COMPLETED and in the history (business rule).
//  - Upcoming cards: meeting link and "Cancel Session" (CU-09, with optional reason and the
//    late-cancellation warning of A1).
//  - History cards: tutor notes, rating and feedback, and "Add Notes / Review" on completed
//    sessions (CU-12): tutors write notes, students rate 1-5 once.
//  - A1: without a valid session api.js redirects to the login page.
// CU-08 step 9: the student lands here after booking (?booked=1).
// Every text from the API is written with textContent (NFR-02, XSS).
import { api } from './api.js';
import { currentUser, homeFor, logout, renderNav, showToast } from './session.js';
import { SESSION_TYPES, el, hoursUntil, sessionLabel } from './dates.js';

const LATE_HOURS = 4; // BR-CONF-02

const lists = {
  upcoming: document.getElementById('list-upcoming'),
  history: document.getElementById('list-history'),
};
const tabs = {
  upcoming: document.getElementById('tab-upcoming'),
  history: document.getElementById('tab-history'),
};
const counts = {
  upcoming: document.getElementById('count-upcoming'),
  history: document.getElementById('count-history'),
};

let user = null;

// ---------- Cards ----------

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
  return el('span', 'Confirmed', 'badge badge-success');
}

function stars(rating) {
  return `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
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

function labelled(label, text, className = 'appointment-inquiry') {
  const p = el('p', undefined, className);
  p.append(el('strong', `${label}: `), text);
  return p;
}

function appointmentCard(appointment, list) {
  const card = el('article', undefined, 'card appointment-card');

  const head = el('div', undefined, 'appointment-head');
  head.append(el('h3', sessionLabel(appointment.start_time, appointment.end_time)), statusBadge(appointment));
  card.append(head);

  const meta = el('div', undefined, 'appointment-meta');
  meta.append(el('span', counterpart(appointment)));
  const type = SESSION_TYPES[appointment.session_type];
  if (type) meta.append(el('span', type.label, 'badge badge-info'));
  if (appointment.student_rating) {
    const rating = el('span', stars(appointment.student_rating), 'rating-stars');
    rating.setAttribute('aria-label', `Rated ${appointment.student_rating} out of 5`);
    meta.append(rating);
  }
  card.append(meta);

  if (appointment.student_inquiry) card.append(labelled('Inquiry', appointment.student_inquiry));
  if (appointment.status === 'CANCELLED' && appointment.cancellation_reason) {
    card.append(labelled('Reason', appointment.cancellation_reason));
  }
  if (appointment.tutor_notes) card.append(labelled('Tutor notes', appointment.tutor_notes, 'appointment-notes'));
  if (appointment.student_feedback) card.append(labelled('Student feedback', appointment.student_feedback));

  const actions = el('div', undefined, 'appointment-actions');
  if (list === 'upcoming') {
    const join = appointment.meeting_url && meetingLink(appointment.meeting_url);
    if (join) actions.append(join);
    // A session that has already started cannot be cancelled any more.
    if (new Date(appointment.start_time) > new Date()) {
      const cancel = el('button', 'Cancel Session', 'btn btn-secondary');
      cancel.type = 'button';
      cancel.addEventListener('click', () => openCancel(appointment));
      actions.append(cancel);
    }
  } else if (appointment.can_review) {
    // CU-12 trigger. Tutors can edit notes; a student can rate only once.
    const isTutor = appointment.my_role === 'TUTOR';
    const alreadyRated = !isTutor && appointment.student_rating;
    if (!alreadyRated) {
      const label = isTutor ? (appointment.tutor_notes ? 'Edit Notes' : 'Add Notes') : 'Add Review';
      const review = el('button', label, 'btn btn-secondary');
      review.type = 'button';
      review.addEventListener('click', () => openReview(appointment));
      actions.append(review);
    }
  }
  if (actions.children.length) card.append(actions);
  return card;
}

const EMPTY = {
  upcoming: 'You have no upcoming sessions.',
  history: 'No past or cancelled sessions yet.',
};

function renderList(name, appointments) {
  counts[name].textContent = `(${appointments.length})`;
  if (appointments.length === 0) {
    lists[name].replaceChildren(el('p', EMPTY[name], 'card empty-state'));
    return;
  }
  lists[name].replaceChildren(...appointments.map((a) => appointmentCard(a, name)));
}

async function load() {
  try {
    // CU-11 step 2: one request with the session cookie
    const { upcoming, history } = await api.get('/appointments/me');
    renderList('upcoming', upcoming);
    renderList('history', history);
  } catch (err) {
    lists.upcoming.replaceChildren(el('p', err.message, 'field-error'));
  }
}

function selectTab(name) {
  Object.entries(tabs).forEach(([key, tab]) => {
    const active = key === name;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    lists[key].hidden = !active;
  });
}

tabs.upcoming.addEventListener('click', () => selectTab('upcoming'));
tabs.history.addEventListener('click', () => selectTab('history'));

// ---------- CU-09: cancel ----------

const cancelDialog = document.getElementById('cancel-dialog');
const cancelForm = document.getElementById('cancel-form');
const cancelError = document.getElementById('cancel-error');
const confirmCancel = document.getElementById('confirm-cancel');
let toCancel = null;

function openCancel(appointment) {
  toCancel = appointment;
  cancelForm.reset();
  cancelError.textContent = '';
  document.getElementById('cancel-summary').textContent =
    `${sessionLabel(appointment.start_time, appointment.end_time)} ${counterpart(appointment)}.`;
  // A1: warn before confirming when less than 4 hours remain.
  document.getElementById('cancel-late-warning').hidden = hoursUntil(appointment.start_time) >= LATE_HOURS;
  confirmCancel.disabled = false;
  cancelDialog.showModal();
}

cancelForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!toCancel) return;
  confirmCancel.disabled = true;
  cancelError.textContent = '';
  try {
    const reason = cancelForm.elements.reason.value.trim();
    const result = await api.patch(`/appointments/${encodeURIComponent(toCancel.id)}/cancel`, reason ? { reason } : {});
    cancelDialog.close();
    showToast(result.message, result.appointment?.is_late_cancellation ? 'error' : 'success');
    load();
  } catch (err) {
    cancelError.textContent = err.message;
    confirmCancel.disabled = false;
  }
});

cancelDialog.querySelector('[data-close]').addEventListener('click', () => cancelDialog.close());
cancelDialog.addEventListener('close', () => { toCancel = null; });

// ---------- CU-12: notes and rating ----------

const reviewDialog = document.getElementById('review-dialog');
const reviewForm = document.getElementById('review-form');
const reviewError = document.getElementById('review-error');
const confirmReview = document.getElementById('confirm-review');
const notesFields = document.getElementById('notes-fields');
const ratingFields = document.getElementById('rating-fields');
let toReview = null;

function renderStars() {
  const container = document.getElementById('stars');
  // DOM order 5..1: the CSS row-reverse shows them 1..5 from left to right.
  container.replaceChildren(...[5, 4, 3, 2, 1].map((value) => {
    const label = el('label', undefined, 'star');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'rating';
    radio.value = String(value);
    radio.className = 'visually-hidden';
    label.append(radio, el('span', '★', 'star-icon'), el('span', `${value} star${value === 1 ? '' : 's'}`, 'visually-hidden'));
    return label;
  }));
}

function openReview(appointment) {
  toReview = appointment;
  reviewForm.reset();
  reviewError.textContent = '';
  const isTutor = appointment.my_role === 'TUTOR';
  document.getElementById('review-title').textContent = isTutor ? 'Session notes' : 'Rate this session';
  document.getElementById('review-summary').textContent =
    `${sessionLabel(appointment.start_time, appointment.end_time)} ${counterpart(appointment)}`;
  notesFields.hidden = !isTutor;
  ratingFields.hidden = isTutor;
  if (isTutor) reviewForm.elements.notes.value = appointment.tutor_notes || '';
  confirmReview.disabled = false;
  reviewDialog.showModal();
}

reviewForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!toReview) return;
  reviewError.textContent = '';
  const id = encodeURIComponent(toReview.id);

  let request;
  if (toReview.my_role === 'TUTOR') {
    request = () => api.put(`/appointments/${id}/notes`, { notes: reviewForm.elements.notes.value });
  } else {
    const rating = Number(reviewForm.elements.rating.value);
    if (!rating) {
      reviewError.textContent = 'Choose a rating from 1 to 5 stars.';
      return;
    }
    const feedback = reviewForm.elements.feedback.value.trim();
    request = () => api.post(`/appointments/${id}/review`, { rating, feedback: feedback || null });
  }

  confirmReview.disabled = true;
  try {
    const result = await request();
    reviewDialog.close();
    showToast(result.message);
    load();
  } catch (err) {
    // A1 (session not finished) and "already rated" come back as messages from the API.
    reviewError.textContent = err.message;
    confirmReview.disabled = false;
  }
});

reviewDialog.querySelector('[data-close]').addEventListener('click', () => reviewDialog.close());
reviewDialog.addEventListener('close', () => { toReview = null; });

// ---------- Start ----------

async function init() {
  user = await currentUser();
  // Only students and tutors have a dashboard; the admin goes to their panel.
  if (user.role !== 'STUDENT' && user.role !== 'TUTOR') {
    window.location.href = homeFor(user.role);
    return;
  }
  renderNav(user);
  document.getElementById('user-name').textContent = `${user.first_name} ${user.last_name}`;
  document.getElementById('logout-button').addEventListener('click', logout);
  renderStars();

  const params = new URLSearchParams(window.location.search);
  if (params.get('booked') === '1') {
    showToast('Session booked. A confirmation email is on its way.');
    window.history.replaceState(null, '', window.location.pathname);
  }
  selectTab('upcoming');
  load();
}

init().catch((err) => showToast(err.message, 'error'));
