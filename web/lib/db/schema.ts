import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Tablas de dominio — espejo EXACTO del MVP (db.py).
// Las columnas A–E e imagen_* preservan el case con nombres entre comillas
// (Postgres baja a minúsculas los identificadores sin comillas; drizzle los
// emite citados literalmente).
// ---------------------------------------------------------------------------

export const usuarios = pgTable('usuarios', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  email: text('email').notNull().unique(),
  // NULLABLE con default '' (antes NOT NULL). Con better-auth la contraseña
  // vive en `accounts.password`; los usuarios creados vía signUp no escriben
  // esta columna, así que el NOT NULL original rompía el alta. Se conserva por
  // compatibilidad con el origen (Render/SQLite) pero ya no es obligatoria.
  passwordHash: text('password_hash').default(''),
  createdAt: timestamp('created_at').defaultNow(),
  // Columnas añadidas para better-auth (Task 1.2).
  emailVerified: boolean('email_verified').default(false).notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
  image: text('image'),
  // -------------------------------------------------------------------------
  // Roles y colegio (Parte C.1) — ADITIVO.
  // `role`: NOT NULL con default 'teacher' para no romper usuarios existentes
  //   (la migración rellena las filas previas con el default).
  //   Valores: 'global_admin' | 'school_admin' | 'teacher'.
  // `colegioId`: nullable. NULL = cuenta personal o admin global (sin colegio).
  // -------------------------------------------------------------------------
  role: text('role').notNull().default('teacher'),
  colegioId: integer('colegio_id').references(() => colegios.id),
  // Columnas del plugin admin de better-auth (Parte C.2). Nullables: el plugin
  // sólo las escribe al banear; un usuario normal las deja en NULL.
  banned: boolean('banned'),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
})

// ---------------------------------------------------------------------------
// Colegios e invitaciones (Parte C.1) — tablas nuevas, ADITIVO.
// ---------------------------------------------------------------------------

export const colegios = pgTable('colegios', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  // Logo del colegio para el encabezado del PDF. Nullable: si falta, el PDF
  // usa el logo por defecto de la app.
  logo: text('logo'),
  // Código para que los profesores se unan al colegio. Único.
  joinCode: text('join_code').notNull().unique(),
  // Dominio de correo del colegio (ej: 'colegiosanjose.cl', sin @, minúsculas).
  // Si alguien se registra con un correo de este dominio, se asocia
  // automáticamente al colegio. Único entre colegios (nullable: los colegios sin
  // dominio conviven, ya que Postgres permite múltiples NULL en una UNIQUE).
  dominio: text('dominio').unique(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const invitacionesColegio = pgTable('invitaciones_colegio', {
  id: serial('id').primaryKey(),
  colegioId: integer('colegio_id')
    .notNull()
    .references(() => colegios.id),
  email: text('email').notNull(),
  // Token único de la invitación (enlace por email).
  token: text('token').notNull().unique(),
  // Estado de la invitación: 'pendiente' | 'aceptada'.
  estado: text('estado').notNull().default('pendiente'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const preguntas = pgTable('preguntas', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  // Colegio dueño del contenido (nullable = contenido personal, sin colegio).
  // Se estampa al crear con el colegio del autor y ANCLA el contenido al
  // colegio: permanece en el banco aunque el autor sea suspendido/eliminado.
  colegioId: integer('colegio_id'),
  asignatura: text('asignatura').notNull(),
  materia: text('materia'),
  contenido: text('contenido'),
  nivel: text('nivel'),
  pregunta: text('pregunta').notNull(),
  A: text('A'),
  B: text('B'),
  C: text('C'),
  D: text('D'),
  E: text('E'),
  correcta: text('correcta'),
  explicacion: text('explicacion'),
  compartida: integer('compartida').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  imagenPregunta: text('imagen_pregunta'),
  imagenA: text('imagen_A'),
  imagenB: text('imagen_B'),
  imagenC: text('imagen_C'),
  imagenD: text('imagen_D'),
  imagenE: text('imagen_E'),
  tipo: text('tipo').default('seleccion_multiple'),
  textoId: integer('texto_id'),
  // Tamaño de las imágenes de la pregunta en el PDF impreso:
  // 'chico' | 'mediano' | 'grande'. Aplica al enunciado y a las alternativas.
  imagenTamano: text('imagen_tamano').notNull().default('mediano'),
})

export const textos = pgTable('textos', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  // Colegio dueño del contenido (nullable). Ver nota en `preguntas.colegioId`.
  colegioId: integer('colegio_id'),
  asignatura: text('asignatura').notNull(),
  titulo: text('titulo').notNull(),
  contenido: text('contenido').notNull(),
  compartida: integer('compartida').default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

// ---------------------------------------------------------------------------
// Pruebas guardadas ("Mis Pruebas"). Persisten la configuración de una prueba
// (encabezado + selección ordenada de preguntas/textos + fórmulas) para poder
// listarla, editarla y regenerar su PDF. El PDF generado se cachea en Blob
// (`pdfKey`); al editar la prueba se invalida (se borra el blob y se pone a
// NULL) para que el PDF descargable siempre coincida con el contenido guardado.
// `userId` es un entero sin FK formal, igual que en `preguntas`/`textos`.
// ---------------------------------------------------------------------------

export const pruebas = pgTable('pruebas', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  // Colegio dueño de la prueba (nullable). Ver nota en `preguntas.colegioId`.
  colegioId: integer('colegio_id'),
  asignatura: text('asignatura').notNull(),
  titulo: text('titulo'),
  colegio: text('colegio'),
  profesor: text('profesor'),
  instrucciones: text('instrucciones'),
  // Expresiones LaTeX del formulario.
  formulas: jsonb('formulas').$type<string[]>().notNull().default([]),
  // IDs de preguntas sueltas seleccionadas — el ORDEN importa (orden del PDF).
  preguntasIds: jsonb('preguntas_ids').$type<number[]>().notNull().default([]),
  // IDs de textos de comprensión seleccionados.
  textosIds: jsonb('textos_ids').$type<number[]>().notNull().default([]),
  // Clave de blob del logo PROPIO de la prueba (nullable). Si está, tiene
  // prioridad sobre el logo del colegio.
  logo: text('logo'),
  // Si true (default), el PDF incluye el logo del colegio cuando la prueba no
  // tiene logo propio. El profesor puede desmarcarlo para no llevar logo.
  usarLogoColegio: boolean('usar_logo_colegio').notNull().default(true),
  // Clave de blob del PDF cacheado (NULL = sin PDF o invalidado).
  pdfKey: text('pdf_key'),
  pdfGeneradoEn: timestamp('pdf_generado_en'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const colaboraciones = pgTable(
  'colaboraciones',
  {
    fromUserId: integer('from_user_id').notNull(),
    toUserId: integer('to_user_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.fromUserId, t.toUserId] })],
)

// ---------------------------------------------------------------------------
// Tablas de better-auth (Task 1.2).
// Nombres de campo confirmados contra la doc vigente
// (better-auth.com/docs/concepts/database). IDs numéricos porque la config
// usará advanced.database.useNumberId = true (Task 2.1), por eso `serial` y
// `userId` como integer apuntando a usuarios.id.
// ---------------------------------------------------------------------------

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const verifications = pgTable('verifications', {
  id: serial('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})
