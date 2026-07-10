import mammoth from 'mammoth'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'

/**
 * Extracción de documentos para la importación con IA (Fase 7).
 *
 * Convierte un archivo subido (PDF, DOCX o imagen) en los *content blocks* de
 * la API de Anthropic, listos para incluirse en un mensaje de usuario en la
 * Fase 7.2. La función es **pura**: nunca llama al API: solo prepara los datos.
 *
 * Estrategia (aprovechar capacidades nativas de Claude en vez de OCR propio):
 *   - DOCX  → mammoth.convertToHtml → un bloque `text` (con marcadores
 *     `[IMAGEN_n]` donde había una imagen incrustada) + un bloque `image` por
 *     cada imagen soportada, para que la IA pueda asociarlas a la pregunta o
 *     alternativa que ilustran (ver `ImagenExtraida`/`DocumentoExtraido`).
 *   - PDF   → un bloque `document` en base64 (Claude lee el PDF nativamente).
 *   - Imagen → un bloque `image` en base64 (visión nativa de Claude).
 *
 * Referencia de comportamiento: extraer_texto_pdf / extraer_texto_docx /
 * extraer_texto_imagen en el `app.py` de Streamlit.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de content blocks (subconjunto compatible con @anthropic-ai/sdk)
// ─────────────────────────────────────────────────────────────────────────────

export interface BloqueTexto {
  type: 'text'
  text: string
}

export type MediaTypeImagen = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

export interface BloqueImagen {
  type: 'image'
  source: {
    type: 'base64'
    media_type: MediaTypeImagen
    data: string
  }
}

export interface BloqueDocumento {
  type: 'document'
  source: {
    type: 'base64'
    media_type: 'application/pdf'
    data: string
  }
}

export type BloqueContenido = BloqueTexto | BloqueImagen | BloqueDocumento

/**
 * Una imagen incrustada en el documento (p. ej. un diagrama dentro de un DOCX),
 * extraída aparte de los bloques para poder re-subirla a Blob Storage más tarde
 * como `imagenPregunta`/`imagenA`–`E` de la pregunta a la que pertenece. `indice`
 * es el número con el que se referencia dentro del texto (marcador `[IMAGEN_n]`)
 * y en los bloques (bloque de texto "Imagen n:" seguido del bloque de imagen).
 */
export interface ImagenExtraida {
  indice: number
  mediaType: MediaTypeImagen
  base64: string
}

/** Resultado de la extracción: los bloques para la IA + las imágenes crudas. */
export interface DocumentoExtraido {
  bloques: BloqueContenido[]
  imagenes: ImagenExtraida[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos MIME soportados
// ─────────────────────────────────────────────────────────────────────────────

export const MIME_DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const MIME_PDF = 'application/pdf'

export const MIMES_IMAGEN: readonly MediaTypeImagen[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]

export const MIMES_SOPORTADOS: readonly string[] = [
  MIME_DOCX,
  MIME_PDF,
  ...MIMES_IMAGEN,
]

export function esTipoSoportado(mime: string): boolean {
  return MIMES_SOPORTADOS.includes(mime)
}

/**
 * Cuenta las páginas de un PDF. Devuelve `null` si los bytes no se pueden
 * parsear como PDF (documento dañado o cifrado ilegible): en ese caso el
 * llamador decide (la importación lo deja pasar y será la extracción/IA la que
 * falle con su propio mensaje).
 */
export async function contarPaginasPdf(
  bytes: Buffer | Uint8Array,
): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    return doc.getPageCount()
  } catch {
    return null
  }
}

/** Error claro para tipos de archivo no soportados. */
export class TipoArchivoNoSoportadoError extends Error {
  readonly mime: string
  constructor(mime: string) {
    super(
      `Tipo de archivo no soportado: "${mime}". ` +
        `Tipos aceptados: ${MIMES_SOPORTADOS.join(', ')}.`,
    )
    this.name = 'TipoArchivoNoSoportadoError'
    this.mime = mime
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada
// ─────────────────────────────────────────────────────────────────────────────

/** Archivo como bytes + mime (p. ej. desde `fs.readFileSync` en tests). */
export interface ArchivoBuffer {
  data: Buffer | Uint8Array | ArrayBuffer
  mime: string
  nombre?: string
}

/** Acepta un `File`/`Blob` (FormData) o bytes con su mime explícito. */
export type ArchivoEntrada = ArchivoBuffer | Blob

function esBlob(entrada: ArchivoEntrada): entrada is Blob {
  return typeof (entrada as Blob).arrayBuffer === 'function'
}

function aBuffer(data: Buffer | Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  // Uint8Array: respetar offset/length de la vista.
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

async function normalizar(
  entrada: ArchivoEntrada,
): Promise<{ bytes: Buffer; mime: string }> {
  if (esBlob(entrada)) {
    const bytes = Buffer.from(await entrada.arrayBuffer())
    return { bytes, mime: entrada.type }
  }
  return { bytes: aBuffer(entrada.data), mime: entrada.mime }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCX: texto con marcadores de imagen + imágenes extraídas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quita las etiquetas HTML del resultado de `mammoth.convertToHtml`, dejando
 * texto plano con saltos de línea en los límites de bloque y conservando los
 * marcadores `[IMAGEN_n]` que insertamos en los `<img>` (ver `extraerDocx`).
 */
function htmlATextoConMarcadores(html: string): string {
  const texto = html
    .replace(/<img[^>]*src="img:(\d+)"[^>]*>/g, '[IMAGEN_$1]')
    .replace(/<\/(p|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  return texto.replace(/\n{3,}/g, '\n\n').trim()
}

// Lado máximo recomendado por Anthropic para imágenes de visión: más grande no
// mejora la lectura del modelo, sólo infla el payload (y una foto/escaneo
// incrustado en un DOCX real puede venir en resolución de varios MB, muy por
// encima del límite de tamaño de imagen de la API). Se re-sube en el mismo
// formato, sólo se achica si excede este lado.
const LADO_MAXIMO_IMAGEN_IA = 1568

/**
 * Redimensiona una imagen (si excede `LADO_MAXIMO_IMAGEN_IA` en algún lado) para
 * que quede dentro de los límites de tamaño de la API de visión de Anthropic.
 * Conserva el formato original. Decodifica con sharp de paso: así confirmamos
 * que los bytes son realmente una imagen ráster válida (y no, p. ej., un objeto
 * OLE o un EMF/WMF que Word declaró con un content-type ráster engañoso), algo
 * que de otro modo llegaría intacto hasta la API de Anthropic y haría fallar
 * TODA la detección (una sola imagen corrupta tumba la pregunta completa).
 * Devuelve `null` si sharp no puede decodificarla: esa imagen se descarta.
 */
async function redimensionarONulo(buffer: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buffer)
      .resize({
        width: LADO_MAXIMO_IMAGEN_IA,
        height: LADO_MAXIMO_IMAGEN_IA,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer()
  } catch (err) {
    console.error('[docparse] imagen de DOCX no decodificable, se descarta:', err)
    return null
  }
}

/**
 * Extrae el texto (con marcadores `[IMAGEN_n]` en el lugar de cada imagen) y
 * las imágenes incrustadas de un DOCX. Las imágenes en formatos no soportados
 * (p. ej. EMF/WMF de Word antiguo) o que sharp no pueda decodificar pese al
 * content-type declarado se omiten en silencio: quedan fuera del arreglo y su
 * marcador no se inserta (mejor perder una imagen que hacer fallar todo el
 * documento en la API de Anthropic).
 */
async function extraerDocx(
  bytes: Buffer,
): Promise<{ texto: string; imagenes: ImagenExtraida[] }> {
  const imagenes: ImagenExtraida[] = []

  const { value: html } = await mammoth.convertToHtml(
    { buffer: bytes },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        // Algunas herramientas de banco de preguntas exportan el DOCX con un
        // content-type no estándar como "image/png;base64" (parámetros extra
        // tipo MIME pegados al tipo). Nos quedamos sólo con el tipo base para
        // reconocerlo — si no, el filtro de tipos soportados descarta TODAS
        // las imágenes de ese documento.
        const mediaType = image.contentType.split(';')[0].trim()
        if (!(MIMES_IMAGEN as readonly string[]).includes(mediaType)) {
          return { src: '' }
        }
        const original = Buffer.from(await image.read('base64'), 'base64')
        const redimensionada = await redimensionarONulo(original)
        if (!redimensionada) return { src: '' }
        const indice = imagenes.length
        imagenes.push({
          indice,
          mediaType: mediaType as MediaTypeImagen,
          base64: redimensionada.toString('base64'),
        })
        return { src: `img:${indice}` }
      }),
    },
  )

  return { texto: htmlATextoConMarcadores(html), imagenes }
}

// ─────────────────────────────────────────────────────────────────────────────
// API principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve los content blocks de Anthropic que representan el contenido del
 * archivo, listos para enviarse a la IA en la Fase 7.2, junto con las imágenes
 * incrustadas que se hayan podido extraer (por ahora sólo DOCX) para poder
 * re-subirlas como imagen de la pregunta/alternativa a la que pertenezcan.
 *
 * Lanza {@link TipoArchivoNoSoportadoError} si el mime no es PDF, DOCX ni una
 * imagen soportada.
 */
export async function extraerBloquesDocumento(
  entrada: ArchivoEntrada,
): Promise<DocumentoExtraido> {
  const { bytes, mime } = await normalizar(entrada)

  if (mime === MIME_DOCX) {
    const { texto, imagenes } = await extraerDocx(bytes)
    const bloques: BloqueContenido[] = [{ type: 'text', text: texto }]
    for (const img of imagenes) {
      bloques.push({ type: 'text', text: `Imagen ${img.indice}:` })
      bloques.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
      })
    }
    return { bloques, imagenes }
  }

  if (mime === MIME_PDF) {
    return {
      bloques: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: MIME_PDF,
            data: bytes.toString('base64'),
          },
        },
      ],
      imagenes: [],
    }
  }

  if ((MIMES_IMAGEN as readonly string[]).includes(mime)) {
    return {
      bloques: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mime as MediaTypeImagen,
            data: bytes.toString('base64'),
          },
        },
      ],
      imagenes: [],
    }
  }

  throw new TipoArchivoNoSoportadoError(mime)
}
