
# P4 — Reservation and Availability Management

## 1. Overview

This module implements reservation and availability management for UniMentor.

It allows tutors to publish and block available sessions and students to view tutor calendars, create bookings, and cancel appointments.

### Implemented Use Cases

| ID | Use Case | Description |
|---|---|---|
| CU-04 | Publish Availability | Tutors publish available one-hour sessions. |
| CU-05 | Block Availability | Tutors block their own available sessions. |
| CU-07 | Inspect Tutor Calendar | Students view upcoming available sessions. |
| CU-08 | Create Booking | Students reserve available sessions. |
| CU-09 | Cancel Booking | Students and tutors cancel confirmed appointments. |

## 2. Architecture

The implementation follows a layered architecture:

Controller → Service → Repository → PostgreSQL

### Controller Layer

The controller receives HTTP requests, calls the appropriate service, and returns HTTP responses.

Relevant files:

- `backend/src/controllers/appointmentController.js`
- `backend/src/controllers/tutorController.js`

### Service Layer

The service validates input data and coordinates business operations.

Relevant file:

- `backend/src/services/bookingService.js`

### Repository Layer

The repository encapsulates database queries and transactions.

Relevant files:

- `backend/src/repositories/appointmentRepository.js`
- `backend/src/repositories/tutorRepository.js`

## 3. Repository Design Pattern

The Repository pattern separates database access from business logic.

Instead of writing SQL queries directly inside HTTP controllers, database operations are performed through repository functions.

Examples include:

- `findSlotById()`
- `createBooking()`
- `cancelAppointment()`
- `publishAvailabilitySlots()`
- `blockAvailabilitySlot()`
- `findAvailableSlotsByTutor()`

This separation improves maintainability, testability, and code organization.

### Example: Creating a Booking

1. The student sends a booking request.
2. The controller receives the request.
3. The service validates the input.
4. The repository starts a PostgreSQL transaction.
5. The selected availability slot is locked.
6. The appointment is created.
7. The slot status changes to `BOOKED`.
8. The transaction is committed.

## 4. Business Rules

### Minimum Booking Notice (BR-CONF-01)

Students can only book sessions starting more than two hours after the current time.

The restriction is enforced both in calendar queries and during booking creation.

### Availability Publication

Tutors can publish sessions divided into 60-minute slots.

Overlapping slots are rejected or skipped to prevent conflicting availability.

### Availability Blocking

Tutors can only block their own available slots.

Booked slots cannot be blocked directly.

### Booking Quota and Collisions (BR-CONF-04, BR-CONF-05)

A student may hold at most 3 active appointments (confirmed and not yet finished). A 4th booking is rejected with HTTP 400 `BOOKING_LIMIT_REACHED`: "You have reached the maximum limit of 3 active appointments." The student row is locked (`SELECT ... FOR UPDATE`) at the start of the booking transaction, so two parallel bookings of the same student cannot both pass the check.

A student cannot hold two sessions at the same time, even with different tutors. The exclusion constraint `no_student_appointment_overlap` rejects it and the repository answers HTTP 409 `STUDENT_OVERLAP`.

### Session Type (CU-08 step 2)

The student chooses `QUICK_CHECK`, `STANDARD` (default) or `DEEP_DIVE`. Every session still uses a 60-minute slot (BR-CONF-03).

### Cancellation Policy

Appointments cancelled at least four hours before their start time release the slot.

Late cancellations are flagged and the affected user's late cancellation counter is increased.

The slot becomes `UNAVAILABLE` after a late cancellation.

The user may give an optional reason (max. 500 characters), stored in `appointments.cancellation_reason`. A session that has already started cannot be cancelled (HTTP 409 `SESSION_STARTED`).

## 5. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/appointments/availability` | Publish tutor availability |
| PATCH | `/api/appointments/availability/:id/block` | Block an available slot |
| GET | `/api/tutors/:id/availability` | View tutor availability |
| POST | `/api/appointments` | Create a booking |
| PATCH | `/api/appointments/:id/cancel` | Cancel an appointment (body: optional `reason`) |
| GET | `/api/appointments/me?scope=upcoming|past` | The signed-in student's or tutor's appointments ("My Sessions") |
| GET | `/api/appointments/availability/me?from=&to=` | The signed-in tutor's slots in every status (max. 31 days) |

`POST /api/appointments` takes `{ slotId, sessionType, studentInquiry }`.

Authentication and role authorization are applied to the operations that modify availability or appointments.

## 6. Frontend

| Page | Role | Use cases |
|---|---|---|
| `tutors.html` | Public, booking for students | "View Availability" on each tutor card shows the free slots grouped by day (CU-07). A student picks a slot, a session type and an optional inquiry, then "Confirm Booking" (CU-08). Visitors without a session are asked to sign in. |
| `appointments.html` | Student, tutor | "My Sessions": upcoming sessions with the meeting link and "Cancel Session" (CU-09), and a "Past & cancelled" tab. The cancel dialog asks for an optional reason and warns when less than 4 hours remain. After a booking the student lands here (CU-08 step 9). |
| `availability.html` | Tutor | Weekly grid from 07:00 to 22:00. Click free hours, then "Publish Slots" (CU-04; skipped hours are reported). Click a green slot and confirm "Delete Slot" to block it (CU-05). |

The header shows the links of the signed-in role (`renderNav` in `js/session.js`). Shared date helpers live in `js/dates.js` and the styles in `css/booking.css`. No inline styles are used, because the CSP in `vercel.json` only allows stylesheets from `'self'`.

## 7. Database Consistency and Concurrency

PostgreSQL transactions are used to keep related operations consistent.

Booking and availability blocking use `SELECT ... FOR UPDATE` to prevent conflicting updates to the same slot.

The database also includes constraints to prevent overlapping tutor slots and conflicting appointments.

These safeguards ensure that concurrent booking and blocking requests cannot both succeed for the same available slot.

## 8. Testing

The module includes integration and route tests covering:

- Availability publication and overlapping slots
- Availability blocking and ownership checks
- Tutor calendar filtering
- Booking creation and concurrency
- Minimum advance booking notice
- Normal and late cancellations
- Authorization and duplicate cancellations
- Booking quota, student overlap, session type, cancellation reason and the listing endpoints (`bookingRules.test.js`, `unit/bookingService.test.js`)

The tests that use PostgreSQL create their own student (`tests/helpers/testStudent.js`). With a shared seed student, test files running in parallel counted each other's bookings against the 3-booking quota.

### Commands

Run all backend tests:

```bash
cd backend
npm test -- --runInBand
```

Run ESLint:

```bash
npm run lint
```

On 2026-11-19, all 237 backend tests passed against a migrated and seeded PostgreSQL, and ESLint reported no errors.

## 9. Integration Notes for P5

P5 should build on the existing booking and availability services rather than duplicating their database logic.

The reservation and cancellation operations already use PostgreSQL transactions.

The notification calls (booking confirmation, cancellation notice) belong after the COMMIT of `createBooking` and `cancelAppointment`. `appointments.html` is the base for the CU-11 dashboard, and the "Past & cancelled" tab is where CU-12 (rating) fits.

Any new notifications, dashboards, or appointment-related features should integrate with the existing controllers and services.

Shared files, especially tutor routes and controllers, should be merged carefully to preserve changes made by other project modules.
