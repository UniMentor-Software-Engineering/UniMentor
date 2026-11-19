// Date helpers for the P4 pages. The API speaks ISO 8601 in UTC; the pages show the
// browser's local time.

export const SESSION_TYPES = {
  QUICK_CHECK: { label: 'Quick Check', detail: 'About 5 minutes: one short, specific question.' },
  STANDARD: { label: 'Standard Tutoring', detail: 'About 30 minutes: an exercise or a topic.' },
  DEEP_DIVE: { label: 'Deep Dive', detail: 'The full 60 minutes: a whole unit or exam preparation.' },
};

export const dayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long',
});

export const shortDayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short',
});

export const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit',
});

export function timeRange(start, end) {
  return `${timeFormat.format(new Date(start))}–${timeFormat.format(new Date(end))}`;
}

// "Monday 3 March, 10:00–11:00"
export function sessionLabel(start, end) {
  return `${dayFormat.format(new Date(start))}, ${timeRange(start, end)}`;
}

// Local calendar day key, used to group slots by day.
export function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Monday 00:00 (local time) of the week that contains `date`.
export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function hoursUntil(date) {
  return (new Date(date).getTime() - Date.now()) / 3600000;
}

// Shared element helper: text is always set with textContent (NFR-02, XSS).
export function el(tag, text, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}
