# UniMentor — Phase 1, Section 2: Requirements Engineering

**Status:** Draft for review in week 3. Items marked `[TO CONFIRM]` need a team or stakeholder decision.

---

## 2.1 Stakeholders

A stakeholder is anyone affected by the system or able to affect it. For each one we state the primary concerns, because those concerns drive the requirements in 2.3 and 2.4.

| Stakeholder | Role in the system | Primary concerns | Resulting emphasis |
|---|---|---|---|
| **Student** | Searches tutors, books and attends sessions, leaves feedback. Main end user. | **Speed and simplicity**: find a suitable tutor and book in minutes. **Certainty**: the booking is really confirmed and the tutor will be there. **Privacy** of their academic struggles. | Usability, performance, conflict-free booking, reminders, privacy |
| **Tutor / Mentor** | Publishes expertise and availability, runs sessions, writes notes. | **Control over their time**: no surprise or overlapping bookings, ability to block slots. **Low overhead**: minimal effort to publish availability and record sessions. **Recognition**: their sessions are recorded. | Availability management, no double-booking, simple session record |
| **Administrator** | Manages users and roles, supervises the platform. | **Security**: only authorised users can act, roles are enforced, accounts can be disabled. **Oversight**: can see users and usage. **Accountability**: actions are traceable. | Authentication, authorisation, audit, user management |
| **University / programme coordinator** | Sponsors the service, decides if it continues. | **Value for money**: free or very low running cost. **Adoption**: students and tutors actually use it. **Data protection** compliance for student data (GDPR in the EU). | Low-cost stack, usage metrics, data protection |
| **Development team (5 members)** | Builds and maintains the system. | **Maintainability**: code that five students can understand and extend. **Feasibility**: scope that fits the course timeline. **Testability**: ability to verify the calendar logic. | Layered design, documentation, automated tests |
| **Course instructor** | Reviews and grades the project. | **Traceability** between objectives, requirements, design and decisions; adherence to the required deliverables. | Consistent IDs across documents |
| **External services** (email provider, Google Meet / Zoom) | Deliver emails; host video meetings via links. | **Stable interface** and acceptable usage limits. | Provider-agnostic email layer; links only |

---

## 2.2 Actors and Scope Summary

- **Student**, **Tutor** and **Admin** are the three roles of the system (from the proposal).
- Out of scope: integrated video calls, payments, real-time chat.
- Times are stored in UTC and displayed in the user's time zone (see ADR-007 in Section 3).

### Session types

A student requests one of three **session types** when booking. The type determines the maximum length of the session and therefore the time reserved in the tutor's calendar.

| Code | Name | Maximum duration | Purpose |
|---|---|---|---|
| `QUICK_CHECK` | Quick Check | 5 min | A brief conversation where the tutor asks the student about their current academic performance. |
| `STANDARD` | Standard Tutoring | 30 min | Solving doubts about exercises and course material. |
| `DEEP_DIVE` | Deep Dive | 60 min | Solving deeper doubts that need more time. |

Durations are **maximums**: the appointment reserves exactly that block in the calendar, and the session may end earlier. Session types are defined by the system (not edited by users) and stored in a table so durations can be adjusted without changing code (see ADR-012). Rules governing them are **BR-27 to BR-31**.

---

## 2.3 Use Cases

Each use case has an **ID**, **actor**, **Trigger** (what starts the process), the **main flow**, and a **Business Rule** (the constraint that must hold). Business rules are numbered `BR-x` so they can be tested and referenced from the design.

### Use case summary

| ID | Name | Actor |
|---|---|---|
| UC-01 | Register account | Student, Tutor |
| UC-02 | Log in / log out | All |
| UC-03 | Manage tutor profile | Tutor |
| UC-04 | Publish availability (windows) | Tutor |
| UC-05 | Search tutors | Student |
| UC-06 | Book a session | Student |
| UC-07 | Cancel a session | Student, Tutor |
| UC-08 | View dashboard | Student, Tutor |
| UC-09 | Record session notes and feedback | Tutor, Student |
| UC-10 | Receive confirmation and reminders | Student, Tutor (system-triggered) |
| UC-11 | Manage users and roles | Admin |

### UC-01 Register account

- **Actor:** Student or Tutor (a new user).
- **Trigger:** A visitor submits the registration form.
- **Preconditions:** The visitor has no account with that email.
- **Main flow:** (1) Visitor enters name, email, password and chosen role. (2) System validates the data. (3) System stores the user with a hashed password. (4) System sends a welcome/verification email. (5) User can log in.
- **Alternative flows:** Email already registered → error message. Weak password → rejected with explanation.
- **Business Rules:**
  - **BR-01:** Email addresses are unique `[TO CONFIRM: restrict to the university domain, e.g. @university.edu]`.
  - **BR-02:** Users can self-register only as Student or Tutor; the Admin role is assigned only by another Admin.
  - **BR-03:** Passwords are never stored in plain text.

### UC-02 Log in / log out

- **Actor:** Any registered user.
- **Trigger:** The user submits credentials on the login page.
- **Main flow:** (1) User enters email and password. (2) System verifies them. (3) System issues a session token. (4) User is redirected to their dashboard.
- **Alternative flows:** Invalid credentials → generic error ("email or password incorrect"). Too many failures → temporary lock.
- **Business Rules:**
  - **BR-04:** Every non-public endpoint requires a valid token, and access depends on the user's role.
  - **BR-05:** After 5 consecutive failed attempts the account is blocked for a cool-down period.

### UC-03 Manage tutor profile

- **Actor:** Tutor.
- **Trigger:** The tutor opens "My profile" and saves changes.
- **Main flow:** (1) Tutor edits bio, subjects (areas of expertise), degree/year and meeting link preference (Meet/Zoom URL). (2) System validates. (3) System saves and the profile becomes searchable.
- **Business Rules:**
  - **BR-06:** A profile is searchable only if it has at least one subject.
  - **BR-07:** A meeting link, if provided, must be a valid https URL.

### UC-04 Publish availability

- **Actor:** Tutor.
- **Trigger:** The tutor adds or removes an availability window in the calendar.
- **Main flow:** (1) Tutor selects date and start/end time of a window in which they can tutor (for example Tuesday 16:00–18:00). (2) System checks for overlap with the tutor's existing windows. (3) System creates the window as "open". Students then book sessions of any type inside it (UC-06).
- **Alternative flows:** Overlap → rejected, the conflicting window is shown. Removing a window that contains active bookings → blocked until those bookings are cancelled.
- **Business Rules:**
  - **BR-08:** A tutor's availability windows cannot overlap one another.
  - **BR-09:** Windows must lie in the future and be at least as long as the shortest session type (5 min); a maximum length of `[TO CONFIRM: e.g. 8 h]` applies.
  - **BR-10:** A window containing an active booking cannot be deleted or shortened so that the booking falls outside it.

### UC-05 Search tutors

- **Actor:** Student.
- **Trigger:** The student enters a subject or keyword in the search box or opens the tutor list.
- **Main flow:** (1) Student enters a query and optional filters (subject, date, session type). (2) System returns matching tutors with their next free times for the chosen session type. (3) Student opens a profile.
- **Business Rule:**
  - **BR-11:** Only active tutors with at least one future window that still has enough free time for the chosen session type are offered for booking; inactive or disabled accounts never appear.

### UC-06 Book a session

- **Actor:** Student.
- **Trigger:** The student chooses a session type, selects a free start time and presses "Book".
- **Preconditions:** Student is logged in; the tutor has a window with enough free time.
- **Main flow:** (1) Student chooses a session type (Quick Check 5 min, Standard 30 min or Deep Dive 60 min). (2) System shows the free start times of the tutor for that duration. (3) Student selects a start time and optionally writes a topic/message. (4) System computes the end time from the session type and checks that the block lies inside an open window, is free of other bookings and does not overlap another session of the student. (5) System creates the appointment as "confirmed" in one atomic operation. (6) System queues confirmation emails to both parties (UC-10). (7) Appointment appears on both dashboards with its session type.
- **Alternative flows:** Time taken in the meantime → clear message and refreshed calendar. Student has a conflicting session → rejected. No free block long enough for the chosen type → the student is offered a shorter type or other times.
- **Business Rules:**
  - **BR-12:** A tutor's time can have at most one active booking at any moment, even with simultaneous requests (no two active appointments of the same tutor overlap).
  - **BR-27:** Every appointment has exactly one session type, and its reserved duration equals the maximum duration of that type (5, 30 or 60 min).
  - **BR-28:** The block of an appointment must lie entirely inside one open availability window of the tutor.
  - **BR-29:** Start times are offered on a fixed grid of `[TO CONFIRM: 5 min]` so that windows do not fragment into unusable gaps.
  - **BR-30:** A student may hold at most `[TO CONFIRM: e.g. 1]` active Deep Dive and `[TO CONFIRM: e.g. 2]` active Standard appointments per tutor at a time, to prevent a single student from monopolising a tutor.
  - **BR-13:** A student cannot hold two overlapping active appointments.
  - **BR-14:** A booking requires a minimum lead time `[TO CONFIRM: e.g. 2 hours]` before the start.
  - **BR-15:** Tutors cannot book sessions with themselves.

### UC-07 Cancel a session

- **Actor:** Student or Tutor.
- **Trigger:** A participant presses "Cancel" on an upcoming appointment.
- **Main flow:** (1) User confirms cancellation and may add a reason. (2) System marks the appointment "cancelled". (3) The reserved block becomes free again inside the tutor's window (unless the tutor cancelled it because they are no longer available). (4) System queues cancellation emails.
- **Business Rules:**
  - **BR-16:** Appointments can only be cancelled before they start and not later than `[TO CONFIRM: e.g. 2 hours]` before the start.
  - **BR-17:** Cancelled appointments are kept in the history, never deleted.

### UC-08 View dashboard

- **Actor:** Student or Tutor.
- **Trigger:** The user logs in or opens "Dashboard".
- **Main flow:** (1) System loads upcoming appointments and past sessions for the user. (2) System shows them in chronological order with status.
- **Business Rule:**
  - **BR-18:** A user sees only their own appointments and records; times are shown in the user's time zone.

### UC-09 Record session notes and feedback

- **Actor:** Tutor (notes), Student (feedback).
- **Trigger:** A session's end time passes and the participant opens it from the history.
- **Main flow:** (1) Tutor writes notes (topics covered, next steps) and marks the session "completed" or "no-show". (2) Student optionally gives a rating (1–5) and a comment. (3) System saves them in the session record.
- **Business Rules:**
  - **BR-19:** Notes and feedback can only be added after the session's scheduled end.
  - **BR-20:** Tutor notes are visible to the tutor and the student of that session only (and not to other users); Admins see aggregate data `[TO CONFIRM: whether Admins may read notes]`.
  - **BR-21:** A rating is accepted once per student per session.
  - **BR-31:** For a Quick Check the tutor's record is a short summary of the student's current academic performance (and, if needed, a recommendation to book a Standard or Deep Dive session); free-form notes are optional. For Standard and Deep Dive sessions notes on the topics covered are expected.

### UC-10 Receive confirmation and reminders

- **Actor:** System (triggered); recipients are Student and Tutor.
- **Trigger:** (a) A booking is created or cancelled; (b) the scheduler detects an appointment starting in about 24 hours.
- **Main flow:** (1) System creates an email job. (2) A background worker sends it. (3) Result is logged; failures are retried.
- **Business Rules:**
  - **BR-22:** Email sending must never block or fail the booking itself.
  - **BR-23:** A reminder is sent at most once per appointment and never for cancelled appointments.

### UC-11 Manage users and roles

- **Actor:** Admin.
- **Trigger:** The admin opens the user list and changes a user.
- **Main flow:** (1) Admin searches a user. (2) Admin changes the role or disables/enables the account. (3) System records who did it and when.
- **Business Rules:**
  - **BR-24:** Only Admins can change roles or disable accounts.
  - **BR-25:** Disabling an account cancels its future appointments and notifies the other parties.
  - **BR-26:** The last active Admin cannot be disabled or demoted.

---

## 2.4 Functional Requirements (derived)

| ID | Requirement | Source |
|---|---|---|
| FR-01 | The system shall allow registration, login and logout with role-based access. | UC-01, UC-02 |
| FR-02 | The system shall let tutors maintain a profile with areas of expertise. | UC-03 |
| FR-03 | The system shall let tutors publish and remove availability windows. | UC-04 |
| FR-04 | The system shall let students search tutors by subject and session type and see free times. | UC-05 |
| FR-05 | The system shall let students book a session of a chosen type (5, 30 or 60 min) at a free time and shall reject conflicting bookings. | UC-06 |
| FR-11 | The system shall offer three session types (Quick Check 5 min, Standard 30 min, Deep Dive 60 min), show the type on every appointment and dashboard entry, and reserve in the calendar the duration of the chosen type. | UC-06, UC-08, BR-27 |
| FR-06 | The system shall let participants cancel upcoming appointments. | UC-07 |
| FR-07 | The system shall show each user a dashboard of upcoming and past sessions. | UC-08 |
| FR-08 | The system shall store session notes and feedback. | UC-09 |
| FR-09 | The system shall send email confirmations, cancellations and reminders. | UC-10 |
| FR-10 | The system shall let Admins manage users and roles. | UC-11 |

---

## 2.5 Non-Functional Requirements

Non-functional requirements (NFRs) are grouped by quality category. Each has a measurable criterion and a **verification method**, so it can be tested rather than only claimed. They connect to the goals G1–G5 in Section 1.

### Performance

| ID | Requirement | Verification method |
|---|---|---|
| NFR-P1 | 95th-percentile response time of availability and booking endpoints below 200 ms with 50 concurrent users (G5). | Load testing with k6 or Artillery against a staging environment seeded with realistic data. |
| NFR-P2 | Pages are usable (main content visible) within 3 s on a typical broadband connection. | Lighthouse audit in CI and manual checks on a throttled network profile. |
| NFR-P3 | Search by subject returns within 300 ms for up to 1,000 tutors. | Benchmark script with seeded data; inspect the query plan (`EXPLAIN ANALYZE`) to confirm index use. |

### Security

| ID | Requirement | Verification method |
|---|---|---|
| NFR-S1 | Passwords are stored only as salted hashes (bcrypt or argon2). | Code review and a database inspection test confirming no plain-text values. |
| NFR-S2 | All traffic uses HTTPS. | Automated check that HTTP is redirected; SSL scan of the deployed URL. |
| NFR-S3 | Role-based authorisation is enforced on the server for every protected endpoint. | Automated API tests that call each endpoint with each role and with no token and expect 401/403 as appropriate. |
| NFR-S4 | All database access uses parameterised queries (no SQL injection). | Static analysis/linting, code review and manual injection tests on inputs. |
| NFR-S5 | Brute-force login protection (rate limit and temporary lock). | Scripted test sending repeated failed logins and checking the lock. |
| NFR-S6 | Personal data is minimal, and users can request deletion `[TO CONFIRM: GDPR scope]`. | Data inventory review; test of the deletion/anonymisation procedure. |

### Reliability and Correctness

| ID | Requirement | Verification method |
|---|---|---|
| NFR-R1 | No double bookings under concurrency (G2, BR-12, BR-13). | Automated concurrency test: 50 parallel booking requests for the same time must yield exactly one success. A second test checks the database constraint directly. |
| NFR-R1b | Mixed session lengths never produce overlaps or blocks outside the tutor's windows (BR-27, BR-28). | Automated tests with combinations of 5, 30 and 60-minute bookings in one window, including bookings that touch exactly at the boundaries (end of one = start of next is allowed) and a concurrency test mixing session types. |
| NFR-R2 | Time handling is correct across time zones and daylight-saving changes. | Unit tests with fixed dates around DST transitions and users in at least three time zones. |
| NFR-R3 | Email failure does not affect booking, and failed emails are retried up to 3 times. | Integration test with a failing mock email provider; booking must still succeed and a retry must be recorded. |
| NFR-R4 | Booking and cancellation are atomic: either all changes are saved or none. | Fault-injection test that raises an error mid-operation and checks that no partial data remains. |
| NFR-R5 | Service availability of at least 99 % during the pilot `[TO CONFIRM: free hosting may sleep]`. | Uptime monitor (e.g. UptimeRobot) with a periodic health check. |
| NFR-R6 | Daily database backups `[TO CONFIRM: depends on hosting plan]`. | Restore test performed at least once on a copy. |

### Usability

| ID | Requirement | Verification method |
|---|---|---|
| NFR-U1 | A new student completes a booking in at most 6 clicks and 3 minutes (G1). | Moderated usability test with 5 users, measuring time and clicks. |
| NFR-U2 | The interface works on mobile and desktop (responsive from 360 px wide). | Manual testing on real devices and browser developer-tools emulation. |
| NFR-U3 | Basic accessibility: keyboard navigation, labels and sufficient contrast (WCAG 2.1 AA as a target). | Lighthouse/axe automated audit plus a manual keyboard-only walkthrough. |

### Maintainability

| ID | Requirement | Verification method |
|---|---|---|
| NFR-M1 | The code follows a layered structure (routes → services → repositories), with no SQL outside repositories. | Code review checklist and an automated dependency-rule check (e.g. ESLint import rules). |
| NFR-M2 | Business logic (calendar, booking rules) has at least 80 % unit-test coverage. | Coverage report from the test runner (Jest) enforced in CI. |
| NFR-M3 | Every pull request is reviewed by one other team member and passes lint and tests. | GitHub branch protection rules. |
| NFR-M4 | Database changes are made through versioned migrations. | Check that a fresh database can be built only from the migration files. |
| NFR-M5 | The API is documented (OpenAPI) and the README explains setup in under 15 minutes. | A team member who did not write the code follows the README on a clean machine. |

### Portability and Compatibility

| ID | Requirement | Verification method |
|---|---|---|
| NFR-C1 | The frontend works on the latest two versions of Chrome, Firefox, Safari and Edge. | Manual cross-browser test of the main flows (UC-02, UC-05, UC-06). |
| NFR-C2 | Configuration (database URL, email key, secrets) is read from environment variables, so the backend can move between hosts. | Deploy the backend on a second environment using only environment variables. |

### Cost / Constraints

| ID | Requirement | Verification method |
|---|---|---|
| NFR-K1 | Running cost during the project stays within free or student tiers of Vercel, Render and the email provider. | Review of hosting bills and usage dashboards at the end of each phase. |

---

## 2.6 Traceability Summary

| Goal (Section 1) | Use cases | Key requirements |
|---|---|---|
| G1 Fast booking | UC-05, UC-06 | FR-04, FR-05, FR-11, NFR-U1 |
| G2 No conflicts | UC-04, UC-06, UC-07 | BR-08, BR-12, BR-13, BR-27, BR-28, NFR-R1, NFR-R1b |
| G3 Matching | UC-03, UC-05 | FR-02, FR-04, BR-06 |
| G4 Session record | UC-09, UC-08 | FR-07, FR-08, BR-19, BR-31 |
| G5 Reliability and performance | UC-10, all | NFR-P1, NFR-R3, BR-22, BR-23 |
