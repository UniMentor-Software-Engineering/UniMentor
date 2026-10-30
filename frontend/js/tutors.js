// CU-06: search and filter tutors. Public page (no precondition), so it never calls
// /auth/me: api.js would redirect anonymous visitors to the login page.
// Every text from the API is written with textContent (NFR-02, XSS).
import { api } from './api.js';
import { showToast } from './session.js';

const PAGE_SIZE = 10;
const NO_RESULTS = 'No mentors available for the selected subject at this time.'; // A1

const form = document.getElementById('search-form');
const results = document.getElementById('results');
const status = document.getElementById('results-status');
const loadMore = document.getElementById('load-more');

const state = { search: '', subjectId: '', offset: 0 };
const slotFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
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

  // Step 5: upcoming availability highlight.
  const next = el('p', undefined, 'next-slot');
  if (tutor.next_available_slot) {
    next.append(el('span', `Next free slot: ${slotFormat.format(new Date(tutor.next_available_slot))}`, 'badge badge-success'));
  } else {
    next.append(el('span', 'No upcoming availability', 'text-muted'));
  }
  card.append(next);
  // TODO(P4): add the "View Availability" button that opens the tutor's calendar (CU-07).
  return card;
}

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

    const shown = results.children.length;
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

loadSubjects();
loadTutors();
