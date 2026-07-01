import path from 'node:path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

/**
 * Aplica las migraciones pendientes de Drizzle contra `DATABASE_URL`. Es
 * idempotente: drizzle registra las migraciones aplicadas en la tabla
 * `__drizzle_migrations`, así que en cada arranque sólo corre lo que falte.
 *
 * Se ejecuta en el arranque del servidor (ver `instrumentation.ts`), donde el
 * proceso ya tiene la misma conexión y credenciales que usa la app (en Azure,
 * `DATABASE_URL` viene de Key Vault) — sin depender del firewall ni de secretos
 * extra en el pipeline de CI. Usa una conexión propia con `max: 1` que se cierra
 * al terminar para no retener el pool.
 */
export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.warn('[migrate] DATABASE_URL no definida; se omiten las migraciones.')
    return
  }

  // La carpeta `drizzle/` (SQL + meta/_journal.json) viaja junto al bundle: en
  // el standalone se copia a la raíz de ejecución (cwd), y en dev vive en web/.
  const migrationsFolder = path.join(process.cwd(), 'drizzle')

  const client = postgres(url, { max: 1, prepare: false })
  try {
    await migrate(drizzle(client), { migrationsFolder })
    console.log('[migrate] migraciones al día.')
  } finally {
    await client.end({ timeout: 5 })
  }
}
