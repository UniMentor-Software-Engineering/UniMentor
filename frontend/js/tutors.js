// CU-06: search and filter tutors. Public page (no precondition): anonymous visitors stay
// here, and it is also the landing page of signed-in students, who need to be able to sign out.
// CU-07: "View Availability" opens the tutor's calendar inside the card.
// CU-08: a student picks a slot, a session type and an optional inquiry, then confirms.
// Every text from the API is written with textContent (NFR-02, XSS).
import { api } from './api.js';
import { logout, optionalUser, renderNav, showToast } from './session.js';
import { SESSION_TYPES, dayFormat, dayKey, el, sessionLabel, timeRange } from './dates.js';

const PAGE_SIZE = 10;
const NO_RESULTS = 'No mentors available for the selected subject at this time.'; // CU-06 A1
const NO_SLOTS = 'This tutor has no available sessions published for this period.'; // CU-07 A1
const MAX_INQUIRY = 1000;

const form = document.getElementById('search-form');
const results = document.getElementById('results');
const status = document.getElementById('results-status');
const loadMore = document.getElementById('load-more');

const dialog = document.getElementById('booking-dialog');
const bookingForm = document.getElementById('booking-form');
const bookingSummary = document.getElementById('booking-summary');
const bookingError = document.getElementById('booking-error');
const confirmButton = document.getElementById('confirm-booking');
const inquiry = document.getElementById('inquiry');
const inquiryCounter = document.getElementById('inquiry-counter');

const state = { search: '', subjectId: '', offset: 0, user: null };
const slotFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

// The slot being booked and the panel to refresh if it was taken meanwhile.
let pending = null;

// ---------- CU-07: tutor calendar ----------

function slotControl(tutor, slot, panel) {
  const label = timeRange(slot.start_time, slot.end_time);
  // Only students can book (CU-08 precondition 1). Others just see the free times.
  if (state.user?.role !== 'STUDENT') {
    return el('span', label, 'slot-chip');
  }
  const button = el('button', label, 'slot-chip');
  button.type = 'button';
  button.setAttribute('aria-label', `Book ${sessionLabel(slot.start_time, slot.end_time)} with ${tutor.first_name} ${tutor.last_name}`);
  button.addEventListener('click', () => openBooking(tutor, slot, panel));
  return button;
}

function renderSlots(tutor, slots, panel) {
  if (slots.length === 0) {
    panel.replaceChildren(el('p', NO_SLOTS, 'text-muted'));
    return;
  }

  const byDay = new Map();
  slots.forEach((slot) => {
    const key = dayKey(slot.start_time);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(slot);
  });

  const groups = [...byDay.values()].map((daySlots) => {
    const group = el('section', undefined, 'day-group');
    group.append(el('h4', dayFormat.format(new Date(daySlots[0].start_time))));
    const list = el('ul', undefined, 'slot-list');
    daySlots.forEach((slot) => {
      const item = el('li');
      item.append(slotControl(tutor, slot, panel));
      list.append(item);
    });
    group.append(list);
    return group;
  });

  const hint = state.user?.role === 'STUDENT'
    ? el('p', 'Pick a time to book it. Times within the next 2 hours cannot be booked.', 'text-muted')
    : el('p', state.user ? 'Only students can book sessions.' : undefined, 'text-muted');
  if (!state.user) {
    const link = el('a', 'Sign in as a student');
    link.href = 'login.html';
    hint.append(link, ' to book one of these sessions.');
  }
  panel.replaceChildren(hint, ...groups);
}

async function loadAvailability(tutor, panel) {
  panel.replaceChildren(el('p', 'Loading availability…', 'text-muted'));
  try {
    // CU-07 step 2: the backend only returns AVAILABLE slots more than 2 hours ahead.
    const slots = await api.get(`/tutors/${encodeURIComponent(tutor.id)}/availability`, { redirectOn401: false });
    renderSlots(tutor, slots, panel);
  } catch (err) {
    panel.replaceChildren(el('p', err.message, 'field-error'));
  }
}

function tutorCard(tutor) {
  const card = el('article', undefined, 'card tutor-card');
  card.append(el('h3', `${tutor.first_name} ${tutor.last_name}`));

  const subjects = el('ul', undefined, 'subject-list');
  tutor.subjects.forEach((subject) => {
    const item = el('li', subject.name, 'badge badge-subject');
    item.title = subject.code;
    subjects.append(item);
  });
  card.append(subjects);

  if (tutor.bio) card.append(el('p', tutor.bio, 'tutor-bio'));

  // CU-06 step 5: upcoming availability highlight.
  const next = el('p', undefined, 'next-slot');
  if (tutor.next_available_slot) {
    next.append(el('span', `Next free slot: ${slotFormat.format(new Date(tutor.next_available_slot))}`, 'badge badge-success'));
  } else {
    next.append(el('span', 'No upcoming availability', 'text-muted'));
  }
  card.append(next);

  // CU-07 trigger: "View Availability" on the tutor's card.
  const panelId = `availability-${tutor.id}`;
  const toggle = el('button', 'View Availability', 'btn btn-secondary');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', panelId);
  const panel = el('div', undefined, 'availability-panel');
  panel.id = panelId;
  panel.hidden = true;

  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide Availability' : 'View Availability';
    if (open) loadAvailability(tutor, panel);
  });

  card.append(toggle, panel);
  return card;
}

// ---------- CU-08: booking dialog ----------

function renderSessionTypes() {
  const fieldset = document.getElementById('session-types');
  const legend = fieldset.querySelector('legend');
  const choices = Object.entries(SESSION_TYPES).map(([value, info]) => {
    const label = el('label', undefined, 'choice');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'sessionType';
    radio.value = value;
    radio.required = true;
    if (value === 'STANDARD') radio.checked = true;
    const text = el('span');
    text.append(el('strong', info.label), el('small', info.detail));
    label.append(radio, text);
    return label;
  });
  fieldset.replaceChildren(legend, ...choices);
}

function updateCounter() {
  inquiryCounter.textContent = `${inquiry.value.length} / ${MAX_INQUIRY}`;
}

function openBooking(tutor, slot, panel) {
  pending = { tutor, slot, panel };
  bookingSummary.textContent = `${sessionLabel(slot.start_time, slot.end_time)} with ${tutor.first_name} ${tutor.last_name}`;
  bookingError.textContent = '';
  bookingForm.reset();
  bookingForm.elements.sessionType.value = 'STANDARD';
  updateCounter();
  confirmButton.disabled = false;
  dialog.showModal();
}

async function confirmBooking(event) {
  event.preventDefault();
  if (!pending) return;
  bookingError.textContent = '';
  confirmButton.disabled = true;
  confirmButton.textContent = 'Booking…';

  try {
    await api.post('/appointments', {
      slotId: pending.slot.id,
      sessionType: bookingForm.elements.sessionType.value,
      studentInquiry: inquiry.value.trim() || null,
    });
    // CU-08 step 9: go to the appointments dashboard with a success confirmation.
    window.location.href = 'appointments.html?booked=1';
  } catch (err) {
    bookingError.textContent = err.message;
    confirmButton.disabled = false;
    // The slot is gone (A1) or too close (A3): refresh the calendar behind the dialog.
    if (['SLOT_UNAVAILABLE', 'BOOKING_TOO_LATE', 'SLOT_NOT_FOUND'].includes(err.code)) {
      confirmButton.disabled = true;
      loadAvailability(pending.tutor, pending.panel);
    }
  } finally {
    confirmButton.textContent = 'Confirm Booking';
  }
}

bookingForm.addEventListener('submit', confirmBooking);
dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { pending = null; });
inquiry.addEventListener('input', updateCounter);

// ---------- CU-06: search ----------

function query() {
  const params = new URLSearchParams({ limit: PAGE_SIZE, offset: state.offset });
  if (state.search) params.set('search', state.search);
  if (state.subjectId) params.set('subjectId', state.subjectId);
  return params.toString();
}

async function loadTutors({ append = false } = {}) {
  loadMore.disabled = true;
  try {
    const tutors = await api.get(`/tutors?${query()}`);
    if (!append) results.replaceChildren();
    results.append(...tutors.map(tutorCard));

    const shown = results.querySelectorAll('.tutor-card').length;
    status.textContent = shown === 0 ? '' : `${shown} tutor${shown === 1 ? '' : 's'} shown`;
    if (shown === 0) results.replaceChildren(el('p', NO_RESULTS, 'card empty-state'));
    // The API returns pages without a total: there may be more when the page is full.
    loadMore.hidden = tutors.length < PAGE_SIZE;
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    loadMore.disabled = false;
  }
}

async function loadSubjects() {
  try {
    const subjects = await api.get('/subjects');
    const select = form.subject;
    subjects.forEach((subject) => {
      const option = el('option', `${subject.name} (${subject.code})`);
      option.value = subject.id;
      select.append(option);
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function runSearch() {
  state.search = form.search.value.trim();
  state.subjectId = form.subject.value;
  state.offset = 0;
  loadTutors();
}

// Trigger: the student enters text or selects a subject.
form.addEventListener('submit', (event) => {
  event.preventDefault();
  runSearch();
});
form.subject.addEventListener('change', runSearch);

loadMore.addEventListener('click', () => {
  state.offset += PAGE_SIZE;
  loadTutors({ append: true });
});

async function showSession() {
  const user = await optionalUser();
  state.user = user;
  if (!user) return;
  renderNav(user);
  const name = document.getElementById('user-name');
  name.textContent = `${user.first_name} ${user.last_name}`;
  name.hidden = false;
  document.getElementById('sign-in-link').hidden = true;
  const signOut = document.getElementById('logout-button');
  signOut.hidden = false;
  signOut.addEventListener('click', logout);
}

renderSessionTypes();
loadSubjects();
// The session is known before the cards are drawn, so the calendar knows who may book.
showSession().finally(loadTutors);
