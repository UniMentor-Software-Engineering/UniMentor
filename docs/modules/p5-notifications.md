# P5 — Notifications, Dashboard and Session History

## 1. Overview

| ID | Use Case | What was built |
|---|---|---|
| CU-10 | Automated Reminders Dispatch | Scheduler every 10 minutes; reminder to both participants of confirmed sessions starting within 24 hours; `reminder_sent` set only after the provider accepts. |
| CU-11 | Personal Dashboard Management | `dashboard.html` (`/dashboard` on Vercel): upcoming sessions and history from `GET /api/appointments/me`. Finished sessions become `COMPLETED`. |
| CU-12 | Post-Session Notes and Rating | Tutor notes and a single 1–5 rating with optional feedback, only after the session has ended. |
| ADR 6 | Notification Service | `NotificationService` with an interchangeable provider: Brevo or SendGrid (Adapters) or console (development/tests). Used by CU-01, CU-08, CU-09, CU-10 and CU-13. |

The design is explained in section 4.3.3 of `04-implementation-details.md` (Adapter and Strategy).

## 2. Files

| File | Role |
|---|---|
| `backend/src/notifications/NotificationService.js` | Context: `sendWelcome`, `sendBookingConfirmation`, `sendCancellationNotice`, `sendReminder`, `notifyInBackground` |
| `backend/src/notifications/providers/SendGridProvider.js` | Adapter for the SendGrid v3 Mail Send API (built-in `fetch`, 10 s timeout, success = HTTP 202) |
| `backend/src/notifications/providers/BrevoProvider.js` | Adapter for the Brevo v3 transactional email API (built-in `fetch`, 10 s timeout, success = HTTP 201). Used in production: Brevo's free plan allows 300 emails a day, while SendGrid only offers a 60-day trial |
| `backend/src/notifications/providers/ConsoleProvider.js` | Writes the email to the log; silent under Jest; keeps the last messages for tests |
| `backend/src/notifications/templates.js` | Plain-text + HTML templates; user text is escaped; times in `EMAIL_TIMEZONE` |
| `backend/src/notifications/index.js` | Chooses the provider once from the configuration |
| `backend/src/jobs/reminderScheduler.js` | CU-10 cycle and the 10-minute timer, started by `server.js` |
| `frontend/dashboard.html`, `frontend/js/dashboard.js` | CU-11 dashboard and the CU-12 dialogs |

## 3. Which emails are sent

| Event | Recipients | Where |
|---|---|---|
| Registration (CU-01 step 8) | The new user | `authService.register` |
| Booking (CU-08 step 8) | Student and tutor, with the meeting link | `bookingService.createBooking` |
| Cancellation (CU-09 step 6) | Student and tutor, with the reason if given | `bookingService.cancelAppointment` |
| Suspension (CU-13) | The other participant of each cancelled session | `adminService.suspendUser` |
| Reminder (CU-10) | Student and tutor | `jobs/reminderScheduler.js` |

All except the reminder run after the `COMMIT` through `notifyInBackground()`: the HTTP response does not wait, and a failure is logged (`[notifications] … failed`) without undoing the operation.

## 4. CU-10 cycle

1. `completeFinishedAppointments()`: `CONFIRMED` sessions whose end has passed become `COMPLETED` (CU-11 business rule).
2. `findPendingReminders()`: `CONFIRMED`, `reminder_sent = FALSE`, start between now and now + 24 h. A session booked less than 24 hours ahead gets its reminder in the next cycle.
3. For each one, `sendReminder()` sends both messages; only if both are accepted, `markReminderSent()`.
4. A1: on an error the appointment is logged and stays queued for the next cycle. Two cycles never overlap.

A 10-minute period keeps reminders inside the ±15 minute tolerance of goal G5. The timer runs in the API process (`SCHEDULER_ENABLED=false` disables it). Render's free instance sleeps after 15 minutes without traffic, and no cycle runs while it sleeps. In production the Supabase database calls `/api/health` every 10 minutes (`pg_cron` and `pg_net`, set up with `backend/src/database/supabase/keep-alive.sql`) so the instance stays awake; a paid instance would make that unnecessary.

## 5. API

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/api/appointments/me` | Student, tutor | `{ upcoming, history }` (CU-11). `?scope=upcoming\|past` returns one list. |
| PUT | `/api/appointments/:id/notes` | Tutor | `{ notes }` (max. 2000), can be edited (CU-12 step 2) |
| POST | `/api/appointments/:id/review` | Student | `{ rating: 1-5, feedback? }` (max. 1000), once (CU-12 step 3) |

Errors: `409 SESSION_NOT_COMPLETED` "Ratings and notes are accessible only after session completion." (CU-12 A1), `409 ALREADY_RATED`, `409 INVALID_STATUS` (cancelled session), `403 FORBIDDEN` (not a participant), `400 INVALID_RATING` / `INVALID_NOTES` / `INVALID_FEEDBACK`.

Notes, rating and feedback are returned only to the two participants (the dashboard query filters by the signed-in user).

## 6. Frontend

- After login, students and tutors land on `dashboard.html` (CU-02 step 6, "role dashboard").
- **Upcoming Sessions:** meeting link and "Cancel Session" (CU-09).
- **History:** completed and cancelled sessions with notes, stars and feedback. On completed sessions, the tutor sees "Add Notes" / "Edit Notes" and the student "Add Review" until they have rated.
- The rating uses five radio buttons styled as stars (keyboard accessible).

## 7. Configuration

| Variable | Default | Purpose |
|---|---|---|
| `SENDGRID_API_KEY` | — | Enables real email. Without it, emails go to the log. |
| `EMAIL_FROM` | `UniMentor <no-reply@unimentor.edu>` | Sender; must be verified in SendGrid |
| `EMAIL_TIMEZONE` | `Europe/Madrid` | Time zone of the times shown in emails |
| `APP_URL` | first `FRONTEND_ORIGIN` | Base URL of the dashboard link in emails |
| `SCHEDULER_ENABLED` | `true` (always off under Jest) | CU-10 scheduler |

## 8. Testing

- `tests/unit/notifications.test.js`: templates (time zone, escaping, https-only links), `NotificationService`, the SendGrid request format and the 202 rule, and the reminder cycle including A1.
- `tests/integration/p5History.test.js` (PostgreSQL): reminder window, one reminder per session, retry after a provider failure, automatic completion, notes, single rating, CU-12 A1 and participant checks.
- `tests/unit/bookingService.test.js` and `tests/integration/appointmentRoutes.test.js`: validation, roles, and that a failed email does not fail a booking.

On 2026-11-19: 274 backend tests passed against a migrated and seeded PostgreSQL. The flows were checked in Chrome (reminders and confirmations in the log, cancellation notice, rating, tutor notes). The layout was not checked visually.
