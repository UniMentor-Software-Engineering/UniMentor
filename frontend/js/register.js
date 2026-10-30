// CU-01: registration. The same rules as the backend are checked here for quick
// feedback, but the backend is the one that enforces them; its errors are shown
// next to the field they belong to (A1, A2).
import { api } from './api.js';

const form = document.getElementById('register-form');
const message = document.getElementById('form-message');
const submit = form.querySelector('button[type="submit"]');

// Backend error code -> form field.
const FIELD_BY_CODE = {
  INVALID_FIRST_NAME: 'firstName',
  INVALID_LAST_NAME: 'lastName',
  INVALID_EMAIL: 'email',
  EMAIL_IN_USE: 'email',
  WEAK_PASSWORD: 'password',
  INVALID_ROLE: 'role',
};
const FIELDS = ['firstName', 'lastName', 'email', 'password', 'role'];

function setFieldError(field, text) {
  document.getElementById(`${field}-error`).textContent = text;
  const input = form.elements[field];
  if (input instanceof HTMLInputElement) {
    input.setAttribute('aria-invalid', text ? 'true' : 'false');
  }
}

function clearErrors() {
  FIELDS.forEach((field) => setFieldError(field, ''));
  message.hidden = true;
}

function validate(data) {
  const errors = {};
  if (!data.firstName) errors.firstName = 'First name is required.';
  if (!data.lastName) errors.lastName = 'Last name is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Enter a valid email address.';

  const missing = [];
  if (data.password.length < 8) missing.push('at least 8 characters');
  if (!/[A-Za-z]/.test(data.password)) missing.push('a letter');
  if (!/\d/.test(data.password)) missing.push('a digit');
  if (missing.length > 0) {
    const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}` : missing[0];
    errors.password = `Password must contain ${list}.`;
  }
  return errors;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();

  const data = {
    firstName: form.firstName.value.trim(),
    lastName: form.lastName.value.trim(),
    email: form.email.value.trim(),
    password: form.password.value,
    role: form.role.value,
  };

  const errors = validate(data);
  if (Object.keys(errors).length > 0) {
    Object.entries(errors).forEach(([field, text]) => setFieldError(field, text));
    form.elements[Object.keys(errors)[0]].focus();
    return;
  }

  submit.disabled = true;
  try {
    await api.post('/auth/register', data);
    // Step 9: back to the login page, which shows the success toast.
    window.location.href = 'login.html?registered=1';
  } catch (err) {
    const field = FIELD_BY_CODE[err.code];
    if (field) {
      setFieldError(field, err.message);
    } else {
      message.textContent = err.message;
      message.hidden = false;
    }
  } finally {
    submit.disabled = false;
  }
});
