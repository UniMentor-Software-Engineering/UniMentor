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
npm run dev               # http://localhost:3000/api/health
```

Frontend: serve the `frontend/` folder with any static server on port 5500 (e.g. the VS Code "Live Server" extension, or `npx serve frontend -l 5500`) and open `http://localhost:5500`. The status card shows whether the API and the database are reachable.

## Scripts (backend)

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API with nodemon (restarts on file changes) |
| `npm start` | Starts the API with node (production) |
| `npm run lint` | Runs ESLint |
| `npm test` | Runs the Jest test suite |
| `npm run test:coverage` | Tests + coverage report (CI requires >= 70 % lines, NFR-04) |

## Deployment

- **Backend + database (Render):** New > Blueprint > this repository (`render.yaml`). Then set `FRONTEND_ORIGIN` to the Vercel URL.
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
