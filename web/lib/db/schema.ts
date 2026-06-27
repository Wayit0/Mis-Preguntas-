import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
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
})

export const preguntas = pgTable('preguntas', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
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
})

export const textos = pgTable('textos', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  asignatura: text('asignatura').notNull(),
  titulo: text('titulo').notNull(),
  contenido: text('contenido').notNull(),
  compartida: integer('compartida').default(0),
  createdAt: timestamp('created_at').defaultNow(),
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
