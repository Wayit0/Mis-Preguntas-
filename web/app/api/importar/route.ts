import { getSession } from '@/lib/get-session'
import { analizarArchivo, type ResultadoAnalisis } from '@/lib/import/analizar'
import { cuotaImportaciones } from '@/lib/suscripciones/entitlements'

export const runtime = 'nodejs'

/**
 * Analiza un documento con la IA y responde en STREAMING (ndjson): mientras el
 * análisis corre, emite líneas `{"ping":true}` cada pocos segundos y, al
 * terminar, una línea final `{"resultado":{...}}`.
 *
 * ¿Por qué streaming y no una server action? El front-end de Azure App Service
 * corta cualquier petición sin tráfico a los ~230 s, y un documento largo con
 * Opus puede tardar más que eso: al profesor le aparecía
 * `net::ERR_CONNECTION_CLOSED` con el análisis aún corriendo. Cada ping
 * reinicia ese timer de inactividad, así que la conexión sobrevive lo que dure
 * el análisis.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return new Response('No autorizado', { status: 401 })
  const userId = Number(session.user.id)

  // Cuota de importaciones IA del plan (free 3/mes, pro 100/mes). Se corta
  // ANTES de gastar tokens. La respuesta usa la misma forma {resultado} que el
  // stream para que el cliente la procese sin caso especial.
  const cuota = await cuotaImportaciones(userId)
  if (cuota.restantes <= 0) {
    const resultado: ResultadoAnalisis = {
      ok: false,
      sinCupo: true,
      error: `Alcanzaste tus ${cuota.limite} importaciones con IA de este mes.`,
    }
    return Response.json({ resultado })
  }

  const form = await request.formData()
  const archivo = form.get('archivo')
  const asignatura = (form.get('asignatura') ?? '').toString().trim()

  if (!(archivo instanceof File)) {
    return new Response('Sube un documento (PDF, DOCX o imagen).', {
      status: 400,
    })
  }

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
        const resultado = await analizarArchivo(archivo, asignatura, userId)
        enviar({ resultado })
      } catch (err) {
        console.error('[importar] error no controlado en la ruta:', err)
        const resultado: ResultadoAnalisis = {
          ok: false,
          error: 'Ocurrió un error al analizar el documento. Inténtalo de nuevo.',
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
      // Pistas anti-buffering para proxies intermedios: cada ping debe salir
      // al instante o no reinicia el timer de inactividad.
      'X-Accel-Buffering': 'no',
    },
  })
}
