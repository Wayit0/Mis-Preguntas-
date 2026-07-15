import { procesarEventoMp, validarFirmaMp } from '@/lib/suscripciones/webhook'

export const runtime = 'nodejs'

/**
 * Webhook de MercadoPago (suscripciones). MP reintenta ante respuestas no-2xx,
 * así que: firma inválida → 401 (no reintentable con otra firma igual da
 * igual), error de proceso → 500 (queremos el reintento). El tipo y data.id
 * llegan por query string y/o cuerpo según el evento; se aceptan ambos.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  const body = (await request.json().catch(() => null)) as {
    type?: string
    data?: { id?: string | number }
  } | null

  const dataId = url.searchParams.get('data.id') ?? String(body?.data?.id ?? '')
  const tipo = url.searchParams.get('type') ?? body?.type ?? ''
  if (!dataId || !tipo) return Response.json({ ok: true })

  const secret = process.env.MP_WEBHOOK_SECRET
  if (secret) {
    const ok = validarFirmaMp({
      xSignature: request.headers.get('x-signature'),
      xRequestId: request.headers.get('x-request-id'),
      dataId: dataId.toLowerCase(),
      secret,
    })
    if (!ok) return new Response('Firma inválida', { status: 401 })
  }

  try {
    await procesarEventoMp(tipo, dataId)
  } catch (err) {
    console.error('[mp-webhook] error procesando evento:', err)
    return new Response('Error', { status: 500 })
  }
  return Response.json({ ok: true })
}
