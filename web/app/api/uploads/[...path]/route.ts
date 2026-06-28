import { Readable } from 'node:stream'
import { getSession } from '@/lib/get-session'
import { getImageStream, safeImageResponseHeaders } from '@/lib/storage/blob'
import { puedeVerImagen } from '@/lib/queries/uploads'

export const runtime = 'nodejs'

/**
 * Sirve imágenes desde Azure Blob con control de acceso.
 * Requiere sesión (401 si no la hay) y autorización por dueño/colaborador
 * (404 si la imagen no es del usuario ni le fue compartida, sin revelar su
 * existencia). La clave del blob se arma desde el catch-all `[...path]`.
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

  // Autorización: solo el dueño o un colaborador con acceso compartido.
  const userId = Number(session.user.id)
  if (!Number.isFinite(userId) || !(await puedeVerImagen(key, userId))) {
    return new Response('No encontrado', { status: 404 })
  }

  const image = await getImageStream(key)
  if (!image) {
    return new Response('No encontrado', { status: 404 })
  }

  const body = Readable.toWeb(
    image.stream as unknown as Readable,
  ) as unknown as ReadableStream<Uint8Array>

  return new Response(body, {
    headers: safeImageResponseHeaders(image.contentType),
  })
}
