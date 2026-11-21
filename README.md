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

### Demo accounts (production)

To try the live site without registering, use these demo accounts (password `UniMentorDemo2026` for both). They hold no real data; please do not change them.

| Email | Role | What to try |
|---|---|---|
| `demo.tutor@unimentor.edu` | Tutor (Lucía Martín) | Profile with three subjects and free hours on weekdays 16:00-19:00 (Madrid) until 18 December 2026 |
| `demo.student@unimentor.edu` | Student (Pablo Ruiz) | Find Lucía in *Find Tutors*, book an hour and cancel it from the dashboard (notes and ratings open once a session has ended) |

The administrator account is not published here: ask the team for it. Team members keep every credential (local, production and service accounts) in `CREDENTIALS.local.md` at the repository root, a file that is in `.gitignore` and must never be committed.

## Tech stack

| Area | Technology | Used for |
|---|---|---|
| **Frontend** | HTML5, CSS3 (custom properties) and JavaScript ES modules, no framework and no build step (ADR 3) | The eight pages; calendar views drawn with plain HTML tables and lists; dates with the browser's `Intl` API |
| **Backend** | Node.js 22+ and Express 5 (ADR 1) | REST API in layers: routes, controllers, services, repositories |
| | `pg` 8 | PostgreSQL client and connection pool; transactions with `SELECT ... FOR UPDATE` |
| | `jsonwebtoken` 9, `bcryptjs` 3, `cookie-parser` 1 | JWT in an `HttpOnly` cookie (ADR 4) and password hashing (cost 12) |
| | `helmet` 8, `cors` 2 | Security headers and CORS with credentials (NFR-02) |
| | `dotenv` 18 | Loads `backend/.env` in development |
| | Built-in `fetch` | Brevo and SendGrid email APIs, without an SDK (ADR 6) |
| **Database** | PostgreSQL 17 (ADR 2) with the `btree_gist` and `unaccent` extensions | `EXCLUDE` constraints against overlapping slots (BR-CONF-05) and accent-insensitive search (CU-06) |
| **Quality** | ESLint 10 | Static analysis |
| | Jest 30 and Supertest 7 | Unit, integration and real-PostgreSQL tests (coverage >= 70 %, NFR-04) |
| | Artillery 2 | Load test (NFR-01) |
| | OWASP ZAP | Security baseline scan of the live site (NFR-02) |
| | `npm audit` | Vulnerable dependencies, checked in CI |
| **CI/CD** | GitHub Actions | Lint, tests and audit on every Pull Request; backup API keep-alive ping |
| **Hosting** (ADR 7, all free plans) | Vercel | Static frontend and the `/api` proxy |
| | Render | Node.js API (Oregon) |
| | Supabase | PostgreSQL database (Oregon); its `pg_cron` and `pg_net` extensions keep the API awake |
| | Brevo | Transactional email (300 a day) |
| **Development** | Docker | Local PostgreSQL |
| | nodemon 3 | Restarts the API on file changes |
| | `serve` (through `npx`) | Serves the frontend locally |
| **Documentation** | `marked` 18 and `puppeteer-core` 25 (with Chrome) | Builds the PDFs from Markdown (`docs/build/`) |

## Repository layout

```
backend/    REST API (Express, layered: routes -> controllers -> services -> repositories)
frontend/   Static site (HTML, CSS, JS modules). All API calls go through js/api.js
docs/       phase1/ (Phase 1 PDFs), phase2/ (Phase 2 document and PDF),
            modules/ (P4 and P5 notes), build/ (Markdown-to-PDF tool)
.github/    GitHub Actions: CI on every Pull Request and a backup API keep-alive ping
render.yaml Render Blueprint for the API (the database is on Supabase)
```

| Part | Scope | Section of the Phase 2 document |
|---|---|---|
| **P1** Structure and integration | Repository skeleton, ESLint, Jest, CI, database connection, error middleware, `api.js`, base CSS, deployment | 4.1 Project Structure, final layout |
| **P2** Database and search | Schema, migrations, test data, CU-03, CU-06 | 4.2 Database Schema |
| **P3** Authentication and admin | CU-01, CU-02, CU-13, CU-14, JWT and role middlewares, CSRF, lockout, audit log | 4.3.1 Chain of Responsibility |
| **P4** Bookings | CU-04, CU-05, CU-07, CU-08, CU-09, booking transaction with `FOR UPDATE`, concurrency test | 4.3.2 Repository |
| **P5** Notifications and history | CU-10, CU-11, CU-12, `NotificationService` (Brevo / SendGrid adapters) | 4.3.3 Adapter and Strategy |

Module notes by P4 and P5: `docs/modules/p4-bookings.md` and `docs/modules/p5-notifications.md`.

## Run locally (step by step)

These steps take about 10 minutes the first time. Commands are the same on macOS, Linux and Windows except where a step says otherwise (on Windows, use PowerShell).

### 1. Install the requirements (once)

- **Node.js 22 or newer:** https://nodejs.org
- **Docker Desktop:** https://www.docker.com/products/docker-desktop/ (it runs PostgreSQL, so you do not have to install it)
- **Git** (or GitHub Desktop)

Check them in a terminal:

```bash
node -v            # v22.x or newer
docker --version   # any recent version
```

### 2. Get the code (once)

```bash
git clone https://github.com/UniMentor-Software-Engineering/UniMentor.git
cd UniMentor
```

With GitHub Desktop: *File > Clone repository* and open a terminal in that folder. Every following command starts from this folder (the repository root).

### 3. Start the database and the API

Open **Docker Desktop** and wait until it says the engine is running. Then:

```bash
# Database: create the PostgreSQL container (only the first time)
docker run -d --name unimentor-pg -e POSTGRES_USER=unimentor -e POSTGRES_PASSWORD=unimentor -e POSTGRES_DB=unimentor -p 5432:5432 postgres:17-alpine

cd backend
cp .env.example .env      # local configuration (Windows: Copy-Item .env.example .env)
npm install               # installs the dependencies
npm run db:migrate        # creates the tables
npm run db:seed           # loads the test data (test accounts in step 5)
npm run dev               # starts the API
```

You should see `UniMentor API listening on port 3000 (development)`. Leave this terminal open. To check it, open http://localhost:3000/api/health/db in the browser: it must answer `{"status":"ok","database":"up",...}`.

### 4. Start the website

Open a **second terminal** in the repository root and run:

```bash
npx serve frontend -l 5500
```

If it asks to install `serve`, answer `y`. Leave this terminal open too.

### 5. Open it and sign in

Go to **http://localhost:5500**. The landing page must show "API: online" and "Database: online". Click *Sign in* and use one of the test accounts created by `npm run db:seed`:

| Email | Password | Role | Lands on |
|---|---|---|---|
| `admin@unimentor.edu` | `Password123!` | Administrator | `admin.html` |
| `laura.garcia@unimentor.edu` | `Password123!` | Tutor | `dashboard.html` |
| `carlos.martin@unimentor.edu` | `Password123!` | Tutor | `dashboard.html` |
| `diego.student@unimentor.edu` | `Password123!` | Student | `dashboard.html` |

A quick tour: as Diego, open *Find tutors*, view Laura's availability and book an hour; as Laura, publish new hours in *Availability*; as the administrator, look at the metrics and the audit log. Emails are not sent locally: they are printed in the API terminal. New accounts can register with an email from `myuax.com` or `unimentor.edu`.

These accounts exist only in your local database and are for development only: the seed refuses to run in production or against a remote database unless `ALLOW_SEED_RESET=true` is set.

### 6. Stop it, and start it again later

- **Stop:** `Ctrl+C` in both terminals, then `docker stop unimentor-pg`.
- **Start again** (steps 1 and 2 and the setup commands are not repeated):

  ```bash
  docker start unimentor-pg
  cd backend && npm run dev          # first terminal
  npx serve frontend -l 5500         # second terminal, from the repository root
  ```

- **After a `git pull`:** run `npm install` and `npm run db:migrate` in `backend/` before `npm run dev`, in case dependencies or tables changed.

### 7. If something fails

| Problem | Fix |
|---|---|
| `docker: Cannot connect to the Docker daemon` | Docker Desktop is not running: open it and wait |
| `The container name "/unimentor-pg" is already in use` | The container already exists: use `docker start unimentor-pg` instead of `docker run` |
| Port 5432 already in use | Another PostgreSQL is running. Map another port (`-p 5433:5432`) and change the port in `DATABASE_URL` in `backend/.env` |
| The page shows "API: offline" or a CORS error | The API is not running (step 3), or the site is not on port **5500**: only `localhost:5500` and `127.0.0.1:5500` are allowed (`FRONTEND_ORIGIN`) |
| "Database: offline" or errors about missing tables | Run `npm run db:migrate` (and `npm run db:seed`) in `backend/` |
| Sign-in fails with a test account | Run `npm run db:seed` again: it reloads the test data |

### Configuration (`backend/.env`)

The API reads its settings from `backend/.env`. That file is **not in the repository** (it is in `.gitignore`, because in other environments it holds secrets), so every developer creates it once from the template `backend/.env.example`, as in step 3. The template's values already match the Docker database and the ports above, so **nothing has to be edited to run the project locally**. Never commit `.env`.

| Variable | Local value (from `.env.example`) | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://unimentor:unimentor@localhost:5432/unimentor` | PostgreSQL connection (the Docker container of step 1) |
| `DB_SSL` | `false` | `true` for databases that require SSL, such as Supabase |
| `PORT` | `3000` | API port |
| `JWT_SECRET` | `change-me` | Signs the session tokens. Any value works locally |
| `FRONTEND_ORIGIN` | `http://localhost:5500,http://127.0.0.1:5500` | Origins allowed by CORS |
| `ALLOWED_EMAIL_DOMAINS` | `myuax.com,unimentor.edu` | Email domains that can register |
| `BREVO_API_KEY` / `SENDGRID_API_KEY` | not set | Real email. Without them, emails are printed in the API terminal |
| `EMAIL_FROM`, `EMAIL_TIMEZONE` | template values | Sender and time zone of the emails |
| `APP_URL` | not set (defaults to the first `FRONTEND_ORIGIN`) | Base URL of the links in emails |
| `SCHEDULER_ENABLED` | `true` | CU-10 reminder cycle every 10 minutes (`false` turns it off) |

Variables used only by some commands are passed on the command line instead: `TEST_DATABASE_URL` (`npm run test:db`), `ADMIN_EMAIL` and `ADMIN_PASSWORD` (`db:create-admin`), `RESET_EMAIL` and `RESET_PASSWORD` (`db:reset-password`) and `ALLOW_SEED_RESET` (`db:seed` on a remote database). Production does not use a `.env` file: its values are set in the Render service (*Environment*), see Deployment.

### Schema changes

New tables or columns go in a new numbered file in `backend/src/database/migrations/` (the next one is `007_...sql`). Never edit a migration that is already in `main`: databases that applied it will not run it again.

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
- **Reminders (CU-10) and keep-alive:** the scheduler runs inside the API every 10 minutes. Render's free instance sleeps after 15 minutes without traffic and no reminders are sent while it sleeps, so **the Supabase database calls `/api/health` every 10 minutes** with the `pg_cron` and `pg_net` extensions (job `unimentor-keep-alive`). It is set up once with `backend/src/database/supabase/keep-alive.sql`, which also explains how to check and remove it; it is not a migration because the local PostgreSQL has no such extensions. The `keep-alive.yml` GitHub workflow does the same as a backup, but GitHub's scheduled runs proved unreliable. For a real pilot, a paid Render instance avoids the issue.
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
