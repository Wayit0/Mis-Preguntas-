import { randomUUID } from 'node:crypto'
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob'

const DEFAULT_CONTAINER = 'uploads'

/**
 * Tipos de imagen permitidos al subir. SOLO formatos ráster: se excluye
 * deliberadamente SVG (y cualquier HTML/XML), porque pueden contener `<script>`
 * y provocar XSS persistente al servirse inline. La clave es la extensión y el
 * content-type canónico (no se confía en el content-type que envía el cliente).
 */
const ALLOWED_IMAGE: Record<string, { ext: string; type: string }> = {
  'image/jpeg': { ext: 'jpg', type: 'image/jpeg' },
  'image/png': { ext: 'png', type: 'image/png' },
  'image/gif': { ext: 'gif', type: 'image/gif' },
  'image/webp': { ext: 'webp', type: 'image/webp' },
}

/** Extensión (lower) → content-type permitido, para validar por nombre de archivo. */
const EXT_TO_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
}

/** Content-types que es seguro servir inline (ráster, sin capacidad de script). */
const SAFE_IMAGE_TYPES = new Set(Object.keys(ALLOWED_IMAGE))

/** Resultado de descargar un blob: stream legible (Node) + su content-type. */
export interface ImageStream {
  stream: NodeJS.ReadableStream
  contentType: string
}

/**
 * Promesa cacheada del ContainerClient. Se inicializa de forma perezosa en la
 * primera operación y se reutiliza después. Si la inicialización falla, se
 * limpia para permitir reintentos.
 */
let containerClientPromise: Promise<ContainerClient> | null = null

/**
 * Obtiene (creando si hace falta) el contenedor de Blob configurado.
 * Lee la cadena de conexión y el contenedor desde el entorno.
 * Lanza un error claro si falta la configuración.
 */
async function getContainerClient(): Promise<ContainerClient> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!connectionString) {
    throw new Error(
      'AZURE_STORAGE_CONNECTION_STRING no está configurada. ' +
        'Define la cadena de conexión de Azure Blob Storage para subir o servir imágenes.',
    )
  }

  if (containerClientPromise) return containerClientPromise

  const containerName = process.env.BLOB_CONTAINER || DEFAULT_CONTAINER
  const promise = (async () => {
    const service = BlobServiceClient.fromConnectionString(connectionString)
    const container = service.getContainerClient(containerName)
    await container.createIfNotExists()
    return container
  })()

  containerClientPromise = promise
  // Si la inicialización falla, no cachear la promesa rechazada.
  promise.catch(() => {
    if (containerClientPromise === promise) containerClientPromise = null
  })

  return promise
}

/**
 * Resuelve el formato permitido de un archivo (ext + content-type canónico).
 * Valida primero por el content-type declarado; si falta, cae al de la extensión.
 * Lanza si el tipo no está en la whitelist (p. ej. SVG, HTML, PDF…).
 */
function resolveAllowedImage(file: File): { ext: string; type: string } {
  const declared = (file.type || '').toLowerCase()
  if (ALLOWED_IMAGE[declared]) return ALLOWED_IMAGE[declared]

  const name = file.name ?? ''
  const dot = name.lastIndexOf('.')
  const ext = dot !== -1 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : ''
  const typeFromExt = EXT_TO_TYPE[ext]
  if (typeFromExt && ALLOWED_IMAGE[typeFromExt]) return ALLOWED_IMAGE[typeFromExt]

  throw new Error('Tipo de imagen no permitido. Usa PNG, JPG, GIF o WEBP.')
}

/**
 * Sube una imagen al contenedor Blob con una clave única `uuid.ext`.
 * Solo acepta formatos ráster de la whitelist (rechaza SVG/HTML, etc.) y
 * persiste un content-type canónico (no el que envía el cliente).
 * Retorna la clave del blob (lo que se persiste en la base de datos).
 */
export async function uploadImage(file: File): Promise<string> {
  // Validar ANTES de tocar Azure: una subida inválida no debe crear recursos.
  const { ext, type } = resolveAllowedImage(file)
  const container = await getContainerClient()
  const key = `${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const blockBlob = container.getBlockBlobClient(key)
  await blockBlob.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: type },
  })
  return key
}

/**
 * Descarga un blob por su clave. Retorna el stream y su content-type, o `null`
 * si el blob no existe.
 */
export async function getImageStream(key: string): Promise<ImageStream | null> {
  const container = await getContainerClient()
  const blockBlob = container.getBlockBlobClient(key)
  if (!(await blockBlob.exists())) return null
  const response = await blockBlob.download()
  if (!response.readableStreamBody) return null
  return {
    stream: response.readableStreamBody,
    contentType: response.contentType ?? 'application/octet-stream',
  }
}

/** URL interna para servir una imagen a través de la route con control de acceso. */
export function imageUrl(key: string): string {
  return `/api/uploads/${key}`
}

/**
 * Cabeceras seguras para servir un blob almacenado. Defensa en profundidad
 * contra XSS por contenido subido por usuarios:
 * - solo se sirven inline los content-types ráster de la whitelist; cualquier
 *   otro (p. ej. un SVG/HTML antiguo) se degrada a `application/octet-stream`
 *   + `attachment` para que el navegador lo descargue en vez de renderizarlo;
 * - `X-Content-Type-Options: nosniff` evita el MIME-sniffing;
 * - CSP `default-src 'none'; sandbox` neutraliza scripts si se navega directo.
 */
export function safeImageResponseHeaders(contentType: string): Record<string, string> {
  const safe = SAFE_IMAGE_TYPES.has((contentType || '').toLowerCase())
  return {
    'Content-Type': safe ? contentType : 'application/octet-stream',
    'Content-Disposition': safe ? 'inline' : 'attachment',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, max-age=3600',
  }
}
