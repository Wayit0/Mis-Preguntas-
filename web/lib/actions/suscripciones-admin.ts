'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { colegios, suscripciones, usuarios } from '@/lib/db/schema'
import { getActor } from '@/lib/authz'
import { esProSuscripcion } from '@/lib/suscripciones/entitlements'
import { mpCancelarPreapproval } from '@/lib/suscripciones/mercadopago'
import { sincronizarPreapproval } from '@/lib/suscripciones/sync'

export type ResultadoAdmin = { error: string } | { ok: true }

async function requireGlobalAdmin() {
  const actor = await getActor()
  if (!actor || actor.role !== 'global_admin') return null
  return actor
}

/** Pro de cortesía: sin cobro, con vencimiento y nota. Busca al usuario por email. */
export async function concederCortesia(
  email: string,
  hastaISO: string,
  nota: string,
): Promise<ResultadoAdmin> {
  if (!(await requireGlobalAdmin())) return { error: 'No autorizado.' }

  const hasta = new Date(hastaISO)
  if (Number.isNaN(hasta.getTime()) || hasta <= new Date()) {
    return { error: 'La fecha de vencimiento debe ser futura.' }
  }
  const [u] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.email, email.trim().toLowerCase()))
    .limit(1)
  if (!u) return { error: 'No existe un usuario con ese correo.' }

  const [existente] = await db
    .select()
    .from(suscripciones)
    .where(eq(suscripciones.userId, u.id))
    .limit(1)
  if (existente && existente.origen === 'mercadopago' && esProSuscripcion(existente)) {
    return { error: 'El usuario ya tiene una suscripción de MercadoPago vigente.' }
  }

  const valores = {
    origen: 'cortesia' as const,
    periodicidad: null,
    estado: 'activa' as const,
    mpPreapprovalId: null,
    trialTerminaEl: null,
    periodoHasta: hasta,
    nota: nota.trim() || null,
    updatedAt: new Date(),
  }
  await db
    .insert(suscripciones)
    .values({ userId: u.id, ...valores })
    .onConflictDoUpdate({ target: suscripciones.userId, set: valores })
  revalidatePath('/admin')
  return { ok: true }
}

/** Cancela la suscripción de un usuario (reclamos/fraude). */
export async function cancelarSuscripcionDeUsuario(userId: number): Promise<ResultadoAdmin> {
  if (!(await requireGlobalAdmin())) return { error: 'No autorizado.' }

  const [s] = await db
    .select()
    .from(suscripciones)
    .where(eq(suscripciones.userId, userId))
    .limit(1)
  if (!s) return { error: 'El usuario no tiene suscripción.' }

  if (s.origen === 'mercadopago' && s.mpPreapprovalId) {
    try {
      const pre = await mpCancelarPreapproval(s.mpPreapprovalId)
      await sincronizarPreapproval({ ...pre, external_reference: String(userId) })
    } catch (err) {
      console.error('[admin-subs] error cancelando en MP:', err)
      return { error: 'MercadoPago rechazó la cancelación. Revisa el panel de MP.' }
    }
  } else {
    // Cortesía: termina de inmediato.
    await db
      .update(suscripciones)
      .set({ estado: 'cancelada', periodoHasta: new Date(), updatedAt: new Date() })
      .where(eq(suscripciones.id, s.id))
  }
  revalidatePath('/admin')
  return { ok: true }
}

/** Activa/extiende (hastaISO) o corta (null) la licencia B2B de un colegio. */
export async function fijarLicenciaColegio(
  colegioId: number,
  hastaISO: string | null,
  nota: string,
): Promise<ResultadoAdmin> {
  if (!(await requireGlobalAdmin())) return { error: 'No autorizado.' }

  let hasta: Date | null = null
  if (hastaISO != null) {
    hasta = new Date(hastaISO)
    if (Number.isNaN(hasta.getTime())) return { error: 'Fecha no válida.' }
  }
  const [c] = await db.select().from(colegios).where(eq(colegios.id, colegioId)).limit(1)
  if (!c) return { error: 'El colegio no existe.' }

  await db
    .update(colegios)
    .set({ licenciaHasta: hasta, licenciaNota: nota.trim() || null })
    .where(eq(colegios.id, colegioId))
  revalidatePath('/admin')
  return { ok: true }
}
