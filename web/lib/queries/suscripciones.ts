import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { suscripciones } from '@/lib/db/schema'
import type { Suscripcion } from '@/lib/suscripciones/entitlements'

export async function suscripcionDeUsuario(userId: number): Promise<Suscripcion | null> {
  const [s] = await db
    .select()
    .from(suscripciones)
    .where(eq(suscripciones.userId, userId))
    .limit(1)
  return s ?? null
}
