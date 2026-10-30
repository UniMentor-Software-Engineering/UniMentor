// CU-02: login. On success the API sets the HttpOnly cookie and returns the user,
// whose role selects the dashboard (step 6). 401, 403 and 429 are shown as returned.
import { api } from './api.js';
import { homeFor, showToast } from './session.js';

const form = document.getElementById('login-form');
const message = document.getElementById('form-message');
const submit = form.querySelector('button[type="submit"]');

// CU-01, step 9: the registration page redirects here with ?registered=1.
if (new URLSearchParams(window.location.search).has('registered')) {
  showToast('Account created. You can sign in now.');
}

function showMessage(text) {
  message.textContent = text;
  message.hidden = !text;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');

  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) {
    showMessage('Enter your email and password.');
    return;
  }

  submit.disabled = true;
  try {
    const user = await api.post('/auth/login', { email, password });
    window.location.href = homeFor(user.role);
  } catch (err) {
    showMessage(err.message);
    form.password.value = '';
    form.password.focus();
  } finally {
    submit.disabled = false;
  }
});
