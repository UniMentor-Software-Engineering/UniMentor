// CU-03: the tutor's "My Profile" tab. Loads the current profile and the subject
// catalog (step 2), and saves bio, meeting link and subjects (steps 3-7).
// The backend enforces the rules; the checks here only give quicker feedback.
import { api } from './api.js';
import { currentUser, homeFor, logout, showToast } from './session.js';

const MAX_BIO = 1000;
const form = document.getElementById('profile-form');
const options = document.getElementById('subject-options');
const bioCounter = document.getElementById('bio-counter');
const submit = form.querySelector('button[type="submit"]');

// Backend error code -> field (A1, A2).
const FIELD_BY_CODE = {
  SUBJECTS_REQUIRED: 'subjects',
  INVALID_MEETING_URL: 'meetingUrl',
  INVALID_BIO: 'bio',
};

function setFieldError(field, text) {
  document.getElementById(`${field}-error`).textContent = text;
  const input = form.elements[field];
  if (input instanceof HTMLElement && field !== 'subjects') {
    input.setAttribute('aria-invalid', text ? 'true' : 'false');
  }
}

function clearErrors() {
  Object.values(FIELD_BY_CODE).forEach((field) => setFieldError(field, ''));
}

function updateCounter() {
  bioCounter.textContent = `${form.bio.value.length} / ${MAX_BIO}`;
}

function renderSubjects(subjects, selectedIds) {
  options.replaceChildren(...subjects.map((subject) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'subjectIds';
    checkbox.value = subject.id;
    checkbox.checked = selectedIds.has(subject.id);

    const text = document.createElement('span');
    text.textContent = subject.name;
    const code = document.createElement('span');
    code.className = 'subject-code';
    code.textContent = `${subject.code} · ${subject.department}`;
    text.append(code);

    label.append(checkbox, text);
    return label;
  }));
}

function selectedSubjectIds() {
  return [...form.querySelectorAll('input[name="subjectIds"]:checked')].map((input) => input.value);
}

function validate(data) {
  const errors = {};
  if (data.subjectIds.length === 0) errors.subjects = 'Select at least one subject.';
  if (!/^https:\/\/\S+$/.test(data.meetingUrl)) {
    errors.meetingUrl = 'Enter a valid https:// link from Google Meet, Zoom or Microsoft Teams.';
  }
  if (data.bio.length > MAX_BIO) errors.bio = `Bio must not exceed ${MAX_BIO} characters.`;
  return errors;
}

form.bio.addEventListener('input', updateCounter);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();

  const data = {
    bio: form.bio.value.trim(),
    meetingUrl: form.meetingUrl.value.trim(),
    subjectIds: selectedSubjectIds(),
  };
  const errors = validate(data);
  if (Object.keys(errors).length > 0) {
    Object.entries(errors).forEach(([field, text]) => setFieldError(field, text));
    return;
  }

  submit.disabled = true;
  try {
    await api.put('/tutors/profile', data);
    showToast('Profile successfully updated.'); // step 7
  } catch (err) {
    const field = FIELD_BY_CODE[err.code];
    if (field) setFieldError(field, err.message);
    else showToast(err.message, 'error');
  } finally {
    submit.disabled = false;
  }
});

document.getElementById('logout-button').addEventListener('click', logout);

async function init() {
  const user = await currentUser(); // without a session, api.js redirects to login.html
  if (user.role !== 'TUTOR') {
    window.location.href = homeFor(user.role);
    return;
  }
  document.getElementById('user-name').textContent = `${user.first_name} ${user.last_name}`;

  const [profile, subjects] = await Promise.all([api.get('/tutors/profile'), api.get('/subjects')]);
  form.bio.value = profile.bio || '';
  form.meetingUrl.value = profile.meeting_url || '';
  renderSubjects(subjects, new Set(profile.subjects.map((subject) => subject.id)));
  updateCounter();
  form.hidden = false;
}

init().catch((err) => showToast(err.message, 'error'));
