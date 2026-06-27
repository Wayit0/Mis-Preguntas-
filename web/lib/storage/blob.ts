import { randomUUID } from 'node:crypto'
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob'

const DEFAULT_CONTAINER = 'uploads'

/** Extensiones por tipo MIME, usadas cuando el nombre de archivo no trae extensión. */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
}

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

/** Deriva la extensión del archivo desde su nombre y, en su defecto, desde el MIME. */
function extension(file: File): string {
  const name = file.name ?? ''
  const dot = name.lastIndexOf('.')
  if (dot !== -1 && dot < name.length - 1) {
    return name.slice(dot + 1).toLowerCase()
  }
  const fromType = MIME_EXT[file.type]
  if (fromType) return fromType
  return 'bin'
}

/**
 * Sube una imagen al contenedor Blob con una clave única `uuid.ext`.
 * Retorna la clave del blob (lo que se persiste en la base de datos).
 */
export async function uploadImage(file: File): Promise<string> {
  const container = await getContainerClient()
  const key = `${randomUUID()}.${extension(file)}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const blockBlob = container.getBlockBlobClient(key)
  await blockBlob.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: file.type || 'application/octet-stream' },
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
