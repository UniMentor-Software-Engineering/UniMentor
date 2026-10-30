# P3: Autenticación y administración. Guía de lo que falta

> **✅ Hecho y fusionado en `main` (PR #8, 30 oct).** Todos los apartados de esta guía están implementados; el estado actual está en `ESTADO-DEL-PROYECTO.md`. Se deja la guía como referencia de los criterios.

*Revisión del 22 de octubre de 2026, actualizada el 30 de octubre (semana 8). Se refiere a estos archivos, que ya están en `main` (commit `f867fc2`). La carpeta `P3_Autenticacion_y_Admin` que se compartió tiene exactamente los mismos archivos, así que no aporta nada nuevo: hay que partir de lo que hay en el repo.*

- *`backend/src/middlewares/auth.middleware.js`*
- *`backend/src/middlewares/security.middleware.js`*
- *`backend/src/middlewares/audit.middleware.js`*
- *`backend/src/routes/admin.routes.js`*
- *`docs/phase3/design_patterns_chain_of_responsibility_p3.md`*

Este documento recoge lo que falta o hay que corregir en la parte de P3 para que cumpla lo acordado en el reparto (`ESTADO-DEL-PROYECTO.md`) y en la Fase 1 (`docs/phase1/`). Está ordenado por prioridad. **El patrón se presenta en la semana 9**, y el documento tiene que enseñar código real que funcione, así que conviene tener hechos los apartados 1 a 4 antes de esa fecha.

> **Novedades desde el 22 de octubre**
>
> - **El esquema de P2 ya está en `main`** (PR #6). Todo lo que necesita P3 existe en la BD: `users.status` (`ACTIVE`/`SUSPENDED`), `failed_login_count`, `locked_until` y la tabla `audit_logs` de solo inserción. Ya no hay que partir de otra rama.
> - La tabla `users` guarda el nombre en **`first_name` y `last_name`** (no hay `full_name`). Los apartados 2 y 3 ya están adaptados.
> - **Hay cuentas de prueba** al ejecutar `npm run db:seed`. La contraseña de todas es `Password123!`: `admin@unimentor.edu` (ADMIN), `laura.garcia@unimentor.edu` y `carlos.martin@unimentor.edu` (TUTOR) y `diego.student@unimentor.edu` (STUDENT). Sirven para probar el login y la suspensión sin registrar a nadie.
> - El error de lint de `auth.middleware.js` ya está corregido y el CI está en verde. Aun así, los archivos de P3 tienen un **0 % de cobertura** y bajan la media del proyecto, así que cada PR de P3 tiene que traer sus tests (apartado 8).
> - P2 protege `PUT /api/tutors/profile` con un `ensureAuth` **provisional** que siempre responde 401. Cuando `verifyJWT` funcione, hay que sustituirlo (apartado 7).

---

## Resumen

| Entregable | Estado |
|---|---|
| CU-01 Registro | ❌ No existe |
| CU-02 Login | ❌ No existe: no hay endpoint, ni bcrypt, ni emisión del JWT, ni cookie |
| Bloqueo tras 5 intentos | ❌ Mal planteado: `express-rate-limit` no está instalado (la app se rompe al cargarlo), limita por IP y guarda los datos en memoria |
| Middleware de JWT | ⚠️ Empezado, pero lee la cabecera `Authorization` en vez de la cookie (contradice el ADR 4) y no comprueba si la cuenta está suspendida |
| Middleware de roles | ⚠️ Empezado, con un bug: `'admin'` en minúsculas y el ENUM es `'ADMIN'` |
| CSRF | ❌ No existe (el documento dice que sí) |
| Logs de auditoría | ❌ Solo `console.log`: no escribe en `audit_logs` |
| CU-13 Suspender cuentas | ❌ Controlador simulado |
| CU-14 Métricas y auditoría | ❌ No existe |
| Tests | ❌ Ninguno |
| Lint / CI | ✅ Pasa (corregido el 22 oct) · ❌ los archivos de P3 tienen un 0 % de cobertura |
| Frontend (login, registro, panel de admin) | ❌ No existe |
| Documento (Chain of Responsibility) | ⚠️ Media página de 2, con un error de concepto y en una carpeta equivocada |
| Rama + PR + revisión | ⚠️ El borrador se subió directamente a `main`. Lo que queda, con una rama y un PR por caso de uso |

Lo que está bien: la idea de la cadena de middlewares `verifyJWT → requireRole → … → controlador` es justo lo que pide el patrón, y `requireRole(...roles)` como función que devuelve un middleware es una buena forma de reutilizarlo.

### Cómo se ha comprobado

- `npx eslint src/middlewares src/routes`: 1 error el 22 oct (ya corregido).
- `node -e "require('./src/middlewares/security.middleware')"`: `Error: Cannot find module 'express-rate-limit'`.
- `grep` de `admin.routes` y `auth.middleware` en `src/` y `tests/`: no se usan en ningún sitio, así que nada de esto está conectado a la app.
- Se ha comparado con los CU-01, 02, 13 y 14 y el NFR-02 de `02-requirements.pdf`, con los diagramas de secuencia B (login) y D (suspensión) y el ADR 4 de `03-architecture.pdf`, y con el esquema de P2 (migraciones `001`–`003` de `backend/src/database/migrations/`).

---

## 0. Antes de empezar

- [ ] **Preparar la BD local con el esquema de P2**, que ya está en `main`:

  ```bash
  git checkout main && git pull
  cd backend
  npm install
  npm run db:migrate   # crea o actualiza las tablas
  npm run db:seed      # cuentas de prueba (contraseña Password123!)
  ```

  Para ver las columnas exactas, mirar `backend/src/database/migrations/001_initial_schema.sql` o la sección 4.2 de `docs/phase2/04-implementation-details.md`.
- [ ] Crear una rama por caso de uso (`feature/cu-01-register`, `feature/cu-02-login`, `feature/cu-13-suspend`, `feature/cu-14-metrics`), cada una con su PR revisado por otra persona.
- [ ] Seguir las capas del proyecto, como el módulo de salud: `routes → controllers → services → repositories`. El SQL va solo en los repositories y las reglas de negocio en los services.
- [ ] Nombrar los archivos como el resto del proyecto: `adminRoutes.js`, `authRoutes.js`, `authController.js`, `authService.js`, `userRepository.js`… (no `admin.routes.js`).
- [ ] Leer la configuración de `src/config/env.js` (`config.jwtSecret`), nunca de `process.env` directamente. Ahora `auth.middleware.js` tiene otra clave por defecto (`'secret_de_desarrollo'`) distinta de la de `env.js`.
- [ ] Lanzar los errores con `throw new AppError(status, message, code)` para que salgan en el formato que espera `frontend/js/api.js` (`{ "error": { "status", "message", "code" } }`). Ahora los middlewares responden `{ error: '...' }`, que el frontend no sabe leer.
- [ ] Escribir los comentarios y los mensajes en inglés, con los textos exactos de la Fase 1 (por ejemplo, *"Invalid email or password."*).

---

## 1. Middlewares de la cadena (la base del patrón)

### Autenticación (`verifyJWT`)

- [ ] **Leer el token de la cookie, no de la cabecera.** El ADR 4 descartó expresamente guardar el JWT en `localStorage` y mandarlo en `Authorization: Bearer`: el token va en una cookie `HttpOnly` y el navegador lo envía solo (`api.js` ya usa `credentials: 'include'`).

  ```js
  const token = req.cookies.token;
  if (!token) throw new AppError(401, 'Authentication required.', 'UNAUTHENTICATED');
  const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  ```

- [ ] Si `jwt.verify` falla por token caducado o firma no válida, responder 401 (CU-11 A1). Usar el error en el `catch` para que el linter no falle.
- [ ] **Comprobar en la BD, en cada petición, que la cuenta existe y no está suspendida.** Es la regla de negocio de CU-13: *"Suspended accounts are rejected on every authenticated request because the server checks the account status in the database, which invalidates any JWT already issued."* Leer también el rol de la BD, no del token, para que un cambio de rol tenga efecto en el momento.

  ```sql
  SELECT id, role, status FROM users WHERE id = $1
  ```

  Si no existe, responder 401; si está `SUSPENDED`, 403. Guardar en `req.user` solo `{ id, role }`.

### Roles (`requireRole`)

- [ ] Usar los valores del ENUM de la BD: `requireRole('ADMIN')`, `requireRole('TUTOR')`. Con `'admin'` en minúsculas siempre responde 403.
- [ ] Si falta `req.user`, responder 401 (no autenticado), no 403.

### CSRF

- [ ] Crear el middleware que el documento ya da por hecho. Como `api.js` ya manda `X-Requested-With: XMLHttpRequest` en todas las peticiones, y CORS solo acepta los orígenes de `config.frontendOrigins`, basta con exigir esa cabecera en los métodos que cambian datos (es la opción "custom header" del ADR 4):

  ```js
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

  function csrfProtection(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
      throw new AppError(403, 'Missing CSRF header.', 'CSRF');
    }
    next();
  }
  ```

- [ ] Montarlo para toda la API (en `app.js`, antes de `app.use('/api', apiRoutes)`), no ruta a ruta, para que ninguna se quede sin él. El login también tiene que pasar por él (*login CSRF*).

### Cookie de sesión (NFR-02, ADR 4)

- [ ] Emitir la cookie con los atributos de la Fase 1 (`HttpOnly`, `Secure`, `SameSite=None`), porque el frontend (Vercel) y la API (Render) están en sitios distintos. En local, por HTTP, `Secure` no funciona, así que hay que depender de `config.isProduction`:

  ```js
  res.cookie('token', token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    maxAge: 2 * 60 * 60 * 1000, // igual que el expiresIn del JWT
  });
  ```

- [ ] Poner caducidad al JWT (`expiresIn`, por ejemplo `'2h'`), con solo `sub` (el id) y `role` en el payload.

---

## 2. CU-01: Registro (`POST /api/auth/register`)

- [ ] Instalar **`bcryptjs`** (JavaScript puro: no necesita compilar nada en Windows ni en Render) y hashear con un coste de 10 o más (NFR-02), por ejemplo 12.
- [ ] Validar los datos (paso 4):
  - `firstName` y `lastName` obligatorios y con una longitud máxima de 100 caracteres (las columnas `first_name` y `last_name` son `VARCHAR(100)`).
  - `email` con formato válido, pasado a minúsculas y **de un dominio universitario autorizado** (precondición 2). Poner los dominios en una variable de entorno (`ALLOWED_EMAIL_DOMAINS=myuax.com,…`), añadirla a `env.js` y a `.env.example`. En local, incluir también `unimentor.edu`, el dominio de las cuentas de prueba.
  - Contraseña de al menos 8 caracteres, con letras y dígitos: `/^(?=.*[A-Za-z])(?=.*\d).{8,72}$/`. bcrypt ignora lo que pase de 72 bytes. Si no cumple, responder 400 indicando qué falta (A2).
  - **`role` solo puede ser `STUDENT` o `TUTOR`.** Si se acepta lo que llegue, cualquiera se puede registrar como `ADMIN`.
- [ ] Email duplicado: responder 409 *"This email address is already in use."* (A1). Además de comprobarlo antes, capturar el error `23505` (violación de `UNIQUE`) del `INSERT`, porque dos registros a la vez pueden pasar los dos la comprobación.
- [ ] Responder 201 con el usuario creado, **sin** `password_hash`.
- [ ] Email de bienvenida (paso 8): llamarlo a través del `NotificationService` de P5 después de guardar el usuario. Si el envío falla, el registro no debe fallar. Mientras P5 no lo tenga, dejar la llamada preparada y acordar la interfaz con P5.

---

## 3. CU-02: Login (`POST /api/auth/login`)

Seguir el diagrama de secuencia B de `03-architecture.pdf`, en este orden:

- [ ] Buscar al usuario por email (en minúsculas). Si no existe, responder 401 *"Invalid email or password."* (A1), con el mismo mensaje que cuando falla la contraseña, para no revelar qué emails están registrados.
- [ ] Si `status = 'SUSPENDED'`, responder 403 *"Your account has been suspended. Please contact administration."* (A2).
- [ ] Si `locked_until > now()`, responder 429 *"Too many failed attempts. Try again in 15 minutes."* (A3).
- [ ] Comparar con `bcrypt.compare`. Si falla, sumar el intento y, al llegar a 5, bloquear 15 minutos. Hacerlo **en una sola sentencia** para que dos intentos simultáneos no se pisen (en el `SET` de PostgreSQL todas las columnas se leen con su valor anterior):

  ```sql
  UPDATE users
     SET failed_login_count = CASE WHEN failed_login_count + 1 >= 5 THEN 0
                                   ELSE failed_login_count + 1 END,
         locked_until       = CASE WHEN failed_login_count + 1 >= 5 THEN now() + interval '15 minutes'
                                   ELSE locked_until END
   WHERE id = $1
  RETURNING locked_until
  ```

  Al bloquear se reinicia el contador, para que cuando pasen los 15 minutos el usuario vuelva a tener 5 intentos.
- [ ] Si la contraseña es correcta: `UPDATE users SET failed_login_count = 0, locked_until = NULL`, generar el JWT, ponerlo en la cookie (apartado 1) y responder 200 con `{ id, firstName, lastName, role }`. El frontend no puede leer la cookie (`HttpOnly`), así que necesita esos datos en la respuesta para saber a qué panel llevar al usuario (paso 6).
- [ ] **Borrar `security.middleware.js` (`loginLimiter`)**. No cumple el requisito: `express-rate-limit` no está instalado; cuenta todas las peticiones, no solo los fallos (un usuario que acierta también gasta intentos); va por IP y no por cuenta (en una universidad muchos alumnos comparten IP); y guarda los contadores en memoria, que se pierden cada vez que Render reinicia el servicio. Si además se quiere un límite general por IP contra ataques de fuerza bruta, que sea un extra con un límite alto, no la implementación del CU-02.
- [ ] Crear también `POST /api/auth/logout` (borra la cookie con `res.clearCookie` y los mismos atributos) y `GET /api/auth/me` (devuelve el usuario de `req.user`, para que el frontend sepa al recargar si hay sesión).

---

## 4. CU-13: Suspender cuentas (`POST /api/admin/users/:id/suspend`)

- [ ] Usar la ruta del diagrama de secuencia D, con el id en la URL (`req.params.id`), no en el body. Validar que es un UUID y, si no, responder 400.
- [ ] Proteger todo el router de admin con la cadena: `router.use(verifyJWT, requireRole('ADMIN'))`. Un estudiante o tutor recibe 403 (A1).
- [ ] Pedir un `reason` obligatorio y con una longitud máxima (paso 3).
- [ ] Si el admin intenta suspenderse a sí mismo (`req.params.id === req.user.id`), responder 400 (regla de negocio). Si la cuenta no existe, 404; si ya está suspendida, 409.
- [ ] Hacerlo todo **dentro de `db.withTransaction`** (paso 5):

  ```sql
  SELECT id, role, status FROM users WHERE id = $1 FOR UPDATE;

  UPDATE users SET status = 'SUSPENDED' WHERE id = $1;

  UPDATE appointments
     SET status = 'CANCELLED', cancelled_by = $2, cancelled_at = now()
   WHERE (student_id = $1 OR tutor_id = $1)
     AND status = 'CONFIRMED'
     AND lower(time_range) > now()
  RETURNING id, slot_id, student_id, tutor_id;

  -- Liberar los slots de esas citas: AVAILABLE si el suspendido es el estudiante,
  -- bloqueado si es el tutor.
  UPDATE availability_slots
     SET status = CASE WHEN tutor_id = $1 THEN 'UNAVAILABLE' ELSE 'AVAILABLE' END
   WHERE id = ANY($3);

  INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
  VALUES ($2, 'USER_SUSPENDED', 'USER', $1, $4);  -- details: { reason, cancelledAppointments }
  ```

- [ ] Si se suspende a un tutor, bloquear también sus slots futuros que sigan libres (`AVAILABLE`), para que nadie pueda reservar con él. Avisar a P4 de que, al reservar, compruebe que el tutor está activo.
- [ ] **Nombre del estado del slot:** el ENUM `slot_status` del esquema usa `UNAVAILABLE` (la Fase 1 decía `BLOCKED`). Usar `UNAVAILABLE` en el código y en el documento.
- [ ] Después del `COMMIT`, avisar por email a la otra parte de cada cita cancelada, con el `NotificationService` de P5 (igual que en CU-09).
- [ ] Responder 200 con el usuario actualizado para que el panel cambie el estado al momento (paso 6).
- [ ] Crear `GET /api/admin/users` (paso 1): el listado de usuarios para el panel, con búsqueda por nombre o email, filtro por rol y estado y paginación (`limit` de 1 a 50, `offset` de 0 o más). Sin `password_hash`.
- [ ] Opcional: `POST /api/admin/users/:id/reactivate`, también registrado en `audit_logs`.

---

## 5. CU-14: Métricas y auditoría

- [ ] `GET /api/admin/metrics` (pasos 2 y 3): una o varias consultas de agregación sobre `users`, `availability_slots` y `appointments`. Por ejemplo:

  ```sql
  SELECT count(*) FILTER (WHERE status = 'COMPLETED')                        AS completed_sessions,
         count(*) FILTER (WHERE status = 'CANCELLED')                        AS cancelled_sessions,
         count(*) FILTER (WHERE is_late_cancellation)                        AS late_cancellations,
         round(count(*) FILTER (WHERE status = 'CANCELLED')::numeric
               / NULLIF(count(*), 0), 3)                                     AS cancellation_rate
    FROM appointments;
  ```

  Más los usuarios por rol, los tutores activos y la capacidad libre de los tutores (slots `AVAILABLE` futuros).
- [ ] `GET /api/admin/audit-logs`: los registros de auditoría, del más reciente al más antiguo, con el email del autor (`LEFT JOIN users`), paginados y con filtro opcional por `action`.
- [ ] La API **no puede tener** ningún endpoint para modificar o borrar logs (regla de negocio: *append-only*). La tabla de P2 ya lo impide con un trigger; mencionarlo en el documento.

---

## 6. Logs de auditoría

- [ ] Escribir de verdad en `audit_logs`, con las columnas del esquema de P2: `actor_id`, `action`, `target_type`, `target_id`, `details JSONB`. Ahora el `INSERT` está comentado y además usa columnas que no existen (`user_id`, `ip_address`). La IP puede ir dentro de `details`.
- [ ] No usar `'Anónimo'` como `actor_id`: la columna es un UUID. Si no hay usuario, `NULL`.
- [ ] **Registrar las acciones críticas desde el service, dentro de la misma transacción** que la propia acción (como en el apartado 4). Así nunca queda una suspensión sin su log, ni un log de una suspensión que falló.
- [ ] Si se quiere mantener `auditLog` como eslabón de la cadena (queda bien para explicar el patrón), que registre el resultado y no el intento: escribir en `res.on('finish', …)` con el código de estado final y no bloquear la respuesta si el `INSERT` falla.
- [ ] Decidir qué más se registra. Como mínimo: `USER_SUSPENDED`. Recomendable: `USER_REGISTERED`, `LOGIN_FAILED` y `ACCOUNT_LOCKED`.
- [ ] Quitar el `console.log` con datos de usuario y el `try/catch` que no hace nada.

---

## 7. Montaje en la app

- [ ] En `src/routes/index.js`, montar `router.use('/auth', authRoutes)` y `router.use('/admin', adminRoutes)` en el sitio donde ya están comentados.
- [ ] Borrar el controlador simulado `banUser` de `admin.routes.js`.
- [ ] Avisar a P2 (CU-03), P4 y P5 de que ya pueden proteger sus rutas con `verifyJWT` y `requireRole('TUTOR')` o `requireRole('STUDENT')`.
- [ ] **Sustituir el `ensureAuth` provisional de `backend/src/routes/tutorRoutes.js`** por la cadena real: `router.put('/profile', verifyJWT, requireRole('TUTOR'), tutorController.updateProfile)`. Después, borrar `ensureAuth` y comprobar que el test de integración `PUT /api/tutors/profile` sin cookie sigue dando 401.

---

## 8. Tests (NFR-04)

Seguir el patrón de `tests/health.test.js`, con `jest.mock('../src/config/db')`, para que no haga falta PostgreSQL. Jest cuenta en la cobertura todos los archivos de `src/`, así que código sin tests la hace bajar y el CI se pone en rojo por debajo del 70 %.

- [ ] **Middlewares:**
  - sin cookie → 401;
  - token mal firmado o caducado → 401;
  - cuenta suspendida → 403;
  - rol incorrecto → 403;
  - POST sin `X-Requested-With` → 403;
  - GET sin la cabecera → pasa.
- [ ] **Registro:**
  - correcto → 201, sin `password_hash` en la respuesta;
  - email duplicado → 409;
  - contraseña débil → 400;
  - dominio no permitido → 400;
  - `role: 'ADMIN'` → 400.
- [ ] **Login:**
  - correcto → 200, con una cookie `HttpOnly` (y en producción `Secure; SameSite=None`);
  - contraseña mal → 401;
  - cuenta suspendida → 403;
  - cuenta bloqueada → 429;
  - el 5.º fallo bloquea la cuenta.

  El NFR-02 pide comprobar los atributos de la cookie, así que hay que hacerlo en el test leyendo `res.headers['set-cookie']`.
- [ ] **Suspensión:**
  - un estudiante → 403;
  - suspenderse a sí mismo → 400;
  - usuario inexistente → 404;
  - correcta → 200, y se usa `withTransaction`.
- [ ] **Métricas y auditoría:** formato de la respuesta y acceso denegado a quien no es admin.

---

## 9. Frontend

Siempre con `import { api } from './api.js'`, sin `fetch` directo, y con los estilos de `css/base.css`.

- [ ] `register.html`: formulario de CU-01 que marca los errores de cada campo y muestra un aviso de éxito antes de pasar al login (paso 9).
- [ ] `login.html`: al entrar, redirige al panel según el `role` de la respuesta (paso 6) y muestra los mensajes de 401, 403 y 429.
- [ ] `admin.html`: listado de usuarios con su estado y el botón "Suspend Account", que pide el motivo y una confirmación (CU-13), y la vista "System Metrics & Auditing" con las métricas y la tabla de logs (CU-14). Mostrar los textos de los usuarios con `textContent`, nunca con `innerHTML` (XSS, NFR-02).

---

## 10. Documento: patrón Chain of Responsibility (semana 9, unas 2 páginas)

- [ ] **Moverlo al documento común.** Va como sección de `docs/phase2/04-implementation-details.md`, no en `docs/phase3/` (la Fase 3 es otra entrega). Por ejemplo, *4.3 Design Patterns → 4.3.1 Chain of Responsibility*, de acuerdo con P4 (Repository) y P5 (Adapter/Strategy) para que la numeración sea la misma. Después, borrar `docs/phase3/`.
- [ ] **Corregir el tipo de patrón.** Chain of Responsibility es un patrón **de comportamiento** (*behavioral*), no estructural.
- [ ] **Usar el código real.** Ahora el ejemplo del documento (`/admin/ban` con `csrfProtection`), el del código (`/users/ban` sin CSRF) y la ruta de la Fase 1 (`/api/admin/users/:id/suspend`) no coinciden. Copiar la cadena tal como quede en `adminRoutes.js` y en `app.js`.
- [ ] Explicar qué papel del patrón GoF hace cada pieza:
  - **Handler:** la firma común `(req, res, next)`;
  - **ConcreteHandlers:** `csrfProtection`, `verifyJWT`, `requireRole`, `auditLog`;
  - **"pasar al siguiente":** llamar a `next()`;
  - **cortar la cadena:** lanzar un `AppError`, que salta hasta `errorHandler` (el último eslabón, de P1);
  - **Client:** el router de Express, que monta la cadena.
- [ ] Explicar **por qué importa el orden**: sin `verifyJWT` delante, `requireRole` no tiene `req.user`; el CSRF va antes de todo, para rechazar cuanto antes y sin consultar la BD.
- [ ] Añadir un diagrama de la cadena: petición → eslabones → controlador, con las salidas 401, 403 y 429 hacia `errorHandler`.
- [ ] Añadir los **inconvenientes**:
  - el orden depende de quien monta la ruta;
  - un middleware que se olvida de llamar a `next()` deja la petición colgada;
  - es más difícil seguir el flujo al depurar;
  - `verifyJWT` hace una consulta a la BD en cada petición (el precio de poder invalidar los JWT de las cuentas suspendidas, CU-13).
- [ ] Relacionarlo con el ADR 4 (cookie y CSRF), el NFR-02 y CU-13 (estado comprobado en cada petición).
- [ ] Quitar la frase de que el *rate limiting* "se podría añadir en el futuro". Explicar en su lugar el bloqueo por cuenta del CU-02 y por qué va en el service y no como middleware: necesita saber si la contraseña era correcta.
- [ ] Llegar a unas 2 páginas y volver a generar el PDF (`cd docs/build && npm run pdf -- ../phase2/04-implementation-details.md`).

---

## 11. Forma de trabajar

- [ ] Una rama y un PR por caso de uso (apartado 0), revisado por otra persona antes de fusionar a `main`, y con el CI en verde (`npm run lint && npm test`), como dice la sección 5 de `ESTADO-DEL-PROYECTO.md`.
