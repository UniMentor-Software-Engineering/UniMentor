# UniMentor

University tutoring platform: students find tutors by subject, book sessions in a calendar without conflicts, receive email confirmations and reminders, and keep notes and feedback in a personal history.

**Live:** https://unimentor-uax.vercel.app · Stack: vanilla HTML/CSS/JS (Vercel) · Node.js + Express (Render) · PostgreSQL (Supabase) · email through Brevo. The project documentation is in `docs/`.

## Pages

| Page | Who | What it does | Use cases |
|---|---|---|---|
| `index.html` | Everyone | Landing page; shows whether the API and the database are online | — |
| `register.html` | Visitors | Create a student or tutor account (institutional email only) | CU-01 |
| `login.html` | Everyone | Sign in; the account locks for 15 minutes after 5 failed attempts | CU-02 |
| `tutors.html` | Public, students | Search tutors by name or subject, see their free hours and book one | CU-06, CU-07, CU-08 |
| `profile.html` | Tutors | Bio, meeting link and subjects | CU-03 |
| `availability.html` | Tutors | Weekly grid to publish or block one-hour slots | CU-04, CU-05 |
| `dashboard.html` | Students, tutors | Upcoming sessions, history, cancellation, notes and ratings | CU-09, CU-11, CU-12 |
| `admin.html` | Administrator | Metrics, users, suspend or reactivate accounts, audit log | CU-13, CU-14 |

After signing in, students and tutors land on `dashboard.html` and the administrator on `admin.html`. Reminders 24 hours before a session (CU-10) are sent by a scheduler inside the API.

## Repository layout

```
backend/    REST API (Express, layered: routes -> controllers -> services -> repositories)
frontend/   Static site (HTML, CSS, JS modules). All API calls go through js/api.js
docs/       Project documentation: Phase 1 PDFs, Phase 2 document and module notes
.github/    GitHub Actions: CI on every Pull Request and the API keep-alive ping
render.yaml Render Blueprint for the API (the database is on Supabase)
```

| Part | Scope | Section of the Phase 2 document |
|---|---|---|
| **P1** Structure and integration | Repository skeleton, ESLint, Jest, CI, database connection, error middleware, `api.js`, base CSS, deployment | 4.1 Project Structure, final layout |
| **P2** Database and search | Schema, migrations, test data, CU-03, CU-06 | 4.2 Database Schema |
| **P3** Authentication and admin | CU-01, CU-02, CU-13, CU-14, JWT and role middlewares, CSRF, lockout, audit log | 4.3.1 Chain of Responsibility |
| **P4** Bookings | CU-04, CU-05, CU-07, CU-08, CU-09, booking transaction with `FOR UPDATE`, concurrency test | 4.3.2 Repository |
| **P5** Notifications and history | CU-10, CU-11, CU-12, `NotificationService` (Brevo / SendGrid adapters) | 4.3.3 Adapter and Strategy |

Module notes: `docs/phase2/p4-reservas/README.md` and `docs/phase2/p5-notifications/README.md`.

## Run locally

Requirements: [Node.js 22+](https://nodejs.org) and [Docker Desktop](https://www.docker.com/products/docker-desktop/) (used for PostgreSQL, so it does not have to be installed).

### macOS / Linux

```bash
# 1. Database (Docker Desktop must be running). The first time:
docker run -d --name unimentor-pg -e POSTGRES_USER=unimentor -e POSTGRES_PASSWORD=unimentor -e POSTGRES_DB=unimentor -p 5432:5432 postgres:17-alpine

# 2. API
cd backend
cp .env.example .env
npm install
npm run db:migrate        # creates or updates the tables (safe to run again)
npm run db:seed           # empties the tables and loads the test data
npm run dev               # http://localhost:3000/api/health

# 3. Frontend, in a second terminal, from the repository root
npx serve frontend -l 5500    # open http://localhost:5500
```

### Windows (PowerShell)

The same steps, with `Copy-Item .env.example .env` instead of `cp`:

```powershell
docker run -d --name unimentor-pg -e POSTGRES_USER=unimentor -e POSTGRES_PASSWORD=unimentor -e POSTGRES_DB=unimentor -p 5432:5432 postgres:17-alpine
cd backend
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

and, in a second terminal from the repository root, `npx serve frontend -l 5500`.

### Notes

- **Later days:** `docker start unimentor-pg`, then `npm run dev` and `npx serve frontend -l 5500`. To stop: `Ctrl+C` in both terminals and `docker stop unimentor-pg`.
- **Port 5500:** the frontend must run on `localhost:5500` (or `127.0.0.1:5500`), the origin allowed by CORS in `.env` (`FRONTEND_ORIGIN`). If port 5432 is taken, map another one (`-p 5433:5432`) and change it in `DATABASE_URL`.
- **No real email locally:** without `BREVO_API_KEY` or `SENDGRID_API_KEY`, every email is only written to the API terminal.
- **Test accounts** created by `npm run db:seed`, all with the password `Password123!`. They are for development only: the seed refuses to run in production or against a remote database unless you set `ALLOW_SEED_RESET=true`.

  | Email | Role |
  |---|---|
  | `admin@unimentor.edu` | ADMIN |
  | `laura.garcia@unimentor.edu` | TUTOR |
  | `carlos.martin@unimentor.edu` | TUTOR |
  | `diego.student@unimentor.edu` | STUDENT |

  New accounts can register with an email from `ALLOWED_EMAIL_DOMAINS` (in development, by default, `myuax.com` and `unimentor.edu`).
- **Schema changes** go in a new numbered file in `backend/src/database/migrations/` (the next one is `007_...sql`). Never edit a migration that is already in `main`: databases that applied it will not run it again.

## Scripts (backend)

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API with nodemon (restarts on file changes) |
| `npm start` | Starts the API with node (production) |
| `npm run db:migrate` | Applies the pending SQL migrations in `src/database/migrations/` |
| `npm run db:seed` | Empties the tables and loads the test data (`src/database/seeds.sql`) |
| `npm run db:create-admin` | Creates an administrator from `ADMIN_EMAIL` and `ADMIN_PASSWORD` |
| `npm run db:reset-password` | Sets a new password for `RESET_EMAIL` from `RESET_PASSWORD` and unlocks the account |
| `npm run lint` | Runs ESLint |
| `npm test` | Runs the Jest suite. Unit tests mock the database; the P4 and P5 integration tests use the local database, which must be migrated and seeded |
| `npm run test:coverage` | Tests + coverage report (CI requires >= 70 % lines, NFR-04) |
| `npm run test:db` | Tests against a real PostgreSQL. Set `TEST_DATABASE_URL` to a separate database: **these tests erase it** |
| `npm run test:load` | Load test for NFR-01, with the API running (Artillery, 50 users, fails if p95 > 200 ms) |

## Deployment

Production: frontend on Vercel, API on Render (Oregon), PostgreSQL on Supabase (Oregon), email through Brevo. Every part is on a free plan.

- **Backend (Render):** New > Blueprint > this repository (`render.yaml`). Then set `DATABASE_URL` (Supabase, see below) and `FRONTEND_ORIGIN` (the Vercel URL). The migrations run automatically every time the API starts. Only `myuax.com` addresses can register; change `ALLOWED_EMAIL_DOMAINS` if the university uses another domain. For Render to redeploy on every merge, the **Render GitHub App** must be installed on the GitHub organization; Render only redeploys when files under `backend/` change.
- **Database (Supabase):** the production PostgreSQL is a free Supabase project in `us-west-2` (Oregon, next to the Render API). Unlike Render's free PostgreSQL it does not expire; it is paused only after a week with almost no database activity, which the reminder scheduler prevents. In Render, `DATABASE_URL` is the project's **Session pooler** connection string (port 5432, from *Connect* in the Supabase dashboard) and `DB_SSL=true`.
- **First administrator:** run this once from your machine, with the Supabase *Session pooler* connection string. Choose your own password of 12 or more characters, with letters and digits, and do not write it down in the repository:

  ```bash
  cd backend
  DATABASE_URL="<Supabase Session pooler URL>" DB_SSL=true \
  ADMIN_EMAIL="<email>" ADMIN_PASSWORD="<password>" \
  npm run db:create-admin
  ```

  In PowerShell, set the variables first with `$env:NAME = "value"`. To change a password later (the app has no screen for it), use `RESET_EMAIL` and `RESET_PASSWORD` with `npm run db:reset-password`. It also unlocks the account and writes `PASSWORD_RESET` to the audit log. Never use `npm run db:seed` on a database with real users: it erases everything and creates accounts whose password is public.
- **Email (ADR 6):** production uses **Brevo** (free plan, 300 emails a day). In the Render service, set `BREVO_API_KEY`, `EMAIL_FROM` (`UniMentor <address>`, a sender verified in Brevo) and `APP_URL` (the Vercel URL, for the links in emails). `SENDGRID_API_KEY` still works (SendGrid now only offers a 60-day free trial); if both keys are set, Brevo is used. Without a key, emails are only written to the Render log. A Brevo API key expires after 90 days without use.
- **Reminders (CU-10):** the scheduler runs inside the API every 10 minutes. Render's free instance sleeps after 15 minutes without traffic and no reminders are sent while it sleeps, so the `keep-alive.yml` workflow pings `/api/health` every 10 minutes. GitHub can delay scheduled runs, so for a real pilot a paid instance is safer.
- **Frontend (Vercel):** import the repository and set **Root Directory** to `frontend` (framework preset: Other, no build command). `frontend/vercel.json` forwards `/api/*` to the Render service, so the pages call the API on their own domain and the session cookie is first-party (browsers that block third-party cookies, such as Safari, would drop it otherwise). If the Render URL is not `https://unimentor-api.onrender.com`, change it in that rewrite.
- **Check:** open the Vercel URL. The page must show "API: online" and "Database: online" (it shows an error if the tables are missing).

## Documentation PDFs

Each document is written in Markdown (with a small front matter block: eyebrow, title, subtitle, footer) and exported with the same layout as the Phase 1 PDFs:

```bash
cd docs/build
npm install
npm run pdf -- ../phase2/04-implementation-details.md   # writes ../phase2/04-implementation-details.pdf
```

Requires Chrome or Edge installed (or set `CHROME_PATH`). The Phase 1 PDFs in `docs/phase1/` are the reference and are not edited; the changes made since then are listed in section 4.4 of the Phase 2 document.

## Workflow

One branch and one Pull Request per use case or fix (e.g. `feature/cu-08-booking`). `main` is protected: a Pull Request needs the approval of another team member and both CI jobs green (`Backend lint and tests` and `Tests against a real PostgreSQL`) before it can be merged. Vercel and Render then deploy `main` automatically.

## Open items

- The Project Proposal names **GitHub Projects** as the management tool: check that the board is in use.
