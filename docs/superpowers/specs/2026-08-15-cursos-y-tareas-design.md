# Cursos y tareas: cuentas de estudiante y test en línea

**Fecha:** 2026-08-15
**Estado:** diseño aprobado en chat, pendiente plan de implementación
**Origen:** pedido de Fernanda (usuaria piloto): cuenta de estudiante para
mandarles guías y pruebas, "como un test en línea, les dejo unas preguntas y
que las puedan hacer en su casa".

## Objetivo

Que un profesor pueda asignar una prueba existente a un curso de estudiantes,
que cada estudiante la responda en línea desde su casa (una vez), y que el
profesor vea las entregas y puntajes. Las preguntas de alternativas se corrigen
solas; las de desarrollo quedan como texto para revisión manual del profesor.

## Alcance v1

- Rol nuevo `student` con portal propio, separado del área de profesor.
- Vinculación por **código de curso**: el profesor crea un curso y comparte un
  link/código de inscripción.
- Asignación de pruebas con **snapshot congelado** del contenido.
- Un intento por estudiante; al enviar ve puntaje, correctas y explicaciones.
- Panel de resultados del profesor por asignación.

**Fuera de alcance v1** (anotado para versiones futuras): calificación manual y
nota final en la app, estadísticas por pregunta, exportar resultados,
reintentos o "modo estudio" configurable, login social para estudiantes,
autoguardado de borrador al responder, material solo-visualización (guías).

## Modelo de datos

`usuarios.role` gana el valor `'student'` (la columna ya existe; sin migración
de tipo). Un estudiante tiene `colegioId` NULL y queda fuera de suscripciones y
cuotas de IA.

Tablas nuevas, siguiendo el estilo del dominio (`userId` entero sin FK formal;
integridad garantizada en las actions):

- **`cursos`** — `id`, `userId` (profesor dueño), `nombre` (ej. "8°A Física"),
  `joinCode` único (mismo patrón que `colegios.joinCode`), `createdAt`.
- **`inscripciones`** — `id`, `cursoId`, `estudianteId`, `createdAt`.
  Único `(cursoId, estudianteId)`. Un estudiante puede estar en varios cursos.
- **`asignaciones`** — `id`, `cursoId`, `pruebaId` (referencia informativa al
  origen; puede quedar huérfana), `titulo`, `instrucciones`, `contenido` jsonb
  (el snapshot), `fechaLimite` timestamp nullable, `createdAt`.
- **`entregas`** — `id`, `asignacionId`, `estudianteId`, `respuestas` jsonb
  (por índice de pregunta: letra elegida o texto libre), `puntaje` y `total`
  (solo alternativas), `enviadoEl`. Único `(asignacionId, estudianteId)` =
  un intento.

### El snapshot (`asignaciones.contenido`)

Copia congelada al momento de asignar: preguntas con enunciado, tipo,
alternativas, correcta, explicación y claves de imagen, más los textos de
comprensión con sus preguntas, en el orden del PDF. Editar o borrar la prueba
original después de asignar NO altera la tarea ni las entregas.

Decisiones:

- `correcta` y `explicacion` viven solo en el jsonb del servidor y **nunca
  viajan al cliente antes de entregar**: la página del estudiante recibe una
  versión serializada sin respuestas; la corrección ocurre en la action de
  entrega.
- Las imágenes se referencian por su clave de blob (no se copian). Caveat
  aceptado: si borrar la pregunta original borra sus blobs, la imagen se vería
  rota en la tarea. Al implementar, verificar si `eliminarPregunta` borra
  blobs; si lo hace, mitigarlo ahí (no borrar blobs referenciados por
  asignaciones).

## Flujo del estudiante

### Registro e inscripción

- El profesor comparte un link `/unirse/CODIGO` (o el código a secas, que se
  ingresa en `/unirse`).
- Visitante sin cuenta: formulario de registro (nombre, email, contraseña) que
  crea la cuenta con better-auth, estampa `role: 'student'` y lo inscribe al
  curso del código, todo en un paso. Logueado como estudiante, el link lo
  inscribe directo (idempotente si ya estaba).
- Desde su portal puede unirse a más cursos ingresando otro código
  ("Unirme a un curso").

### Portal `(estudiante)`

Route group nuevo con shell mínimo (logo, nombre, cerrar sesión; nada del
sidebar de profesor):

- **`/tareas`** — home del estudiante. Lista las asignaciones de todos sus
  cursos con estado: pendiente (con fecha límite si tiene), entregada (con
  puntaje) o vencida. Al iniciar sesión, el estudiante siempre aterriza aquí.
- **`/tareas/[id]` (responder)** — instrucciones, textos de comprensión y
  preguntas en el orden asignado (render con `LatexText` e imágenes vía blob).
  Alternativas como radio A–E, desarrollo como textarea. Un solo envío al final
  con confirmación; sin autoguardado en v1, solo aviso del navegador al salir
  con cambios.
- **`/tareas/[id]` (resultado)** — la misma ruta después de entregar muestra:
  puntaje de alternativas (ej. 7/10), cada pregunta marcada correcta/incorrecta
  con la respuesta correcta y su explicación, y las de desarrollo con
  "enviada — la revisará tu profesor".

### Reglas del servidor (en la action, no solo en UI)

- Solo estudiantes inscritos en el curso de la asignación pueden ver/entregar.
- Fecha límite vencida → rechaza el envío (la UI muestra "vencida" sin
  formulario).
- Segunda entrega → rechazada por el unique `(asignacionId, estudianteId)`.
- Correctas/explicaciones solo aparecen en respuestas del servidor **después**
  de existir la entrega.

## Flujo del profesor

### Sección "Cursos" (`/cursos`, ítem nuevo del sidebar)

- Lista de sus cursos con nº de alumnos y nº de tareas. "Nuevo curso" pide solo
  el nombre; el `joinCode` se genera solo.
- **`/cursos/[id]`** — detalle en dos partes:
  - *Alumnos*: código/link de inscripción con botón copiar, y lista de
    inscritos con opción de quitar (borra la inscripción, no sus entregas
    pasadas).
  - *Tareas*: asignaciones del curso con avance ("14/30 entregadas") y fecha
    límite.

### Asignar una prueba

En `/mis-pruebas`, cada prueba gana la acción "Asignar a curso": elegir curso,
fecha límite opcional e instrucciones (pre-llenadas con las de la prueba). Al
confirmar se crea la asignación con el snapshot. La misma prueba se puede
asignar a varios cursos, e incluso más de una vez al mismo curso (no hay unique
sobre `(cursoId, pruebaId)`): cada asignación es independiente, con su propio
snapshot — p. ej. re-asignar una versión corregida de la prueba.

### Resultados (`/cursos/[id]/tareas/[asigId]`)

- Tabla alumno × estado: pendiente / entregada con puntaje de alternativas y
  fecha de envío.
- Detalle por alumno: respuestas pregunta a pregunta — alternativas marcadas
  correcta/incorrecta, desarrollo con el texto completo (revisión fuera de la
  app en v1).
- Eliminar una asignación pide confirmación explícita porque borra también las
  entregas.

## Auth y permisos

- **Registro con rol:** el alta de estudiante ocurre solo vía `/unirse/CODIGO`,
  con una server action propia que valida el código, crea la cuenta, estampa el
  rol y crea la inscripción (mismo espíritu que las invitaciones de colegio).
  En v1 los estudiantes se registran solo con email/contraseña (el login social
  complica estampar el rol en el callback y su setup en Azure está pendiente).
- **Separación de mundos, en layouts:**
  - Layout de `(app)`: sesión `student` → redirect a `/tareas`; sin sesión →
    login, como hoy.
  - Layout de `(estudiante)`: sin sesión → login; sesión de profesor/admin →
    redirect a `/dashboard`.
  - Redirect post-login según rol: estudiante → `/tareas`; resto → `/dashboard`.
- **En las actions (defensa real):**
  - Actions de estudiante (ver tarea, entregar): exigen `role === 'student'` y
    inscripción vigente en el curso de la asignación.
  - Actions de profesor (crear curso, asignar, ver resultados, quitar alumno):
    exigen rol no-student y propiedad del curso (`cursos.userId`), con el
    patrón de guardas de `lib/authz.ts`.
  - Las actions existentes de contenido no cambian, salvo las que consumen
    cuota IA (`/generar`, `/importar`), que ganan un check de rol explícito
    para que un estudiante no pueda gastar tokens.
- **Suscripciones y cuotas:** los estudiantes quedan fuera del modelo de
  suscripción (sin paywall ni banners). El log de accesos los registra igual
  que a cualquier usuario.

## Testing

**Integración (vitest contra Postgres local, como la suite existente):**

- *Inscripción*: código válido crea cuenta `student` + inscripción; código
  inválido falla sin crear nada; re-usar el link ya inscrito es idempotente;
  unirse a un segundo curso funciona.
- *Asignación*: el snapshot queda congelado — editar o borrar la prueba
  original no altera la tarea ni las entregas; solo el dueño del curso puede
  asignar.
- *Entrega*: corrige alternativas y calcula puntaje/total (desarrollo no
  puntúa); rechaza segundo intento, entrega fuera de plazo y estudiante no
  inscrito; la carga de la tarea antes de entregar no incluye `correcta` ni
  `explicacion` (el test inspecciona la forma serializada).
- *Resultados*: solo el profesor dueño ve las entregas; estados
  pendiente/entregada/vencida correctos.

**Unit:** la función pura de corrección (respuestas × snapshot → puntaje) con
casos borde: sin responder, tipo desarrollo, prueba sin alternativas.

**E2E (playwright, como `roles.spec.ts`):** flujo feliz completo — profesor
crea curso y asigna una prueba → estudiante se registra con el código, responde
y ve su resultado → profesor ve la entrega en el panel.

CI no ejecuta vitest: la suite completa se corre localmente antes de cerrar
cada tarea (`DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test'`).

## Nota relacionada

El otro pedido de Fernanda del mismo mensaje —seleccionar carpetas al armar una
prueba— ya está implementado (commit `cbc77bb`, selector de carpeta en el
generador) y no forma parte de esta spec.
