import { getSession } from '@/lib/get-session'
import { ejecutarGeneracion } from '@/lib/generar/core'
import { crearBorrador } from '@/lib/import/borradores'
import { cuotaGeneraciones } from '@/lib/suscripciones/entitlements'
import {
  generarParamsSchema,
  type ResultadoGeneracion,
} from '@/lib/validation/generar'

export const runtime = 'nodejs'

/**
 * Genera preguntas con la IA y responde en STREAMING ndjson: pings
 * `{"ping":true}` cada 8 s y una línea final `{"resultado":{...}}`. Mismo
 * patrón (y misma razón) que /api/importar: el front-end de Azure corta
 * peticiones sin tráfico a los ~230 s.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return new Response('No autorizado', { status: 401 })
  const userId = Number(session.user.id)

  // Cuota mensual (free 5 / pro 100). Se corta ANTES de gastar tokens, con la
  // misma forma {resultado} del stream para que el cliente no tenga caso especial.
  const cuota = await cuotaGeneraciones(userId)
  if (cuota.restantes <= 0) {
    const resultado: ResultadoGeneracion = {
      ok: false,
      sinCupo: true,
      error: `Alcanzaste tus ${cuota.limite} generaciones con IA de este mes.`,
    }
    return Response.json({ resultado })
  }

  const body = await request.json().catch(() => null)
  const parsed = generarParamsSchema.safeParse(body)
  if (!parsed.success) {
    const resultado: ResultadoGeneracion = {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? 'Parámetros de generación no válidos.',
    }
    return Response.json({ resultado })
  }
  const params = parsed.data

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))

      const ping = setInterval(() => {
        try {
          enviar({ ping: true })
        } catch {
          // El cliente cerró: el clearInterval del finally lo limpia.
        }
      }, 8000)

      try {
        const resultado = await ejecutarGeneracion(params, userId)
        // Borrador retomable (best-effort), igual que /importar.
        if (resultado.ok) {
          try {
            resultado.borradorId = await crearBorrador(userId, {
              asignatura: params.asignatura,
              nombreArchivo: params.tema,
              resultado: { preguntas: resultado.preguntas, imagenes: [] },
              origen: 'generar',
            })
          } catch (err) {
            console.error('[generar] no se pudo crear el borrador:', err)
          }
        }
        enviar({ resultado })
      } catch (err) {
        console.error('[generar] error no controlado en la ruta:', err)
        const resultado: ResultadoGeneracion = {
          ok: false,
          error: 'Ocurrió un error al generar las preguntas. Inténtalo de nuevo.',
        }
        enviar({ resultado })
      } finally {
        clearInterval(ping)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      // Pistas anti-buffering: cada ping debe salir al instante.
      'X-Accel-Buffering': 'no',
    },
  })
}
