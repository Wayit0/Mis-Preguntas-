import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  mpObtenerPagoAutorizado,
  mpObtenerPreapproval,
} from '@/lib/suscripciones/mercadopago'
import {
  registrarPagoAutorizado,
  sincronizarPreapproval,
} from '@/lib/suscripciones/sync'

/**
 * Valida el header x-signature de MercadoPago (`ts=...,v1=...`):
 * v1 = HMAC-SHA256(secret, `id:{data.id};request-id:{x-request-id};ts:{ts};`).
 */
export function validarFirmaMp(opts: {
  xSignature: string | null
  xRequestId: string | null
  dataId: string
  secret: string
}): boolean {
  const { xSignature, xRequestId, dataId, secret } = opts
  if (!xSignature) return false
  const partes = new Map(
    xSignature
      .split(',')
      .map((p) => p.split('=', 2).map((s) => s.trim()) as [string, string])
      .filter((p) => p.length === 2 && p[0] && p[1]),
  )
  const ts = partes.get('ts')
  const v1 = partes.get('v1')
  if (!ts || !v1) return false
  const manifest = `id:${dataId};request-id:${xRequestId ?? ''};ts:${ts};`
  const esperado = createHmac('sha256', secret).update(manifest).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(esperado), Buffer.from(v1))
  } catch {
    return false
  }
}

/**
 * Procesa una notificación: consulta la entidad real en MP (nunca confía en el
 * cuerpo del webhook) y sincroniza. `deps` permite inyectar fakes en tests.
 */
export async function procesarEventoMp(
  tipo: string,
  dataId: string,
  deps = {
    obtenerPreapproval: mpObtenerPreapproval,
    obtenerPagoAutorizado: mpObtenerPagoAutorizado,
  },
): Promise<void> {
  if (tipo === 'subscription_preapproval') {
    await sincronizarPreapproval(await deps.obtenerPreapproval(dataId))
  } else if (tipo === 'subscription_authorized_payment') {
    await registrarPagoAutorizado(await deps.obtenerPagoAutorizado(dataId))
  }
  // Otros tipos (payment, plan) se ignoran a propósito.
}
