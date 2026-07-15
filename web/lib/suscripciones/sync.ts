import { eq, isNull, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pagosSuscripcion, suscripciones, usuarios } from '@/lib/db/schema'
import type { MpPagoAutorizado, MpPreapproval } from '@/lib/suscripciones/mercadopago'

// ---------------------------------------------------------------------------
// La fila de `suscripciones` es un CACHE del preapproval en MercadoPago. Estas
// funciones son el ÚNICO punto que escribe estado desde MP (webhook y
// reconciliación llaman aquí), así el mapeo vive en un solo lugar.
// ---------------------------------------------------------------------------

export type EstadoSuscripcion = 'pendiente' | 'trial' | 'activa' | 'morosa' | 'cancelada'

export function estadoDesdeMp(
  status: MpPreapproval['status'],
  trialTerminaEl: Date | null,
  ahora = new Date(),
): EstadoSuscripcion {
  if (status === 'authorized') {
    return trialTerminaEl && ahora < trialTerminaEl ? 'trial' : 'activa'
  }
  if (status === 'paused') return 'morosa'
  if (status === 'cancelled') return 'cancelada'
  return 'pendiente'
}

export async function sincronizarPreapproval(pre: MpPreapproval): Promise<void> {
  const [fila] = await db
    .select()
    .from(suscripciones)
    .where(eq(suscripciones.mpPreapprovalId, pre.id))
    .limit(1)

  let userId = fila?.userId ?? null
  if (userId == null) {
    const ref = Number(pre.external_reference)
    if (Number.isFinite(ref) && ref > 0) userId = ref
  }
  if (userId == null) {
    console.warn(`[suscripciones] preapproval ${pre.id} sin usuario resoluble; se ignora`)
    return
  }

  const ahora = new Date()
  const trialTerminaEl =
    fila?.trialTerminaEl ??
    (pre.auto_recurring?.start_date ? new Date(pre.auto_recurring.start_date) : null)
  const estado = estadoDesdeMp(pre.status, trialTerminaEl, ahora)
  const valores = {
    origen: 'mercadopago' as const,
    estado,
    periodicidad: pre.auto_recurring?.frequency === 12 ? 'anual' : 'mensual',
    mpPreapprovalId: pre.id,
    trialTerminaEl,
    periodoHasta: pre.next_payment_date
      ? new Date(pre.next_payment_date)
      : (fila?.periodoHasta ?? null),
    updatedAt: ahora,
  }

  if (fila) {
    await db.update(suscripciones).set(valores).where(eq(suscripciones.id, fila.id))
  } else {
    // onConflict por user_id: si el usuario ya tenía otra fila (p. ej. una
    // cortesía vencida o un checkout anterior), la suscripción de MP la pisa.
    await db
      .insert(suscripciones)
      .values({ userId, ...valores })
      .onConflictDoUpdate({ target: suscripciones.userId, set: valores })
  }

  // Candado un-trial-por-vida: se quema cuando MP autoriza un trial.
  if (estado === 'trial') {
    await db
      .update(usuarios)
      .set({ trialUsadoEl: ahora })
      .where(and(eq(usuarios.id, userId), isNull(usuarios.trialUsadoEl)))
  }
}

export async function registrarPagoAutorizado(pago: MpPagoAutorizado): Promise<void> {
  const [s] = await db
    .select()
    .from(suscripciones)
    .where(eq(suscripciones.mpPreapprovalId, pago.preapproval_id))
    .limit(1)
  if (!s) {
    console.warn(`[suscripciones] pago ${pago.id} de preapproval desconocido ${pago.preapproval_id}`)
    return
  }

  await db
    .insert(pagosSuscripcion)
    .values({
      userId: s.userId,
      suscripcionId: s.id,
      mpPaymentId: String(pago.id),
      montoClp: Math.round(pago.transaction_amount ?? 0),
      estado: pago.status ?? 'desconocido',
      detalle: { status_detail: pago.payment?.status_detail ?? null },
    })
    .onConflictDoNothing({ target: pagosSuscripcion.mpPaymentId })

  const ahora = new Date()
  if (pago.status === 'rejected' && (s.estado === 'activa' || s.estado === 'trial')) {
    await db
      .update(suscripciones)
      .set({ estado: 'morosa', updatedAt: ahora })
      .where(eq(suscripciones.id, s.id))
  } else if (pago.status === 'approved' && s.estado !== 'cancelada') {
    await db
      .update(suscripciones)
      .set({ estado: 'activa', updatedAt: ahora })
      .where(eq(suscripciones.id, s.id))
  }
}
