
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

### Cancellation Policy

Appointments cancelled at least four hours before their start time release the slot.

Late cancellations are flagged and the affected user's late cancellation counter is increased.

The slot becomes `UNAVAILABLE` after a late cancellation.

## 5. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/appointments/availability` | Publish tutor availability |
| PATCH | `/api/appointments/availability/:id/block` | Block an available slot |
| GET | `/api/tutors/:id/availability` | View tutor availability |
| POST | `/api/appointments` | Create a booking |
| PATCH | `/api/appointments/:id/cancel` | Cancel an appointment |

Authentication and role authorization are applied to the operations that modify availability or appointments.

## 6. Database Consistency and Concurrency

PostgreSQL transactions are used to keep related operations consistent.

Booking and availability blocking use `SELECT ... FOR UPDATE` to prevent conflicting updates to the same slot.

The database also includes constraints to prevent overlapping tutor slots and conflicting appointments.

These safeguards ensure that concurrent booking and blocking requests cannot both succeed for the same available slot.

## 7. Testing

The module includes integration and route tests covering:

- Availability publication and overlapping slots
- Availability blocking and ownership checks
- Tutor calendar filtering
- Booking creation and concurrency
- Minimum advance booking notice
- Normal and late cancellations
- Authorization and duplicate cancellations

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

At the time of the final P4 verification, all 193 backend tests passed, and ESLint reported no errors.

## 8. Integration Notes for P5

P5 should build on the existing booking and availability services rather than duplicating their database logic.

The reservation and cancellation operations already use PostgreSQL transactions.

Any new notifications, dashboards, or appointment-related features should integrate with the existing controllers and services.

Shared files, especially tutor routes and controllers, should be merged carefully to preserve changes made by other project modules.
