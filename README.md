# UniMentor

University tutoring platform: students find tutors by subject, book sessions in a calendar without conflicts, receive email confirmations and reminders, and keep notes and feedback in a personal history.

Stack: vanilla HTML/CSS/JS (Vercel) · Node.js + Express (Render) · PostgreSQL (Supabase). See `docs/` for the project documentation.

## Repository layout

```
backend/    REST API (Express, layered: routes -> controllers -> services -> repositories)
frontend/   Static site (HTML, CSS, JS modules). All API calls go through js/api.js
docs/       Project documentation by phase
.github/    CI pipeline (GitHub Actions)
render.yaml Render Blueprint for the API and the database
```

## Run locally

Requirements: Node.js 22+ and a PostgreSQL database.

```bash
cd backend
cp .env.example .env      # then edit DATABASE_URL, etc.
npm install
npm run db:migrate        # creates or updates the tables (safe to run again)
npm run db:seed           # optional: empties the tables and loads the test data
npm run dev               # http://localhost:3000/api/health
```

Test accounts created by `npm run db:seed` (the password is `Password123!` for all of them). They are for development only: the seed refuses to run in production or against a remote database unless you set `ALLOW_SEED_RESET=true`.

| Email | Role |
|---|---|
| `admin@unimentor.edu` | ADMIN |
| `laura.garcia@unimentor.edu` | TUTOR |
| `carlos.martin@unimentor.edu` | TUTOR |
| `diego.student@unimentor.edu` | STUDENT |

Schema changes go in a new numbered file in `backend/src/database/migrations/` (e.g. `006_...sql`). Never edit a migration that is already in `main`: databases that applied it will not run it again.

Frontend: serve the `frontend/` folder with any static server on port 5500 (e.g. the VS Code "Live Server" extension, or `npx serve frontend -l 5500`) and open `http://localhost:5500`. The status card shows whether the API and the database are reachable.

### Windows (PowerShell)

Requirements: [Node.js 22+](https://nodejs.org) and [Docker Desktop](https://www.docker.com/products/docker-desktop/) (used for PostgreSQL, so it does not have to be installed).

1. **Database.** Start Docker Desktop and wait until the engine is running. The first time, create the container (the credentials match `backend/.env.example`):

   ```powershell
   docker run -d --name unimentor-pg -e POSTGRES_USER=unimentor -e POSTGRES_PASSWORD=unimentor -e POSTGRES_DB=unimentor -p 5432:5432 postgres:17-alpine
   ```

   On later days, `docker start unimentor-pg` is enough. If port 5432 is already in use, map another one (`-p 5433:5432`) and change the port in `DATABASE_URL`.

2. **Backend.** From the repository root:

   ```powershell
   cd backend
   Copy-Item .env.example .env
   npm install
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

   Check `http://localhost:3000/api/health`.

3. **Frontend.** In a second terminal, from the repository root:

   ```powershell
   npx serve frontend -l 5500
   ```

   Open `http://localhost:5500`. It must be port 5500 (or 127.0.0.1:5500), which is the origin allowed by CORS in `.env` (`FRONTEND_ORIGIN`).

   Sign in at `login.html` with a seed account (password `Password123!`): `admin@unimentor.edu` opens the admin panel (`admin.html`); `laura.garcia@unimentor.edu` and `carlos.martin@unimentor.edu` are tutors (they land on `profile.html`, CU-03) and `diego.student@unimentor.edu` is a student (`tutors.html`, CU-06, which is also public). New accounts can register at `register.html` with an email from `ALLOWED_EMAIL_DOMAINS` (in development, by default, `myuax.com` and `unimentor.edu`).

To stop everything: `Ctrl+C` in both terminals and `docker stop unimentor-pg`.

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
| `npm test` | Runs the Jest test suite, with the database mocked |
| `npm run test:coverage` | Tests + coverage report (CI requires >= 70 % lines, NFR-04) |
| `npm run test:db` | Tests against a real PostgreSQL. Set `TEST_DATABASE_URL` to a separate database: **these tests erase it** |
| `npm run test:load` | Load test for NFR-01, with the API running (Artillery, 50 users, fails if p95 > 200 ms) |

## Deployment

- **Backend (Render):** New > Blueprint > this repository (`render.yaml`). Then set `DATABASE_URL` (Supabase, see below) and `FRONTEND_ORIGIN` (the Vercel URL). The migrations run automatically every time the API starts. Only `myuax.com` addresses can register; change `ALLOWED_EMAIL_DOMAINS` if the university uses another domain.
- **First administrator:** run this once from your machine (PowerShell), with the Supabase *Session pooler* connection string. Choose your own password of 12 or more characters, with letters and digits, and do not write it down in the repository:

  ```powershell
  cd backend
  $env:DATABASE_URL = "<Supabase Session pooler URL>"; $env:DB_SSL = "true"
  $env:ADMIN_EMAIL = "<email>"; $env:ADMIN_PASSWORD = "<password>"
  npm run db:create-admin
  ```

  To change a password later (the app has no screen for it), use the same variables with `RESET_EMAIL` and `RESET_PASSWORD` and run `npm run db:reset-password`. It also unlocks the account and writes `PASSWORD_RESET` to the audit log.

  Close that terminal afterwards so the variables disappear. Do not use `npm run db:seed` on a database with real users: it erases everything and creates accounts whose password is public.
- **Email (ADR 6):** production uses **Brevo** (free plan, 300 emails a day). In the Render service, set `BREVO_API_KEY`, `EMAIL_FROM` (`UniMentor <address>`, a sender verified in Brevo) and `APP_URL` (the Vercel URL, for the links in emails). `SENDGRID_API_KEY` still works (SendGrid now only offers a 60-day free trial); if both keys are set, Brevo is used. Without a key, emails are only written to the Render log.
- **Reminders (CU-10):** the scheduler runs inside the API every 10 minutes. Render's free instance sleeps after 15 minutes without traffic and no reminders are sent while it sleeps, so the `keep-alive.yml` workflow pings `/api/health` every 10 minutes. GitHub can delay scheduled runs, so for a real pilot a paid instance is safer.
- **Database (Supabase):** the production PostgreSQL is a free Supabase project in `us-west-2` (Oregon, next to the Render API). Unlike Render's free PostgreSQL it does not expire; it is paused only after a week with almost no database activity, which the reminder scheduler prevents. In Render, `DATABASE_URL` is the project's **Session pooler** connection string (port 5432, from *Connect* in the Supabase dashboard) and `DB_SSL=true`. The migrations run on every start, as before.
- **Frontend (Vercel):** import the repository and set **Root Directory** to `frontend` (framework preset: Other, no build command). `frontend/vercel.json` forwards `/api/*` to the Render service, so the pages call the API on their own domain and the session cookie is not a third-party cookie (Safari and private windows block those). If the Render URL is not `https://unimentor-api.onrender.com`, change it in that rewrite.
- **Check:** open the Vercel URL. The page must show "API: online" and "Database: online" (it shows an error if the tables are missing). Try signing in with Safari too: it may block the cross-site session cookie of ADR 4.

## Documentation PDFs

Each document is written in Markdown (with a small front matter block: eyebrow, title, subtitle, footer) and exported with the same layout as the Phase 1 PDFs:

```bash
cd docs/build
npm install
npm run pdf -- ../phase2/04-implementation-details.md   # writes ../phase2/04-implementation-details.pdf
```

Requires Chrome or Edge installed (or set `CHROME_PATH`).

## Workflow

One branch and one Pull Request per use case (e.g. `feature/cu-08-booking`). Another team member reviews it, and it is merged into `main` only when the CI is green.
