/**
 * Promueve al usuario con email `ADMIN_EMAIL` a role='global_admin'.
 *
 * Para correr MANUALMENTE en el deploy (NO ejecutar contra prod desde aquí).
 * Idempotente: si el usuario ya es global_admin, el UPDATE no cambia nada y el
 * script lo reporta. No crea el usuario: éste debe existir (haberse registrado
 * antes vía la app).
 *
 *   DATABASE_URL=postgres://...sslmode=require \
 *   ADMIN_EMAIL=admin@colegio.cl \
 *     pnpm dlx tsx scripts/seed-global-admin.ts
 */
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'

const email = process.env.ADMIN_EMAIL
if (!email) {
  console.error('ADMIN_EMAIL no está definido. Aborto.')
  process.exit(1)
}

const actualizados = await db
  .update(usuarios)
  .set({ role: 'global_admin' })
  .where(eq(usuarios.email, email))
  .returning({ id: usuarios.id, email: usuarios.email, role: usuarios.role })

if (actualizados.length === 0) {
  console.error(
    `No existe ningún usuario con email ${email}. Debe registrarse primero.`,
  )
  process.exit(1)
}

console.log(
  `usuario ${actualizados[0].email} (id ${actualizados[0].id}) -> role=${actualizados[0].role}`,
)
process.exit(0)
