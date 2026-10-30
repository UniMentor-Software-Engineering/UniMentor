# UniMentor

University tutoring platform: students find tutors by subject, book sessions in a calendar without conflicts, receive email confirmations and reminders, and keep notes and feedback in a personal history.

Stack: vanilla HTML/CSS/JS (Vercel) · Node.js + Express (Render) · PostgreSQL (Render). See `docs/` for the project documentation.

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

Test accounts created by `npm run db:seed` (the password is `Password123!` for all of them):

| Email | Role |
|---|---|
| `admin@unimentor.edu` | ADMIN |
| `laura.garcia@unimentor.edu` | TUTOR |
| `carlos.martin@unimentor.edu` | TUTOR |
| `diego.student@unimentor.edu` | STUDENT |

Schema changes go in a new numbered file in `backend/src/database/migrations/` (e.g. `004_...sql`). Never edit a migration that is already in `main`: databases that applied it will not run it again.

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

   Sign in at `login.html` with a seed account (password `Password123!`): `admin@unimentor.edu` opens the admin panel (`admin.html`); `laura.garcia@unimentor.edu` and `carlos.martin@unimentor.edu` are tutors and `diego.student@unimentor.edu` is a student. New accounts can register at `register.html` with an email from `ALLOWED_EMAIL_DOMAINS` (by default `myuax.com` and `unimentor.edu`).

To stop everything: `Ctrl+C` in both terminals and `docker stop unimentor-pg`.

## Scripts (backend)

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API with nodemon (restarts on file changes) |
| `npm start` | Starts the API with node (production) |
| `npm run db:migrate` | Applies the pending SQL migrations in `src/database/migrations/` |
| `npm run db:seed` | Empties the tables and loads the test data (`src/database/seeds.sql`) |
| `npm run lint` | Runs ESLint |
| `npm test` | Runs the Jest test suite |
| `npm run test:coverage` | Tests + coverage report (CI requires >= 70 % lines, NFR-04) |

## Deployment

- **Backend + database (Render):** New > Blueprint > this repository (`render.yaml`). Then set `FRONTEND_ORIGIN` to the Vercel URL (and, if needed, `ALLOWED_EMAIL_DOMAINS`). Create the tables by running `npm run db:migrate` from your machine with `DATABASE_URL` set to the database's *External Database URL* and `DB_SSL=true` (repeat it after every merge that adds a migration).
- **Frontend (Vercel):** import the repository and set **Root Directory** to `frontend` (framework preset: Other, no build command). Then set the Render URL in `frontend/js/config.js`.

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
