'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { suscripciones, usuarios } from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'
import { esProSuscripcion } from '@/lib/suscripciones/entitlements'
import {
  mpCancelarPreapproval,
  mpCrearPreapproval,
  mpHabilitado,
  mpObtenerPreapproval,
  type Periodicidad,
} from '@/lib/suscripciones/mercadopago'
import { sincronizarPreapproval } from '@/lib/suscripciones/sync'
import { suscripcionDeUsuario } from '@/lib/queries/suscripciones'

export type ResultadoInicio = { error: string } | { initPoint: string }
export type ResultadoCancelar = { error: string } | { ok: true }

async function usuarioActual() {
  const session = await getSession()
  if (!session) return null
  return Number(session.user.id)
}

/** Crea el preapproval en MP y devuelve el init_point para redirigir. */
export async function iniciarSuscripcion(
  periodicidad: Periodicidad,
): Promise<ResultadoInicio> {
  const userId = await usuarioActual()
  if (!userId) return { error: 'Debes iniciar sesión.' }
  if (periodicidad !== 'mensual' && periodicidad !== 'anual') {
    return { error: 'Periodicidad no válida.' }
  }
  if (!mpHabilitado()) {
    return { error: 'Los pagos aún no están habilitados. Escríbenos a contacto@edubox.cl.' }
  }

  const existente = await suscripcionDeUsuario(userId)
  if (existente && existente.estado !== 'cancelada' && esProSuscripcion(existente)) {
    return { error: 'Ya tienes EduBox Pro activo.' }
  }

  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, userId)).limit(1)
  if (!u) return { error: 'Usuario no encontrado.' }
  const conTrial = u.trialUsadoEl == null

  try {
    const pre = await mpCrearPreapproval({
      userId, email: u.email, periodicidad, conTrial,
    })
    if (!pre.init_point) return { error: 'MercadoPago no devolvió el checkout. Intenta de nuevo.' }

    const valores = {
      origen: 'mercadopago' as const,
      periodicidad,
      estado: 'pendiente' as const,
      mpPreapprovalId: pre.id,
      trialTerminaEl: pre.auto_recurring?.start_date
        ? new Date(pre.auto_recurring.start_date)
        : null,
      updatedAt: new Date(),
    }
    await db
      .insert(suscripciones)
      .values({ userId, ...valores })
      .onConflictDoUpdate({ target: suscripciones.userId, set: valores })

    revalidatePath('/cuenta')
    return { initPoint: pre.init_point }
  } catch (err) {
    console.error('[suscripciones] error creando preapproval:', err)
    return { error: 'No pudimos iniciar la suscripción. Intenta de nuevo en unos minutos.' }
  }
}

/** Cancela en MP; el usuario conserva Pro hasta el fin del período pagado. */
export async function cancelarMiSuscripcion(): Promise<ResultadoCancelar> {
  const userId = await usuarioActual()
  if (!userId) return { error: 'Debes iniciar sesión.' }

  const s = await suscripcionDeUsuario(userId)
  if (!s || s.origen !== 'mercadopago' || !s.mpPreapprovalId) {
    return { error: 'No tienes una suscripción que cancelar.' }
  }
  if (s.estado === 'cancelada') return { error: 'Tu suscripción ya está cancelada.' }

  try {
    const pre = await mpCancelarPreapproval(s.mpPreapprovalId)
    await sincronizarPreapproval({ ...pre, external_reference: String(userId) })
    revalidatePath('/cuenta')
    return { ok: true }
  } catch (err) {
    console.error('[suscripciones] error cancelando:', err)
    return { error: 'No pudimos cancelar. Intenta de nuevo o escríbenos.' }
  }
}

/**
 * Reconciliación: re-consulta MP y sincroniza (red de seguridad si un webhook
 * se perdió). Se llama al cargar /cuenta cuando la fila lo amerita. Nunca lanza.
 */
export async function reconciliarMiSuscripcion(): Promise<void> {
  try {
    const userId = await usuarioActual()
    if (!userId) return
    const s = await suscripcionDeUsuario(userId)
    if (!s || s.origen !== 'mercadopago' || !s.mpPreapprovalId || !mpHabilitado()) return
    const pre = await mpObtenerPreapproval(s.mpPreapprovalId)
    await sincronizarPreapproval({ ...pre, external_reference: String(userId) })
  } catch (err) {
    console.warn('[suscripciones] reconciliación falló (se reintenta en la próxima carga):', err)
  }
}
