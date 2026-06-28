import { eq, isNull } from 'drizzle-orm'
import { usuarios, accounts } from '@/lib/db/schema'
import { LEGACY } from '@/lib/auth-password'
// Import SÓLO de tipo: `typeof db` se borra en compilación, de modo que este
// módulo NO abre una conexión a Postgres al importarse. Eso permite que el test
// unitario de `legacyAccountRow` corra sin DATABASE_URL ni base de datos.
import type { db } from '@/lib/db'

type Database = typeof db

/**
 * Forma mínima de un usuario migrado desde el origen (Render/SQLite).
 * `password_hash` es el SHA-256 hex SIN sal del MVP (sin prefijo).
 */
export interface LegacyUsuario {
  id: number
  email: string
  password_hash: string | null
}

/**
 * Fila a insertar en `accounts` para el provider `credential` de better-auth.
 * Compatible con el esquema Drizzle (`accounts`) y con el verificador de
 * contraseñas (`web/lib/auth-password.ts`), que entiende el prefijo
 * `legacy-sha256:` y re-hashea a scrypt en el primer login exitoso.
 */
export interface LegacyAccountRow {
  userId: number
  accountId: string
  providerId: 'credential'
  password: string
}

/**
 * Construye la fila `accounts` legacy para un usuario migrado.
 *
 * - `userId`     → id entero del usuario (FK a `usuarios.id`).
 * - `accountId`  → el id del usuario como string. better-auth usa el id del
 *                  usuario como `accountId` del provider `credential`, así que un
 *                  account migrado queda indistinguible de uno creado nativamente
 *                  por signUp (el `email` queda disponible vía `usuarios.email`).
 * - `providerId` → 'credential' (login email/contraseña).
 * - `password`   → `legacy-sha256:<hash>`; el verificador lo reconoce, valida el
 *                  SHA-256 y re-hashea a scrypt al primer login.
 */
export function legacyAccountRow(usuario: LegacyUsuario): LegacyAccountRow {
  return {
    userId: usuario.id,
    accountId: String(usuario.id),
    providerId: 'credential',
    password: LEGACY + (usuario.password_hash ?? ''),
  }
}

export interface BackfillResult {
  /** Cuántas filas `accounts` legacy se insertaron en esta corrida. */
  inserted: number
  /** Usuarios omitidos (ya tenían account credential o no tenían hash). */
  skipped: number
}

/**
 * Backfill idempotente de `accounts` con marcador legacy.
 *
 * Por cada usuario que NO tenga ya un account con `providerId = 'credential'`,
 * inserta su fila legacy. Es idempotente: una segunda corrida no duplica porque
 * los accounts recién creados ya cuentan como "con credential". Los usuarios sin
 * `password_hash` (p. ej. creados nativamente vía signUp, que ya tienen su
 * account scrypt) se omiten: no hay hash legacy que respaldar.
 */
export async function backfillAccounts(
  database: Database,
): Promise<BackfillResult> {
  // 1. userIds que ya tienen un account 'credential' (nativo o de un backfill
  //    previo). Se usan como filtro para garantizar idempotencia.
  const conCredential = await database
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(eq(accounts.providerId, 'credential'))
  const yaConCredential = new Set(conCredential.map((r) => r.userId))

  // 2. Todos los usuarios con su hash legacy.
  const todos = await database
    .select({
      id: usuarios.id,
      email: usuarios.email,
      passwordHash: usuarios.passwordHash,
    })
    .from(usuarios)

  let skipped = 0
  const filas: LegacyAccountRow[] = []
  for (const u of todos) {
    if (yaConCredential.has(u.id)) {
      skipped++
      continue
    }
    if (!u.passwordHash) {
      // Sin hash legacy: nada que respaldar (no creamos un credential vacío que
      // jamás podría validar).
      skipped++
      continue
    }
    filas.push(
      legacyAccountRow({
        id: u.id,
        email: u.email,
        password_hash: u.passwordHash,
      }),
    )
  }

  if (filas.length > 0) {
    await database.insert(accounts).values(filas)
  }

  return { inserted: filas.length, skipped }
}

export interface BackfillRolesResult {
  /** Cuántas filas `usuarios` recibieron role='teacher' en esta corrida. */
  updated: number
}

/**
 * Backfill idempotente del rol por defecto.
 *
 * Pone `role = 'teacher'` en todo usuario cuyo `role` sea NULL. Es DEFENSA: la
 * columna ya nace NOT NULL con default 'teacher' (la migración rellena las filas
 * previas), así que en condiciones normales no hay filas que actualizar y esta
 * función no toca nada. NO modifica `colegio_id` (las cuentas existentes siguen
 * siendo personales hasta que un admin las asigne a un colegio).
 *
 * Idempotente: una segunda corrida no encuentra roles NULL y devuelve 0.
 */
export async function backfillRoles(
  database: Database,
): Promise<BackfillRolesResult> {
  const actualizados = await database
    .update(usuarios)
    .set({ role: 'teacher' })
    .where(isNull(usuarios.role))
    .returning({ id: usuarios.id })

  return { updated: actualizados.length }
}
