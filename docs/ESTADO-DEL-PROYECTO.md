# Estado del proyecto UniMentor

*Última actualización: 30 de octubre de 2026 (semana 8)*

Este documento resume en qué punto está el proyecto, qué falta y cómo ponerse a trabajar. Si eres del equipo, léelo antes de crear tu rama.

---

## 1. Fechas de la Fase 2

La Fase 2 ("4. Implementation Details", unas 15 páginas) abrió el **lunes 12 de octubre (semana 6)** y cierra el **viernes 20 de noviembre a las 23:59**.

| Semana | Hay que enseñar | Responsable |
|---|---|---|
| **7 (esta semana, 19–23 oct)** | Project Structure | P1 |
| **7** | Esquema de BD hecho (se presenta en la 11, pero todos dependen de él) | P2 |
| 9 | Los 3 patrones de diseño (problema, solución y beneficios) | P3, P4, P5 |
| 11 | Database Schema: normalización (1FN, 2FN, 3FN) y tipos de datos | P2 |

## 2. Reparto del trabajo

| Persona | Código (casos de uso) | Parte del documento | Págs. |
|---|---|---|---|
| **P1: Estructura e integración** | Esqueleto del repo, `package.json`, ESLint, Jest, GitHub Actions, conexión a BD, middleware de errores, `api.js`, CSS base, despliegue en Vercel + Render | 4.1 Project Structure + maquetación final | ~5 |
| **P2: Base de datos y búsqueda** | `schema.sql`, migraciones, datos de prueba, CU-03 (perfil del tutor), CU-06 (buscar tutores) | Database Schema | ~4 |
| **P3: Autenticación y admin** | CU-01, CU-02, CU-13, CU-14, middleware de JWT y roles, CSRF, bloqueo tras 5 intentos, logs de auditoría | Patrón Chain of Responsibility | ~2 |
| **P4: Reservas** | CU-04, CU-05, CU-07, CU-08, CU-09, slots, reserva con transacción y `FOR UPDATE`, cancelación, test de concurrencia (G2) | Patrón Repository | ~2 |
| **P5: Notificaciones e historial** | CU-10 (cron de recordatorios), SendGrid detrás de una interfaz propia, CU-11 (dashboard), CU-12 (notas y valoración) | Patrón Adapter/Strategy (`NotificationService`, ADR 6) | ~2 |

Para P2, el esquema debería usar `UUID`, `TIMESTAMPTZ`, `ENUM` para los estados y el tipo de sesión, la tabla intermedia `tutor_subjects` y una restricción `EXCLUDE` sobre rangos de tiempo, que hace cumplir BR-CONF-05 directamente en la base de datos.

P4 tiene la parte más difícil. Quien acabe antes, que le ayude con el frontend del calendario (FullCalendar).

---

## Resumen de avance (30 oct)

> **Fusionados en `main` el 30 oct, sin revisión de un compañero:** #8 (P3), #9 (P1) y #10 (P2). Conviene que cada uno revise después el PR de su parte en GitHub y deje un comentario. **Después de `git pull`, ejecutar `npm install` y `npm run db:migrate` en `backend/`** (nuevas dependencias `bcryptjs` y `helmet`, y la migración 004).

Estimación por partes: código (backend y tests), frontend, sección del documento y revisión y despliegue.

| Parte | Backend + tests | Frontend | Documento | Revisión / despliegue | **Avance** |
|---|---|---|---|---|---|
| P1 Estructura e integración | ✅ (+ cabeceras de seguridad y CSP, PR #9) | ✅ (`api.js`, CSS) | ✅ 4.1 | ❌ despliegue en Render/Vercel, revisión del PR #4 | **~85 %** |
| P2 BD y búsqueda | ✅ (+ `unaccent`, PR #10) | ✅ búsqueda y perfil (PR #10) | ✅ 4.2 | ✅ PR #6 y #10 en `main` | **~95 %** |
| P3 Autenticación y admin | ✅ | ✅ | ✅ 4.3.1 | ✅ PR #8 en `main` (falta la revisión de un compañero) | **~95 %** |
| P4 Reservas | ❌ | ❌ | ❌ 4.3.2 | ❌ | **0 %** |
| P5 Notificaciones e historial | ❌ | ❌ | ❌ 4.3.3 | ❌ | **0 %** |
| **Proyecto** | | | | | **~55 %** |

---

## 3. Estado de P1: hecho

Fusionado en `main` con el **PR #4** (rama `feature/p1-skeleton`). El CI pasó en verde.

**Backend** (`backend/`):
- Estructura por capas: `routes → controllers → services → repositories`, más `middlewares/`, `config/` y `utils/`.
- `src/config/db.js`: pool de PostgreSQL con `query()` y `withTransaction()`.
- Middleware de errores centralizado: todos los errores salen en el mismo formato JSON.
- CORS con credenciales y `cookie-parser`, preparados para el JWT en cookie HttpOnly (ADR 4).
- ESLint, Jest + Supertest (10 tests, ~95 % de cobertura; el mínimo es 70 %, NFR-04).
- Endpoint de salud `/api/health` y `/api/health/db`. **Es la plantilla que tenéis que copiar** para vuestros casos de uso.

**Frontend** (`frontend/`):
- `js/api.js`: el único sitio donde se llama a `fetch()`. Ya incluye `credentials: 'include'`, las cabeceras y la gestión de errores.
- `css/base.css`: variables de color, tipografía, botones, formularios, tarjetas, badges y toasts.
- `index.html`: página de estado que indica si la API y la BD responden.

**Infraestructura**:
- `.github/workflows/ci.yml`: en cada PR y en cada push a `main` ejecuta lint, tests con cobertura y `npm audit`.
- `render.yaml`: configuración de Render para la API y PostgreSQL.

**Documentación**:
- `docs/phase2/04-implementation-details.md` y su `.pdf`: la sección 4.1 Project Structure (5 páginas, con el mismo estilo que los PDFs de la Fase 1).
- `docs/build/`: herramienta para generar los PDFs con ese estilo.

Se ha probado de punta a punta con un PostgreSQL real: navegador → `api.js` → Express → PostgreSQL funciona.

---

## 4. Lo que falta

### P1 (urgente, antes de presentar esta semana)

- [ ] **Desplegar el backend y la BD en Render.** En Render: New → Blueprint → seleccionar este repo (usa `render.yaml`).
- [ ] **Desplegar el frontend en Vercel.** Importar el repo con *Root Directory* = `frontend`, sin comando de build. ⚠️ El nombre `unimentor.vercel.app` **ya lo usa otra persona**, así que hay que elegir otro.
- [ ] En Render, poner la variable `FRONTEND_ORIGIN` con la URL real de Vercel.
- [ ] En `frontend/js/config.js`, cambiar `PRODUCTION_API_URL` por la URL real de Render (ahora hay una provisional).
- [ ] Abrir la URL de Vercel y comprobar que la página muestra "API: online" y "Database: online".
- [ ] **Revisión del PR #4 por un compañero.** Se fusionó sin revisión. Basta con que alguien lo revise y deje un comentario.
- [ ] Activar la protección de `main` en GitHub (Settings → Branches → "Require a pull request review before merging").

> El documento 4.1 ya describe el despliegue como funcionando, así que tiene que estar hecho antes de enseñarlo.

- [x] Cabeceras de seguridad (NFR-02): `helmet` en la API y Content-Security-Policy de las páginas en `frontend/vercel.json` (PR #9).
- [x] El CI se ejecuta en todos los PR, también en los que van encima de otra rama (PR #9).

### P1 (más adelante)

- [ ] Maquetación final del documento completo cuando P2–P5 entreguen sus secciones.

### P2: fusionado en `main` (PR #6, 30 oct)

> Las correcciones de [`REVISION-P2.md`](REVISION-P2.md) están hechas en la rama `fix/p2-schema-review` y probadas con un PostgreSQL real (30 oct): migraciones 001–003 (incluido `session_type`), seed funcionando con la contraseña `Password123!`, CU-03, CU-06, `GET /api/subjects`, 35 tests y la sección 4.2 del documento.

- [x] Migraciones (`npm run db:migrate`) y datos de prueba (`npm run db:seed`).
- [x] CU-03 y CU-06 (backend).
- [x] Sección 4.2 Database Schema.
- [x] PR #6 fusionado en `main`. **Cada uno tiene que ejecutar `npm run db:migrate`** (y `npm run db:seed` si quiere datos de prueba) en su BD local.
- [x] Sustituir el `ensureAuth` provisional de `tutorRoutes.js` por `verifyJWT` + `requireRole('TUTOR')` (PR #8).
- [x] Búsqueda sin distinguir acentos (migración `004_add_unaccent.sql`, PR #10). **Hay que ejecutar `npm run db:migrate`.**
- [x] Frontend: `tutors.html` (CU-06, Find Tutors) y `profile.html` (CU-03, My Profile), con el nuevo `GET /api/tutors/profile` (PR #10).
- [x] `PUT /api/tutors/profile` ya no da 500 con el body vacío, IDs de asignatura que no son UUID o asignaturas repetidas (PR #10).

### P3: fusionado en `main` (PR #8, 30 oct)

> Todo lo de [`REVISION-P3.md`](REVISION-P3.md) está hecho y probado con un PostgreSQL real y en el navegador. Se ha partido del borrador del compañero (`UniMentor_P3_English_Fix`), aprovechando sus middlewares y la lógica del login, y corrigiendo lo que no funcionaba.

- [x] Middlewares de la cadena: `csrfProtection` (para toda la API, en `app.js`), `verifyJWT` (cookie HttpOnly + estado de la cuenta en la BD en cada petición) y `requireRole(...)`.
- [x] CU-01 (`POST /api/auth/register`), CU-02 (`POST /api/auth/login`, bloqueo de 15 min tras 5 fallos), `POST /api/auth/logout` y `GET /api/auth/me`.
- [x] CU-13 (`POST /api/admin/users/:id/suspend` en una transacción, `.../reactivate`, `GET /api/admin/users`) y CU-14 (`GET /api/admin/metrics`, `GET /api/admin/audit-logs`).
- [x] Logs de auditoría en `audit_logs`: `USER_REGISTERED`, `ACCOUNT_LOCKED`, `USER_SUSPENDED`, `USER_REACTIVATED`.
- [x] Frontend: `login.html`, `register.html` y `admin.html`.
- [x] Tests: 139 en total, cobertura del 98,6 %.
- [x] Sección 4.3.1 Chain of Responsibility en `04-implementation-details.md` (y el PDF regenerado). Se ha borrado `docs/phase3/`.
- [x] Fusionado en `main` (PR #8).
- [ ] Revisión del PR #8 por un compañero (se fusionó sin ella).
- [ ] Cuando P5 tenga el `NotificationService`: email de bienvenida (CU-01, paso 8) y aviso a la otra parte de las citas canceladas por una suspensión (CU-13). Los sitios están marcados en `authService.js` y `adminService.js`.
- [ ] Cuando P5 tenga el dashboard (CU-11), cambiar a dónde van estudiantes y tutores después del login (`HOME_BY_ROLE` en `frontend/js/session.js`).

**Para P2, P4 y P5:** para proteger una ruta, `router.post('/...', verifyJWT, requireRole('STUDENT'), controller.accion)`. El usuario está en `req.user` (`{ id, role }`). Las peticiones que cambian datos necesitan la cabecera `X-Requested-With`, que `api.js` ya pone (en los tests con Supertest, `.set('X-Requested-With', 'XMLHttpRequest')`). P4: al reservar, comprobar que el tutor sigue `ACTIVE`.

### P4, P5

- [ ] Sus casos de uso y su patrón de diseño (para la semana 9).

---

## 5. Cómo empezar a trabajar

```bash
git checkout main
git pull
git checkout -b feature/cu-XX-nombre      # una rama por caso de uso

cd backend
cp .env.example .env                       # rellenar DATABASE_URL, etc.
npm install
npm run dev                                # http://localhost:3000/api/health
npm run lint && npm test                   # antes de cada PR
```

Para tener PostgreSQL en local sin instalarlo, con Docker:

```bash
docker run -d --name unimentor-pg -e POSTGRES_USER=unimentor -e POSTGRES_PASSWORD=unimentor -e POSTGRES_DB=unimentor -p 5432:5432 postgres:17-alpine
```

En Windows (PowerShell), `cp` es `Copy-Item`. Los pasos completos para Windows, frontend incluido, están en el `README.md` (sección *Run locally > Windows*).

**Para añadir un caso de uso**, copiad el patrón del módulo de salud:

1. `src/repositories/xxxRepository.js`: SQL con parámetros (`$1, $2...`). Es el **único** sitio con SQL.
2. `src/services/xxxService.js`: reglas de negocio (BR-CONF-…). Si algo falla, `throw new AppError(409, 'mensaje')`.
3. `src/controllers/xxxController.js`: lee `req` y responde con `res.status(...).json(...)`. Sin SQL y sin reglas de negocio.
4. `src/routes/xxxRoutes.js`, y montarlo en `src/routes/index.js`.
5. Tests en `tests/`.

**Normas del equipo**:
- Cada capa solo llama a la de debajo. Un controller nunca hace SQL y un service nunca toca `req`/`res`.
- Las operaciones que tienen que ser atómicas (reservar, suspender una cuenta…) van dentro de `db.withTransaction(async (client) => { ... })`.
- En el frontend, siempre `import { api } from './api.js'`. Nunca `fetch` directo.
- Una rama y un PR por caso de uso. **Otra persona lo revisa** antes de fusionar y el CI tiene que estar en verde.
- **Los PDFs de `docs/phase1/` no se modifican.** Son la referencia: hay que respetar la numeración CU-01..14, BR-CONF-01..05, NFR-01..04 y ADR 1..7.

## 6. Documentar vuestra parte

Añadid vuestra sección en `docs/phase2/04-implementation-details.md` y generad el PDF:

```bash
cd docs/build
npm install
npm run pdf -- ../phase2/04-implementation-details.md
```

## 7. Referencias rápidas de la Fase 1

- **ADR 1** Node.js + Express · **ADR 2** PostgreSQL (`SELECT ... FOR UPDATE`) · **ADR 3** HTML/CSS/JS sin framework · **ADR 4** JWT en cookie HttpOnly (CORS con credenciales, `SameSite=None`, CSRF) · **ADR 5** FullCalendar · **ADR 6** SendGrid detrás de `NotificationService` · **ADR 7** Vercel + Render.
- **Reglas de negocio**: BR-CONF-01 (reservar con 2 h de antelación), 02 (cancelar sin penalización hasta 4 h antes), 03 (bloques de 60 min), 04 (máximo 3 reservas activas por estudiante), 05 (sin solapes, garantizado por la BD).
- **Tipos de sesión**: Quick Check (5 min), Standard (30 min), Deep Dive (60 min). Siempre ocupan un bloque completo de 60 min.
