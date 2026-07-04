import { obtenerColegioPorUsuario } from '@/lib/queries/colegio'
import { getImageStream } from '@/lib/storage/blob'

/** Consume un stream de Node por completo y lo devuelve como Buffer. */
async function streamABuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/** Descarga un blob de imagen a Buffer por su clave, o null si no existe. */
async function blobABuffer(key: string): Promise<Buffer | null> {
  const blob = await getImageStream(key)
  return blob ? streamABuffer(blob.stream) : null
}

/**
 * Resuelve los bytes del logo para el PDF de una prueba, en este orden:
 *   1. logo PROPIO de la prueba (`customKey` o `customBuffer`), si existe;
 *   2. si `usarLogoColegio`, el logo del colegio del usuario;
 *   3. si no, sin logo (null).
 */
export async function resolverLogoPrueba(opts: {
  userId: number
  /** Clave de blob del logo propio guardado (pruebas.logo). */
  customKey?: string | null
  /** Bytes de un logo propio recién subido (flujo puntual sin persistir). */
  customBuffer?: Buffer | null
  usarLogoColegio: boolean
}): Promise<Buffer | null> {
  if (opts.customBuffer) return opts.customBuffer
  if (opts.customKey) {
    const propio = await blobABuffer(opts.customKey)
    if (propio) return propio
  }
  if (opts.usarLogoColegio) {
    const colegio = await obtenerColegioPorUsuario(opts.userId)
    if (colegio?.logo) return blobABuffer(colegio.logo)
  }
  return null
}
