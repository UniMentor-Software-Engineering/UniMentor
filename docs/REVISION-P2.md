# Revisión de P2: Base de datos y búsqueda

*Revisión del 21 de octubre de 2026 (semana 7), sobre los commits `6c98bea` (feat(p2)) y `6d765d7` (corrección del linter).*

Este documento recoge lo que falta o hay que corregir en la parte de P2 para que cumpla lo acordado en el reparto (`ESTADO-DEL-PROYECTO.md`) y en la Fase 1 (`docs/phase1/`). Está ordenado por prioridad: **la sección 1 bloquea a P3, P4 y P5**, así que conviene hacerla esta semana.

---

## Resumen

| Entregable | Estado |
|---|---|
| `schema.sql` | ⚠️ Hecho, con fallos y columnas que faltan |
| Migraciones | ❌ No hay. Nada ejecuta el `schema.sql` y falla si se lanza dos veces (`type "user_role" already exists`) |
| Datos de prueba | ⚠️ Hechos, pero los hashes de contraseña son falsos y no hay usuario ADMIN |
| CU-03 Perfil del tutor | ❌ Incompleto: no guarda asignaturas ni las valida |
| CU-06 Buscar tutores | ❌ No filtra: devuelve todos los tutores sin mirar asignatura ni texto |
| Tests | ❌ Ninguno. La cobertura ha bajado del ~95 % al 73,9 % (el mínimo del CI es 70 %) |
| Documento 4.2 | ⚠️ Empezado (~1,5 de 4 páginas), con errores |
| Rama + PR + revisión | ❌ Se subió directamente a `main` |

Lo que está bien: el esquema carga sin errores en PostgreSQL 17 y ya usa UUID, TIMESTAMPTZ, ENUM, la tabla `tutor_subjects` y la restricción `EXCLUDE`. La base es buena; hay que completarla.

### Cómo se ha comprobado

`schema.sql` y `seeds.sql` se cargaron en un PostgreSQL 17 en Docker y se probaron las restricciones con inserciones a mano:

- ✅ Dos slots solapados del mismo tutor: rechazado por `no_tutor_slot_overlap`.
- ❌ Dos citas en el mismo slot: **se acepta**.
- ❌ Una cita con otro tutor y otras fechas distintas a las de su slot: **se acepta**.
- ❌ Un estudiante cancela una cita y vuelve a reservar a la misma hora: **se rechaza** (la cita cancelada sigue bloqueando).
- ❌ Un slot de 3 minutos: **se acepta**.
- ❌ Un slot con `status = NULL`: **se acepta**.

`npm run lint` y `npm test` pasan.

---

## 1. Esquema (urgente: P3, P4 y P5 dependen de él)

### Migraciones

- [ ] Pasar `schema.sql` a migraciones numeradas en `backend/src/database/migrations/` (`001_initial_schema.sql`, `002_...`).
- [ ] Añadir `npm run db:migrate`, que aplique las migraciones pendientes y apunte las aplicadas en una tabla `schema_migrations`, para poder ejecutarlo varias veces sin errores.
- [ ] Añadir `npm run db:seed` y explicar en el `README.md` cómo usar los dos scripts, en local y en Render.

### Restricciones (BR-CONF-03 y BR-CONF-05)

- [ ] Que las citas canceladas no bloqueen el horario del estudiante:

  ```sql
  CONSTRAINT no_student_appointment_overlap EXCLUDE USING gist (
      student_id WITH =,
      time_range WITH &&
  ) WHERE (status <> 'CANCELLED')
  ```

- [ ] Impedir dos citas activas en el mismo slot. Es lo que comprueba el test de concurrencia G2 de P4 (NFR-03):

  ```sql
  CREATE UNIQUE INDEX uq_appointments_active_slot
      ON appointments (slot_id) WHERE status <> 'CANCELLED';
  ```

- [ ] Obligar a que `appointments.tutor_id` y `appointments.time_range` coincidan con los de su slot:

  ```sql
  -- en availability_slots
  CONSTRAINT uq_slot_tutor_range UNIQUE (id, tutor_id, time_range)
  -- en appointments
  FOREIGN KEY (slot_id, tutor_id, time_range)
      REFERENCES availability_slots (id, tutor_id, time_range)
  ```

- [ ] Exigir bloques de 60 minutos (BR-CONF-03):

  ```sql
  CHECK (upper(time_range) - lower(time_range) = interval '60 minutes')
  ```

- [ ] Poner `NOT NULL` en todos los `status`, `created_at`, `updated_at` y en el resto de columnas que nunca deberían quedar vacías.
- [ ] Borrar `idx_availability_slots_tutor_range`: la restricción `no_tutor_slot_overlap` ya crea exactamente ese índice GiST, así que está duplicado.
- [ ] Añadir un trigger que actualice `updated_at` en cada `UPDATE` (ahora nunca cambia).

### Columnas y tablas que faltan

- [ ] **`users`** (para P3):
  - Cambiar `is_active BOOLEAN` por `status` ENUM (`ACTIVE`, `SUSPENDED`). CU-13 hace `SET status = 'SUSPENDED'` y el diagrama de clases tiene `accountStatus`.
  - Añadir `failed_login_count INT NOT NULL DEFAULT 0` y `locked_until TIMESTAMPTZ` (CU-02: bloqueo de 15 minutos tras 5 intentos fallidos; ya aparecen en el diagrama de secuencia de la Fase 1).
  - Añadir `late_cancellation_count INT NOT NULL DEFAULT 0` (BR-CONF-02: "late cancellations are flagged in the user profile").
- [ ] **`appointments`** (para P4 y P5):
  - Añadir `student_inquiry TEXT` (el `POST /api/appointments` de la Fase 1 envía `inquiry`).
  - Sustituir `notes` por `tutor_notes TEXT` y `student_feedback TEXT` (CU-12 distingue las notas del tutor de la valoración escrita del estudiante).
  - Añadir `is_late_cancellation BOOLEAN NOT NULL DEFAULT FALSE`, `cancelled_by UUID REFERENCES users(id)` y `cancelled_at TIMESTAMPTZ` (CU-09 A1).
- [ ] **Tabla nueva `audit_logs`** (para P3, CU-14): `id`, `actor_id`, `action`, `target_type`, `target_id`, `details JSONB`, `created_at`. Solo admite inserciones ("append-only"): un trigger que rechace `UPDATE` y `DELETE`, o un `REVOKE`.
- [ ] Quitar `hourly_rate` o justificarlo: no aparece en la Fase 1.
- [ ] Valorar añadir `department` a `subjects`, que sí está en el diagrama de clases de la Fase 1.

### Coordinación

- [ ] Cuando esté fusionado, **avisar a P3, P4 y P5** de las columnas nuevas y de cómo ejecutar las migraciones.

---

## 2. Datos de prueba

- [ ] Usar hashes bcrypt reales (por ejemplo, de `Password123!`) y apuntar las credenciales de prueba en el `README.md`. Ahora nadie puede iniciar sesión con los usuarios de prueba.
- [ ] Añadir un usuario ADMIN.
- [ ] Crear los slots a horas en punto y con más de 2 horas de antelación (BR-CONF-01). Ahora salen a horas sueltas, como las 17:09.
- [ ] Incluir algunas citas (una confirmada, una completada y una cancelada) para que P4 y P5 tengan con qué probar.

---

## 3. Seguridad (urgente)

- [ ] **Quitar `req.query.userId` y `req.body.userId`** de `tutorController.js`. Ahora cualquiera puede leer o cambiar el perfil de cualquier tutor, incluido su enlace de reunión, lo que permite phishing. El usuario solo puede venir de `req.user`.
- [ ] Proteger `PUT /api/tutors/profile` con los middlewares de autenticación y de rol TUTOR de P3. Mientras no existan, el endpoint responde 401 si no hay `req.user`.
- [ ] No devolver `meeting_url` en la búsqueda pública: solo lo necesitan quienes tienen una reserva (CU-10 lo manda en el recordatorio).

---

## 4. CU-06: Buscar tutores

Ahora `findTutors` recibe `_subjectId` y `_search` pero no los usa (el commit del linter les puso el guion bajo para silenciar el aviso).

- [ ] Filtrar de verdad por `subjectId` y por `search` (`ILIKE` sobre el nombre, la bio y el nombre de la asignatura), siempre con parámetros `$1`, `$2`… (NFR-02).
- [ ] Mostrar solo tutores activos con al menos una asignatura (regla de negocio de CU-06).
- [ ] Devolver las asignaturas de cada tutor (`json_agg`) y su próximo slot libre, y ordenar por disponibilidad futura ("upcoming availability").
- [ ] Validar `limit` (de 1 a 50), `offset` (0 o más) y que `subjectId` sea un UUID: responder 400, no 500. Ahora `?limit=abc` provoca un error 500.
- [ ] Crear `GET /api/subjects`: el catálogo para el desplegable de búsqueda y para el paso 2 de CU-03.
- [ ] Crear `GET /api/tutors/:id`: el perfil público de un tutor.

---

## 5. CU-03: Perfil del tutor

- [ ] Crear el perfil si no existe (`INSERT ... ON CONFLICT (user_id) DO UPDATE`). Ahora un tutor recién registrado no tiene fila en `tutor_profiles`, el `UPDATE` no hace nada y la respuesta es 404.
- [ ] Guardar las asignaturas en `tutor_subjects` dentro de la misma transacción (`DELETE` de las anteriores e `INSERT` de las nuevas). La función se llama `updateProfileAndSubjects`, pero ahora no toca las asignaturas.
- [ ] Responder 400 si no hay ninguna asignatura (A1) o si alguna no existe.
- [ ] Validar el enlace con `new URL()`: que sea `https` y que el dominio sea uno de los permitidos (`meet.google.com`, `zoom.us` o `*.zoom.us`, `teams.microsoft.com`, `teams.live.com`). Si no, responder 400 (A2). Ahora `includes('meet.google.com')` rechaza Zoom y Teams, que la Fase 1 permite, y acepta cosas como `javascript:alert(1)//meet.google.com`.
- [ ] Limitar la longitud de la bio.

---

## 6. Estilo (seguir el módulo de salud)

- [ ] Importar `src/utils/AppError.js` en vez de definir otro `AppError` dentro de `tutorService.js`.
- [ ] Usar funciones exportadas en vez de clases, como `healthController.js` y `healthService.js`, y quitar los `try/catch`: Express 5 ya pasa los errores al middleware.
- [ ] Usar el mismo formato de respuesta que el resto de la API (sin el envoltorio `{ success, data }`).
- [ ] Escribir comentarios y mensajes de error en inglés, como el resto del código y la Fase 1.
- [ ] En `routes/index.js`, montar `tutorRoutes` antes del `module.exports`, en el sitio donde ya está comentado.

---

## 7. Tests (NFR-04)

- [ ] Tests del service con el repository simulado (`jest.mock`): URL válida y no válida, sin asignaturas, perfil inexistente.
- [ ] Tests de las rutas con Supertest: búsqueda con filtros, parámetros no válidos, `PUT` sin autenticación.
- [ ] Volver a una cobertura cercana al 90 %. Con el 73,9 % actual, el próximo caso de uso sin tests dejará el CI en rojo.

---

## 8. Documento 4.2 (se presenta en la semana 11)

- [ ] **Quitar el LaTeX.** `marked` no lo interpreta y en el PDF sale tal cual (`$$\text{PK} = ...$$`, `\xrightarrow{1:1}`). Usar texto normal o código.
- [ ] **Corregir lo de "3FN pura".** `appointments.tutor_id` y `appointments.time_range` dependen transitivamente de `slot_id`. Explicarlo como una desnormalización hecha a propósito para poder usar la restricción `EXCLUDE` del estudiante, y contar cómo la FK compuesta mantiene la coherencia.
- [ ] **Corregir que el `EXCLUDE` "previene la doble reserva".** `no_tutor_slot_overlap` solo evita que se solapen los slots de un mismo tutor. Explicar las tres protecciones: solape de slots del tutor, solape de citas del estudiante e índice único por slot.
- [ ] Añadir un diagrama entidad-relación.
- [ ] Añadir una tabla con las columnas de cada tabla y su tipo.
- [ ] Explicar las migraciones y los datos de prueba.
- [ ] Llegar a unas 4 páginas y volver a generar el PDF (`cd docs/build && npm run pdf -- ../phase2/04-implementation-details.md`).

---

## 9. Forma de trabajar

- [ ] A partir de ahora, hacer los cambios en una rama (por ejemplo `fix/p2-schema`) con su Pull Request, y que otra persona lo revise antes de fusionar a `main`, como dice la sección 5 de `ESTADO-DEL-PROYECTO.md`.
