# UniMentor — Phase 1, Section 1: Introduction and State of the Art

**Team:** Kevin Rojas Cuya, Gabriel Kaakedjian Moradei, Diego Hernández-Briz Martín, Alex Duran, Alberto Gonzalez Olmedo
**Repository:** https://github.com/UniMentor-Software-Engineering/UniMentor
**Status:** Draft for review in week 2. Items marked `[TO CONFIRM]` need data only the team has.

---

## 1.1 Problem Context

### The environment

At a university, academic support is spread across many informal channels: department notice boards, peer-tutoring programmes run by individual faculties, personal contacts, class group chats and email. A student who is struggling with a subject such as Calculus, Algorithms or Thermodynamics usually does not know whether a tutor exists, who it is, what that tutor is good at, or when they are free. A tutor or mentor, on the other hand, has no single place to say "I am available on Tuesdays from 16:00 to 18:00 for Algorithms" and no way to see who has actually committed to a slot.

The process today typically looks like this:

1. The student hears about a tutor by word of mouth or finds a poster.
2. The student writes an email or message and waits for an answer.
3. The two negotiate a time through several back-and-forth messages.
4. The session happens (or not, if one side forgets). Nothing is recorded.
5. Neither side keeps a history of what was covered or whether it helped.

### Why the current process is inefficient

| Inefficiency | Consequence |
|---|---|
| **No discoverability.** Tutors and their areas of expertise are not listed anywhere central. | Students give up, or pick the wrong tutor for their need. |
| **Manual scheduling.** Availability is negotiated by message. | Many messages for one booking; slots are double-booked or missed because nothing enforces the schedule. |
| **No reminders or confirmations.** | No-shows and forgotten sessions waste the tutor's time. |
| **No record of sessions.** | There is no history, no feedback and no way to track a student's progress over a semester. |
| **No visibility for the institution.** | Nobody can tell how much tutoring is used, so educational resources are underused and cannot be improved. |

### Who suffers from the problem

- **Students** (primary). They lose time and often do not get help when they need it, which affects grades and drop-out risk. First-year students and students new to the university are hit hardest because they have no network.
- **Tutors and mentors.** They are willing to help but spend their effort coordinating instead of teaching, and they get no recognition because their work is not recorded.
- **Programme administrators.** They cannot measure demand, supply or outcomes.
- **The university.** Existing educational resources are underused.

### Proposed response

UniMentor is a web platform that centralises the whole cycle: a tutor publishes expertise and availability, a student finds a suitable tutor and books a free slot in an interactive calendar without conflicts, both receive email confirmations and reminders, and after the session notes and feedback are stored in a personal history. To keep the project manageable, video calls (external Meet/Zoom links), payments and real-time chat are explicitly out of scope.

---

## 1.2 SMART Goals and KPIs

The five goals below refine the three project objectives of the proposal (search and booking, expertise profiles, session records) and add two quality goals (reliability and performance). Each goal is Specific, Measurable, Achievable, Relevant and Time-bound. Targets marked as *pilot* assume a small pilot at one university; the numbers should be validated by the team.

| # | Goal | KPI | Target | Measured by | Deadline |
|---|---|---|---|---|---|
| **G1** | **Fast booking.** A student can find a tutor and book a session without any external messaging. | Time from landing on the search page to a confirmed booking | ≤ 3 minutes (median) and ≤ 6 clicks | Usability test with 5 students, stopwatch plus click count | End of first functional release |
| **G2** | **No schedule conflicts.** The system never lets two sessions overlap for the same tutor or the same student. | Double bookings produced | 0 in 100 % of automated concurrency tests (50 simultaneous requests for the same slot yield exactly 1 booking) | Automated concurrency test on the booking endpoint | Before first release |
| **G3** | **Good tutor-student matching.** Tutors describe their expertise so students can search by subject. | % of tutor profiles with at least 1 subject and a short description; % of searches by subject that return at least one tutor | ≥ 90 % complete profiles; ≥ 80 % of subject searches non-empty (*pilot*) | Database query plus search logs | 4 weeks after pilot start |
| **G4** | **Centralised session record.** Completed sessions carry notes and feedback. | % of completed sessions with at least a tutor note or a student rating | ≥ 70 % (*pilot*) | Database query | End of pilot semester |
| **G5** | **Reliable and responsive service.** The system answers fast and notifies on time. | (a) 95th-percentile latency of availability and booking endpoints; (b) share of confirmation emails delivered within 60 s; (c) share of reminders sent 24 h ± 15 min before the session | (a) < 200 ms at 50 concurrent users; (b) ≥ 95 %; (c) ≥ 95 % | Load test (e.g. k6) and email-log analysis | End of first functional release |

### Why these numbers

- G1 compares with the current process, which takes at least one message round-trip (hours or days). Three minutes is realistic for a calendar-based flow.
- G2 is the most important technical goal because the proposal names collision handling as the main risk. Its target is absolute (zero).
- G5(a) uses 200 ms because it is the usual threshold at which an interface feels instant. 50 concurrent users is far above what a single-university pilot needs `[TO CONFIRM expected number of users]`.
- G3 and G4 depend on user behaviour, so they are set as adoption targets for a pilot rather than technical guarantees.

---

## 1.3 State of the Art Analysis

### Method

We compared UniMentor with two products that cover different parts of the problem. Information comes from the vendors' public pages and third-party reviews (see References). Where a vendor does not publish a fact (mostly technology stack and internal scalability), we say so instead of guessing.

- **Calendly** is a general-purpose scheduling tool. It represents the "calendar" half of our problem.
- **Superprof / Wyzant** are tutoring marketplaces. We use **Wyzant** as the second reference because its fees are clearly documented, and mention Superprof as additional context.

### Comparative matrix

| Dimension | **Calendly** | **Wyzant** (tutoring marketplace) | **UniMentor** (proposed) |
|---|---|---|---|
| **Primary purpose** | Scheduling meetings through booking links | Marketplace where students hire private tutors | University-run tutoring management |
| **Calendar and booking** | Yes: availability rules, calendar sync, reminders, group events | Booking and scheduling within the platform | Yes: tutor availability, student booking, conflict prevention |
| **Tutor/mentor profiles by expertise** | No, it is not a tutoring product; there is no subject search | Yes: profiles, subjects, ratings, search | Yes: profile with areas of expertise, searchable by subject |
| **Session notes, feedback and progress** | No (meeting scheduling only) | Session reports and reviews; reports exist mainly for billing | Yes: notes, feedback and history are a core feature |
| **Roles** | Hosts and invitees; team roles on paid plans | Students and tutors | Student, Tutor, Admin (university oversight) |
| **Notifications** | Email and SMS reminders on paid plans | Email and in-platform messaging | Email confirmations and reminders |
| **Payments** | Optional via Stripe/PayPal on paid plans | Mandatory: platform takes payment from students | None, assumed free university service (out of scope) |
| **Cost to the user** | Free tier limited to 1 event type; Standard about $10–12 per seat per month; Teams about $16–20 per seat per month; Enterprise from about $15,000 per year | Tutor pays a flat 25 % fee; student pays about 9 % service fee on top of the tutor's rate | Free for students and tutors; cost is hosting only (free/low tiers of Vercel and Render) |
| **Scalability** | High: commercial SaaS with a public API and webhooks; scale is the vendor's responsibility | High: commercial marketplace, operated by the vendor | Modest by design: a single university; a layered monolith can scale vertically and later be split |
| **Data ownership and integration** | Vendor-hosted; integrates with many tools through API | Vendor-hosted; no university integration | Owned by the university; can be adapted to its needs |
| **Technology stack** | Not publicly documented in detail | Not publicly documented in detail | HTML/CSS/JavaScript, Node.js + Express, PostgreSQL, Vercel and Render |

### Analysis

**What the competitors do well.** Calendly has a mature booking experience and a robust API. Wyzant has the matching, reviews and trust features a tutoring service needs.

**Gaps that justify UniMentor.**

1. *Calendly has no tutoring concept.* No expertise profiles, no subject search, no session history, and meaningful features require paid seats, which a university programme would have to fund per tutor.
2. *Wyzant is commercial.* It is built around payments and fees (25 % plus about 9 %), is open to anyone, and is not integrated with a university's students, tutors or oversight. It is unsuitable for a free, institution-run service.
3. *Neither tracks academic progress over time inside an institution.* Session notes and feedback tied to a student's university record are not a feature of either product.
4. *Neither gives the institution oversight.* An Admin role that sees demand and usage is missing.

**Where UniMentor is weaker, honestly.** We will not match the scale, polish or ecosystem of commercial tools, and we must build our own calendar logic, which is the project's main technical risk. We accept this trade-off because the scope is deliberately small and fits a single institution.

**Positioning.** UniMentor combines Calendly's booking convenience with a marketplace's expertise matching, in a free, institution-owned product with session records.

---

## References

- Calendly pricing and plans, 2026: [Zeeg](https://zeeg.me/en/blog/post/calendly-pricing), [Jotform](https://www.jotform.com/blog/calendly-pricing/), [Koalendar](https://koalendar.com/blog/calendly-free-vs-paid)
- Wyzant fees: [Wyzant support, service fee charged to students](https://support.wyzant.com/tutors/tutor-payments/what-is-the-service-fee-charged-to-students/), [TutorTab, Wyzant commission](https://tutortab.net/compare/wyzant-commission)
- Superprof model and fees: [Superprof, how it works](https://www.superprof.co.in/blog/how-superprof-works/), [Superprof payment and commission](https://www.superprof.sg/blog/charges-payments-superprof/)

> Prices are third-party reports checked in 2026 and may change; re-verify before the final submission.