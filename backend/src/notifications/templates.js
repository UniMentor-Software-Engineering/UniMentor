// Email templates (ADR 6: rendered in our code, not with provider-specific templates).
// Every message has a plain-text and an HTML version. Values that come from users
// (names, inquiry, reason, meeting link) are escaped in the HTML (NFR-02).
const config = require('../config/env');

const SESSION_TYPE_LABELS = {
  QUICK_CHECK: 'Quick Check',
  STANDARD: 'Standard Tutoring',
  DEEP_DIVE: 'Deep Dive',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fullName(person) {
  return `${person.first_name} ${person.last_name}`;
}

// "Friday, 20 November 2026, 10:00–11:00 (Europe/Madrid)"
function formatSession(start, end) {
  const timeZone = config.email.timeZone;
  const day = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone,
  }).format(new Date(start));
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
  return `${day}, ${time.format(new Date(start))}–${time.format(new Date(end))} (${timeZone})`;
}

// Only https links are put in an email (the profile already requires it, CU-03).
function safeMeetingUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function dashboardUrl() {
  return `${config.email.appUrl}/dashboard.html`;
}

/**
 * Builds { subject, text, html } from a title, the lines of the body and an optional
 * call to action. `lines` are [label, value] pairs or plain strings.
 */
function render({ subject, greeting, intro, lines = [], footer }) {
  const textLines = lines.map((line) => (Array.isArray(line) ? `${line[0]}: ${line[1]}` : line));
  const text = [
    greeting,
    '',
    intro,
    '',
    ...textLines,
    '',
    `Your sessions: ${dashboardUrl()}`,
    ...(footer ? ['', footer] : []),
    '',
    '— UniMentor',
  ].join('\n');

  const htmlLines = lines.map((line) => {
    if (!Array.isArray(line)) return `<p>${escapeHtml(line)}</p>`;
    const [label, value, href] = line;
    const shown = href
      ? `<a href="${escapeHtml(href)}">${escapeHtml(value)}</a>`
      : escapeHtml(value);
    return `<p><strong>${escapeHtml(label)}:</strong> ${shown}</p>`;
  }).join('\n');

  const html = `<!doctype html>
<html><body style="font-family: system-ui, Arial, sans-serif; color: #0f172a; line-height: 1.5;">
<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(intro)}</p>
${htmlLines}
<p><a href="${escapeHtml(dashboardUrl())}">Open your sessions in UniMentor</a></p>
${footer ? `<p style="color: #64748b;">${escapeHtml(footer)}</p>` : ''}
<p>— UniMentor</p>
</body></html>`;

  return { subject, text, html };
}

function sessionLines(appointment, other, otherRole) {
  const lines = [
    ['When', formatSession(appointment.start_time, appointment.end_time)],
    [otherRole, fullName(other)],
    ['Session type', SESSION_TYPE_LABELS[appointment.session_type] || appointment.session_type],
  ];
  const meeting = safeMeetingUrl(appointment.meeting_url);
  if (meeting) lines.push(['Meeting link', meeting, meeting]);
  if (appointment.student_inquiry) lines.push(['Student inquiry', appointment.student_inquiry]);
  return lines;
}

// CU-01, step 8
function welcome(user) {
  return render({
    subject: 'Welcome to UniMentor',
    greeting: `Hello ${user.first_name},`,
    intro: user.role === 'TUTOR'
      ? 'Your tutor account is ready. Complete your profile and publish your availability so students can book you.'
      : 'Your student account is ready. You can now search for tutors and book sessions.',
  });
}

// CU-08, step 8: one message per participant
function bookingConfirmation(appointment, recipientRole) {
  const isStudent = recipientRole === 'STUDENT';
  const me = isStudent ? appointment.student : appointment.tutor;
  const other = isStudent ? appointment.tutor : appointment.student;
  return render({
    subject: `Session confirmed: ${formatSession(appointment.start_time, appointment.end_time)}`,
    greeting: `Hello ${me.first_name},`,
    intro: isStudent
      ? 'Your tutoring session is booked.'
      : 'A student has booked one of your sessions.',
    lines: sessionLines(appointment, other, isStudent ? 'Tutor' : 'Student'),
    footer: 'Cancellations less than 4 hours before the session are recorded as late cancellations.',
  });
}

// CU-09, step 6 and CU-13: the reason is shown only when the person who cancelled gave one
function cancellationNotice(appointment, recipientRole, { byAdmin = false } = {}) {
  const isStudent = recipientRole === 'STUDENT';
  const me = isStudent ? appointment.student : appointment.tutor;
  const other = isStudent ? appointment.tutor : appointment.student;
  const lines = [
    ['When', formatSession(appointment.start_time, appointment.end_time)],
    [isStudent ? 'Tutor' : 'Student', fullName(other)],
  ];
  if (appointment.cancellation_reason && !byAdmin) lines.push(['Reason', appointment.cancellation_reason]);

  let intro;
  if (byAdmin) intro = 'This session was cancelled by the university administration.';
  else if (appointment.cancelled_by === me.id) intro = 'You cancelled this session.';
  else intro = `${fullName(other)} cancelled this session.`;

  return render({
    subject: `Session cancelled: ${formatSession(appointment.start_time, appointment.end_time)}`,
    greeting: `Hello ${me.first_name},`,
    intro,
    lines,
    footer: isStudent && !byAdmin && appointment.cancelled_by !== me.id
      ? 'You can book another session from the tutor search page.'
      : undefined,
  });
}

// CU-10
function reminder(appointment, recipientRole) {
  const isStudent = recipientRole === 'STUDENT';
  const me = isStudent ? appointment.student : appointment.tutor;
  const other = isStudent ? appointment.tutor : appointment.student;
  return render({
    subject: `Reminder: tutoring session ${formatSession(appointment.start_time, appointment.end_time)}`,
    greeting: `Hello ${me.first_name},`,
    intro: 'This is a reminder of your upcoming tutoring session.',
    lines: sessionLines(appointment, other, isStudent ? 'Tutor' : 'Student'),
  });
}

module.exports = {
  welcome,
  bookingConfirmation,
  cancellationNotice,
  reminder,
  escapeHtml,
  formatSession,
};
