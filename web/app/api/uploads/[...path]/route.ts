import { Readable } from 'node:stream'
import { getSession } from '@/lib/get-session'
import { getImageStream } from '@/lib/storage/blob'

export const runtime = 'nodejs'

/**
 * Sirve imágenes desde Azure Blob con control de acceso.
 * Requiere sesión (401 si no la hay). La clave del blob se arma desde el
 * catch-all `[...path]`. Hace proxy del stream con su content-type (404 si no existe).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const session = await getSession()
  if (!session) {
    return new Response('No autorizado', { status: 401 })
  }

  const { path } = await context.params
  const key = path.join('/')

  const image = await getImageStream(key)
  if (!image) {
    return new Response('No encontrado', { status: 404 })
  }

  const body = Readable.toWeb(
    image.stream as unknown as Readable,
  ) as unknown as ReadableStream<Uint8Array>

  return new Response(body, {
    headers: {
      'Content-Type': image.contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
