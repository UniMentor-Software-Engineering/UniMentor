# 02. INGENIERÍA DE REQUISITOS — UNIMENTOR

En esta sección definimos a los usuarios de la plataforma, las reglas funcionales fijadas por el equipo para evitar problemas en el desarrollo y el desglose de los casos de uso principales con sus flujos de excepción y requisitos de calidad.

---

## 1. Perfiles de usuario y necesidades clave (Stakeholders)

No nos limitamos a enumerar los roles; analizamos qué busca cada uno y qué problemas necesita evitar dentro del sistema:

| Usuario | Papel en el sistema | Necesidad principal (Concerns) | Criterio de satisfacción |
| :--- | :--- | :--- | :--- |
| **Estudiante** | Busca y reserva apoyo académico. | **Agilidad y fiabilidad:** Quiere encontrar rápido a un tutor de su carrera o materia, no perderse en menús complicados y tener la certeza de que su reserva se guardó y no se le va a pisar con otra clase. | Reservar en menos de dos minutos y recibir confirmación inmediata al correo. |
| **Tutor / Mentor** | Ofrece las tutorías y marca sus huecos. | **Control de horario y cero solapamientos:** Necesita organizar sus horas libres sin líos, poder cancelar con margen si le surge un imprevisto y saber con antelación qué dudas trae el alumno. | Ninguna colisión de citas en la base de datos y aviso claro antes de cada sesión. |
| **Administrador** | Supervisa el uso y la estabilidad del sistema. | **Control, seguridad y auditoría:** Debe vigilar que los usuarios sean del campus universitario, poder suspender perfiles con mal comportamiento y revisar reportes de uso si hay problemas. | Panel con métricas de tutorías, trazabilidad de logs y gestión de bajas inmediata. |

---

## 2. Decisiones funcionales y parámetros del sistema

Para que el desarrollo no quede en el aire con dudas de implementación, fijamos los siguientes valores definitivos para el sistema:

* **Antelación de reserva (RN-01):** Solo se puede reservar una tutoría con al menos **2 horas de antelación**. No se permite reservar sobre la marcha para dar tiempo a preparar la sesión.
* **Margen de cancelación (RN-02):** Tanto alumno como tutor pueden cancelar sin penalización hasta **4 horas antes**. Si se cancela más tarde, el sistema guarda la incidencia en el historial.
* **Duración de la sesión (RN-03):** Todas las tutorías se organizan en bloques fijos de **60 minutos**.
* **Límite de citas activas (RN-04):** Un alumno solo puede tener hasta **3 tutorías pendientes de realizar** a la vez. Hasta que no complete o cancele una, no puede ocupar más horas.
* **Control de solapamiento (RN-05):** La base de datos impide a nivel de transacción que un usuario (tutor o alumno) tenga dos sesiones en la misma franja horaria.

---

## 3. Catálogo de Casos de Uso

### CU-01: Registro de usuario
* **ID:** CU-01
* **Nombre:** Alta de cuenta en la plataforma.
* **Actor principal:** Usuario nuevo (Estudiante o Tutor).
* **Actores secundarios:** Base de datos (PostgreSQL), servicio de correo (Nodemailer).
* **Disparador (Trigger):** El usuario pulsa en "Crear cuenta" en la pantalla de registro.
* **Precondiciones:** No tener una sesión abierta y usar un correo institucional universitario (@alumnos.uax.es o similar).
* **Postcondiciones:**
  * **Éxito:** Usuario creado en base de datos con contraseña cifrada (bcrypt), rol asignado y correo de bienvenida enviado.
  * **Fallo:** No se guarda nada y se avisa del fallo en el formulario.
* **Reglas de negocio asociadas:** Correo único; contraseña de al menos 8 caracteres con letras y números combinados.
* **Flujo normal:**
  1. El usuario entra al formulario de registro.
  2. Rellena nombre, correo de la universidad, contraseña y elige su rol (Estudiante o Tutor).
  3. Pulsa "Crear cuenta".
  4. El backend comprueba que los campos vienen completos y con el formato adecuado.
  5. Se comprueba en PostgreSQL que ese correo no existe todavía.
  6. Se genera el hash de la clave con bcrypt.
  7. Se guarda el nuevo usuario con su rol.
  8. Se envía un correo de bienvenida automático.
  9. La web redirige a la pantalla de login con un aviso de registro completado.
* **Flujos alternativos y errores:**
  * **A1: El correo ya existe.** En el paso 5, si el email ya está en la base de datos, el backend responde un error 409 y la web muestra: *"Este correo ya está registrado"*.
  * **A2: Contraseña débil.** En el paso 4, si no llega al mínimo de seguridad, se detiene el envío y se marcan en rojo los requisitos que faltan.

---

### CU-02: Inicio de sesión
* **ID:** CU-02
* **Nombre:** Login y generación de sesión.
* **Actor principal:** Usuario registrado (Estudiante, Tutor o Admin).
* **Actores secundarios:** Base de datos.
* **Disparador (Trigger):** El usuario pulsa "Entrar" tras escribir su correo y contraseña.
* **Precondiciones:** Tener una cuenta activa en la base de datos.
* **Postcondiciones:**
  * **Éxito:** Se genera un token JWT firmado y se manda al usuario a su panel de control.
  * **Fallo:** Acceso denegado y contador de intentos fallidos sumado.
* **Reglas de negocio asociadas:** Si se falla 5 veces seguidas la contraseña, la cuenta se congela durante 15 minutos por seguridad.
* **Flujo normal:**
  1. El usuario escribe sus datos en `/login` y pulsa "Entrar".
  2. El servidor busca el usuario por email en PostgreSQL.
  3. Se compara la clave recibida con el hash guardado en base de datos.
  4. Si coincide, se crea un token JWT con el identificador y rol del usuario.
  5. El servidor devuelve el token y el navegador lo almacena.
  6. La aplicación redirige al panel según el rol (alumno, tutor o admin).
* **Flujos alternativos y errores:**
  * **A1: Datos incorrectos.** Si el correo o la clave no coinciden, se devuelve un error 401: *"Correo o contraseña incorrectos"*.
  * **A2: Cuenta suspendida.** Si el usuario está bloqueado por el administrador, se corta el login con un error 403 avisando de la suspensión.

---

### CU-03: Configurar perfil y materias (Tutor)
* **ID:** CU-03
* **Nombre:** Editar datos y asignaturas que imparte el tutor.
* **Actor principal:** Tutor.
* **Actores secundarios:** Base de datos.
* **Disparador (Trigger):** El tutor pulsa "Guardar perfil".
* **Precondiciones:** Haber iniciado sesión con rol de Tutor.
* **Postcondiciones:**
  * **Éxito:** Perfil actualizado con materias asignadas, biografía y enlace de videollamada.
  * **Fallo:** Se mantienen los datos antiguos y se avisa del fallo.
* **Reglas de negocio asociadas:** Debe seleccionar al menos una asignatura oficial; el enlace de videollamada debe ser una URL válida (Meet, Teams o Zoom).
* **Flujo normal:**
  1. El tutor entra en la pestaña "Mi Perfil".
  2. La web carga sus datos actuales y la lista de asignaturas disponibles.
  3. Modifica su descripción, marca sus materias y pega el enlace de su sala de videollamada recurrente.
  4. Pulsa "Guardar perfil".
  5. El backend valida que la URL sea correcta y que haya marcado al menos una asignatura.
  6. Se actualiza la información en las tablas de PostgreSQL.
  7. La pantalla muestra un aviso verde de confirmación.
* **Flujos alternativos y errores:**
  * **A1: Falta elegir materia.** Si desmarca todas las asignaturas, el formulario le impide guardar y le avisa de que necesita al menos una.
  * **A2: Enlace erróneo.** Si la URL no empieza por `https://` o no es de un servicio conocido, salta error de validación.

---

### CU-04: Publicar disponibilidad en el calendario (Tutor)
* **ID:** CU-04
* **Nombre:** Crear franjas horarias libres.
* **Actor principal:** Tutor.
* **Actores secundarios:** Base de datos.
* **Disparador (Trigger):** El tutor hace clic en "Publicar huecos" en su vista de calendario.
* **Precondiciones:** Tener el perfil configurado con al menos una materia.
* **Postcondiciones:**
  * **Éxito:** Se generan las franjas horarias en estado libre (`AVAILABLE`) visibles para los alumnos.
  * **Fallo:** No se crean los huecos y se avisa del error.
* **Reglas de negocio asociadas:** Cada hueco es de 60 minutos; no se pueden publicar huecos en días u horas que ya hayan pasado ni solapar franjas existentes.
* **Flujo normal:**
  1. El tutor abre su calendario de disponibilidad.
  2. Pincha y arrastra sobre los tramos que tiene libres en la semana.
  3. El sistema divide el tramo en bloques de 1 hora.
  4. Pulsa "Publicar huecos".
  5. El backend comprueba que ninguno de esos huecos colisione con citas o huecos ya guardados.
  6. Se insertan las filas en la tabla `availability_slots`.
  7. El calendario se actualiza mostrando las horas en color verde.
* **Flujos alternativos y errores:**
  * **A1: Solapamiento con franjas existentes.** Si algún tramo coincide con uno ya creado, el backend omite ese tramo específico, guarda los válidos y avisa del solapamiento al tutor.

---

### CU-05: Bloquear o borrar un hueco (Tutor)
* **ID:** CU-05
* **Nombre:** Retirar franja de disponibilidad.
* **Actor principal:** Tutor.
* **Actores secundarios:** Base de datos.
* **Disparador (Trigger):** El tutor pincha en un hueco libre y le da a "Eliminar franja".
* **Precondiciones:** El hueco debe pertenecer al tutor que lo borra.
* **Postcondiciones:**
  * **Éxito:** El hueco desaparece del calendario y los alumnos ya no pueden verlo ni reservarlo.
  * **Fallo:** La franja se mantiene y se avisa de la causa.
* **Reglas de negocio asociadas:** No se puede borrar una franja si ya tiene una reserva confirmada dentro; en ese caso hay que cancelarla formalmente (CU-09).
* **Flujo normal:**
  1. El tutor pincha en una de sus horas libres en el calendario.
  2. Pulsa "Eliminar franja" y acepta la confirmación.
  3. El servidor revisa que el estado de la franja sea libre (`AVAILABLE`).
  4. Se elimina el registro de la tabla `availability_slots`.
  5. La cuadrícula del calendario se actualiza al instante.
* **Flujos alternativos y errores:**
  * **A1: Un alumno acaba de reservarla.** Si un alumno reservó el hueco un segundo antes, el backend detecta que ya no está libre, rechaza el borrado y avisa: *"Esta hora acaba de ser reservada; si no puedes darla, cancélala desde el panel de citas"*.

---

### CU-06: Buscar tutores por materia
* **ID:** CU-06
* **Nombre:** Filtrado y catálogo de tutores.
* **Actor principal:** Estudiante.
* **Actores secundarios:** Base de datos.
* **Disparador (Trigger):** El alumno escribe en la barra de búsqueda o usa el desplegable de asignaturas.
* **Precondiciones:** Ninguna.
* **Postcondiciones:**
  * **Éxito:** Lista de tutores que coinciden con la materia buscada.
  * **Fallo:** Mensaje avisando de que no hay coincidencias.
* **Reglas de negocio asociadas:** Solo se muestran tutores activos con cuenta verificada y disponibilidad futura.
* **Flujo normal:**
  1. El estudiante abre el buscador de la plataforma.
  2. Escribe una asignatura (ej. "Ingeniería de Software").
  3. El backend lanza una consulta filtrando por nombre de materia.
  4. El sistema responde con las tarjetas de los tutores que la imparten y sus próximos huecos libres.
* **Flujos alternativos y errores:**
  * **A1: Sin resultados.** Si no hay nadie registrado para esa materia, la pantalla indica: *"No encontramos tutores para esta asignatura en este momento"*.

---

### CU-07: Ver calendario de un tutor
* **ID:** CU-07
* **Nombre:** Consultar horarios de un mentor.
* **Actor principal:** Estudiante.
* **Actores secundarios:** Base de datos.
* **Disparador (Trigger):** El estudiante pulsa en "Ver huecos libres" dentro del perfil de un tutor.
* **Precondiciones:** El tutor debe estar dado de alta y activo.
* **Postcondiciones:**
  * **Éxito:** Cuadrícula del mes o semana con los huecos disponibles clicables.
  * **Fallo:** Aviso de que el tutor no tiene horas publicadas.
* **Reglas de negocio asociadas:** Los huecos a menos de 2 horas de la hora actual aparecen deshabilitados (regla de antelación mínima).
* **Flujo normal:**
  1. El alumno abre la ficha del tutor y pulsa en ver calendario.
  2. La web pide al servidor los huecos libres para el mes en curso.
  3. El servidor filtra los slots con estado `AVAILABLE` que cumplan la antelación mínima de 2 horas.
  4. La web pinta las horas disponibles para poder seleccionarlas.
* **Flujos alternativos y errores:**
  * **A1: Sin horas publicadas.** Si el tutor no ha subido huecos, se muestra el calendario vacío con el mensaje: *"Este tutor no tiene horarios disponibles para este mes"*.

---

### CU-08: Reservar tutoría
* **ID:** CU-08
* **Nombre:** Agendar una sesión con un tutor.
* **Actor principal:** Estudiante.
* **Actores secundarios:** Tutor, base de datos, servicio de correo.
* **Disparador (Trigger):** El alumno pulsa "Confirmar reserva" tras elegir hora.
* **Precondiciones:**
  1. Tener la sesión iniciada como estudiante.
  2. Que la franja esté libre en el calendario.
  3. No tener ya 3 tutorías activas pendientes.
* **Postcondiciones:**
  * **Éxito:** Cita creada en estado `CONFIRMED`, franja bloqueada a `BOOKED` y correos con el enlace enviados a ambas partes.
  * **Fallo:** La franja sigue libre, no se toca la base de datos y se avisa del fallo.
* **Reglas de negocio asociadas:** Mínimo 2 horas de antelación; el alumno no puede tener otra reserva a la misma hora; tope de 3 citas activas por alumno.
* **Flujo normal:**
  1. El alumno hace clic en un hueco libre del calendario.
  2. Escribe una descripción breve con la duda o tema a tratar.
  3. Pulsa "Confirmar reserva".
  4. El servidor abre una transacción en PostgreSQL para evitar carreras de peticiones.
  5. Comprueba que el alumno no tenga ya 3 citas y que no haya solapamiento en su propio horario.
  6. Cambia el estado del hueco a `BOOKED` y crea la cita en la tabla `appointments`.
  7. Se confirma la transacción en la base de datos.
  8. Se dispara el envío de correos con el enlace de reunión al tutor y al alumno.
  9. La web muestra mensaje de éxito y lleva al alumno a su panel de citas.
* **Flujos alternativos y errores:**
  * **A1: Dos alumnos reservan a la vez el mismo hueco.** Si la base de datos detecta que el hueco acaba de pasar a `BOOKED` por otra petición simultánea, se cancela la transacción (`ROLLBACK`) y se avisa: *"Esa hora acaba de ser reservada por otro compañero"*.
  * **A2: Superado el tope de citas.** Si el alumno ya tiene 3 citas pendientes, salta el aviso: *"Has alcanzado el límite de 3 tutorías activas"*.
  * **A3: Menos de 2 horas de margen.** Si el hueco está dentro de las siguientes dos horas, se rechaza por falta de antelación.

---

### CU-09: Cancelar tutoría
* **ID:** CU-09
* **Nombre:** Anular una cita ya programada.
* **Actor principal:** Estudiante o Tutor.
* **Actores secundarios:** El otro implicado, base de datos, servicio de correo.
* **Disparador (Trigger):** El usuario pulsa "Cancelar tutoría" en su lista de próximas citas.
* **Precondiciones:** La cita debe estar confirmada y el usuario debe ser parte de la misma.
* **Postcondiciones:**
  * **Éxito:** Cita marcada como `CANCELLED`, el hueco vuelve a estar libre si procede y se envía un correo de aviso a la otra persona.
  * **Fallo:** La cita se mantiene activa y se muestra el error.
* **Reglas de negocio asociadas:** Solo se puede cancelar sin penalización con al menos 4 horas de margen.
* **Flujo normal:**
  1. El usuario entra en su panel y busca la cita en "Próximas tutorías".
  2. Pulsa "Cancelar tutoría".
  3. Escribe un motivo breve y pulsa en confirmar.
  4. El servidor verifica que faltan más de 4 horas para la sesión.
  5. Se actualiza el estado de la cita a `CANCELLED` y el hueco del calendario pasa de nuevo a `AVAILABLE`.
  6. Se manda un email automático a la otra parte informando de la anulación.
  7. La cita pasa al historial de canceladas en la interfaz.
* **Flujos alternativos y errores:**
  * **A1: Cancelación fuera de plazo.** Si faltan menos de 4 horas, se le avisa al usuario de que está cancelando con retraso, se anula la cita pero el hueco no se vuelve a abrir al público para no dejar al tutor descolocado.

---

### CU-10: Envío de recordatorios automáticos
* **ID:** CU-10
* **Nombre:** Avisos por correo antes de la sesión.
* **Actor principal:** Proceso programado en el servidor (Cronjob de Node.js).
* **Actores secundarios:** Servicio de correo (Nodemailer), Alumno y Tutor.
* **Disparador (Trigger):** Tarea automática de fondo que corre periódicamente en el backend.
* **Precondiciones:** Existencia de citas confirmadas para el día siguiente.
* **Postcondiciones:**
  * **Éxito:** Correos de recordatorio enviados con enlace de videollamada, fecha y hora.
  * **Fallo:** Se registra el error en los logs y se vuelve a intentar más tarde.
* **Reglas de negocio asociadas:** El recordatorio se dispara 24 horas antes del inicio de la cita.
* **Flujo normal:**
  1. El servidor revisa en la base de datos las citas que ocurren en las próximas 24 horas y que no tengan el aviso enviado.
  2. Monta el correo con la hora, tema y enlace de videollamada del tutor.
  3. Lanza el envío a través de Nodemailer.
  4. Marca en la base de datos `reminder_sent = true` para no duplicar avisos.
* **Flujos alternativos y errores:**
  * **A1: Falla el servidor de correo.** Si el servidor SMTP no contesta, el fallo queda registrado en los logs del servidor y la cita se deja pendiente para reintentar en la siguiente pasada.

---

### CU-11: Panel de control (Dashboard)
* **ID:** CU-11
* **Nombre:** Consultar citas y sesiones organizadas.
* **Actor principal:** Estudiante o Tutor.
* **Actores secundarios:** Base de datos.
* **Disparador (Trigger):** El usuario entra a la sección principal de su cuenta (`/dashboard`).
* **Precondiciones:** Estar autenticado con token válido.
* **Postcondiciones:**
  * **Éxito:** Vista ordenada con citas próximas e historial pasado.
  * **Fallo:** Redirección al login si caducó la sesión.
* **Reglas de negocio asociadas:** En cuanto pasa la hora de fin de una cita, pasa automáticamente al bloque de historial.
* **Flujo normal:**
  1. El usuario entra en su panel de control.
  2. La web solicita sus citas activas al backend con su token.
  3. El backend devuelve las sesiones separadas entre próximas y pasadas.
  4. La pantalla muestra las tarjetas de las citas con sus enlaces de videollamada y opciones de gestión.
* **Flujos alternativos y errores:**
  * **A1: Token caducado.** Si la sesión expiró, el backend devuelve un error 401 y la web manda al usuario de vuelta al login pidiendo entrar de nuevo.

---

### CU-12: Guardar notas y valoración tras la sesión
* **ID:** CU-12
* **Nombre:** Añadir apuntes y feedback de la tutoría.
* **Actor principal:** Tutor o Estudiante.
* **Actores secundarios:** Base de datos.
* **Disparador (Trigger):** El usuario pulsa en "Añadir notas" o "Valorar" sobre una cita ya finalizada.
* **Precondiciones:** La cita debe figurar en el historial como completada.
* **Postcondiciones:**
  * **Éxito:** Notas del tutor y puntuación del alumno guardadas en la base de datos.
  * **Fallo:** Datos no guardados y aviso de fallo de conexión.
* **Reglas de negocio asociadas:** Las notas del tutor son privadas para ambos participantes; el alumno solo puede calificar la sesión una vez (puntuación del 1 al 5).
* **Flujo normal:**
  1. Terminada la sesión, el usuario entra al detalle de la cita en su historial.
  2. El tutor escribe qué temas repasaron y recomendaciones de estudio.
  3. El alumno deja una puntuación del 1 al 5 y un comentario opcional.
  4. Al pulsar guardar, el servidor persiste la información en PostgreSQL.
* **Flujos alternativos y errores:**
  * **A1: Intentar valorar antes de tiempo.** Si la cita no ha terminado todavía, los campos aparecen bloqueados explicando que la sesión debe finalizar primero.

---

### CU-13: Suspender cuenta de usuario (Admin)
* **ID:** CU-13
* **Nombre:** Bloqueo de perfiles por parte del administrador.
* **Actor principal:** Administrador.
* **Actores secundarios:** Base de datos.
* **Disparador (Trigger):** El admin hace clic en "Suspender cuenta" en la lista de usuarios.
* **Precondiciones:** Tener sesión iniciada con rol de Administrador.
* **Postcondiciones:**
  * **Éxito:** Usuario marcado como `SUSPENDED`, tokens invalidados y citas futuras canceladas.
  * **Fallo:** Sin cambios si falla la autorización.
* **Reglas de negocio asociadas:** Un administrador no puede suspender su propia cuenta.
* **Flujo normal:**
  1. El admin entra en la lista general de usuarios.
  2. Localiza la cuenta problemática y pulsa "Suspender cuenta".
  3. Escribe el motivo del bloqueo y confirma la acción.
  4. El backend valida el token de admin.
  5. Se cambia el estado del usuario a suspendido y se anulan sus tutorías futuras.
  6. La tabla muestra el usuario en estado inactivo.
* **Flujos alternativos y errores:**
  * **A1: Acceso no autorizado.** Si un alumno o tutor intenta llamar a este endpoint directamente, el servidor devuelve un error 403 prohibiendo el acceso.

---

### CU-14: Estadísticas de uso del sistema (Admin)
* **ID:** CU-14
* **Nombre:** Métricas generales de la plataforma.
* **Actor principal:** Administrador.
* **Actores secundarios:** Base de datos.
* **Disparador (Trigger):** El admin entra en la pestaña de métricas y auditoría.
* **Precondiciones:** Sesión iniciada con rol de Administrador.
* **Postcondiciones:**
  * **Éxito:** Gráficas y tablas con volumen de tutorías, cancelaciones y usuarios activos.
  * **Fallo:** Pantalla bloqueada si no es administrador.
* **Reglas de negocio asociadas:** Los registros de auditoría no se pueden editar ni borrar.
* **Flujo normal:**
  1. El admin abre el panel de métricas.
  2. El backend lanza consultas de recuento y agrupación en PostgreSQL sobre usuarios, citas y valoraciones.

### Fiabilidad y Concurrencia (Reliability)
* **Requisito:** Uso de transacciones atómicas (ACID) en PostgreSQL al confirmar una reserva. El sistema no puede permitir que dos personas reserven el mismo hueco si hacen clic a la vez.
  3. La web muestra el resumen visual con los números clave del servicio.

---

## 4. Requisitos No Funcionales y Validación Técnica

Siguiendo las pautas de la entrega, agrupamos los requisitos técnicos por categorías y especificamos cómo se comprobarán[cite: 14]:

### Rendimiento (Performance)
* **Requisito:** Los endpoints de consulta de calendario y listado de tutores deben responder en menos de **200 ms** con 100 usuarios conectados a la vez[cite: 14].
* **Cómo se probará (Testing Method):** Pruebas de estrés automáticas usando herramientas como **Artillery o k6** contra el backend en Node.js/Express para medir los tiempos de respuesta bajo carga[cite: 14].

### Seguridad (Security)
* **Requisito:** Cifrado obligatorio de contraseñas con **bcrypt** (factor de coste mínimo de 10). Autenticación de endpoints privados con tokens **JWT** y consultas SQL parametrizadas para evitar inyecciones.
* **Cómo se probará (Testing Method):** Auditoría estática de dependencias con `npm audit`, análisis de código con SonarQube y escaneos de seguridad con **OWASP ZAP** en los formularios[cite: 14].

### Fiabilidad y Concurrencia (Reliability)
* **Requisito:** Uso de transacciones atómicas (ACID) en PostgreSQL al confirmar una reserva. El sistema no puede permitir que dos personas reserven el mismo hueco si hacen clic a la vez.
* **Cómo se probará (Testing Method):** Tests de integración con **Jest y Supertest** lanzando peticiones concurrentes a la misma franja para comprobar que solo una tiene éxito y las demás devuelven conflicto (error 409).

### Mantenibilidad (Maintainability)
* **Requisito:** Código estructurado en capas limpias (rutas, controladores, servicios y acceso a datos) para evitar acoplamiento, manteniendo una cobertura mínima del **70% en pruebas unitarias**[cite: 14].
* **Cómo se probará (Testing Method):** Revisión de formato con **ESLint** e informes automáticos de cobertura generados con Jest integrados en las comprobaciones de GitHub Actions[cite: 14].
