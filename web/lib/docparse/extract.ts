import { inflateSync } from 'node:zlib'
import mammoth from 'mammoth'
import sharp from 'sharp'
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from 'pdf-lib'

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
// PDF: imágenes incrustadas (XObjects /Image)
// ─────────────────────────────────────────────────────────────────────────────

/** Máximo de imágenes incrustadas que se extraen de un PDF. */
const MAX_IMAGENES_PDF = 20
/** Lado mínimo (px) para considerar una imagen: filtra iconos/viñetas/logos. */
const LADO_MINIMO_IMAGEN_PDF = 48

/**
 * Deshace los predictores PNG (filtros por fila: None/Sub/Up/Average/Paeth) de
 * un stream FlateDecode con `Predictor >= 10`. Devuelve los píxeles crudos.
 */
function deshacerPredictorPng(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): Buffer {
  const rowBytes = width * channels
  const out = Buffer.alloc(rowBytes * height)
  let prev = Buffer.alloc(rowBytes)

  for (let y = 0; y < height; y++) {
    const tipo = data[y * (rowBytes + 1)]
    const fila = data.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1))
    const actual = out.subarray(y * rowBytes, (y + 1) * rowBytes)
    for (let x = 0; x < rowBytes; x++) {
      const izq = x >= channels ? actual[x - channels] : 0
      const arriba = prev[x]
      const diag = x >= channels ? prev[x - channels] : 0
      let v = fila[x]
      switch (tipo) {
        case 1: v = (v + izq) & 0xff; break
        case 2: v = (v + arriba) & 0xff; break
        case 3: v = (v + ((izq + arriba) >> 1)) & 0xff; break
        case 4: {
          // Paeth
          const p = izq + arriba - diag
          const pa = Math.abs(p - izq)
          const pb = Math.abs(p - arriba)
          const pc = Math.abs(p - diag)
          const pred = pa <= pb && pa <= pc ? izq : pb <= pc ? arriba : diag
          v = (v + pred) & 0xff
          break
        }
        // case 0 (None) y desconocidos: el byte va tal cual.
      }
      actual[x] = v
    }
    prev = actual
  }
  return out
}

/**
 * Decodifica un XObject de imagen de un PDF a un PNG/JPEG que sharp pueda
 * procesar, o `null` si el formato no está soportado (JPX, CCITT, CMYK,
 * bits ≠ 8, etc.). Soporta los dos casos que cubren la gran mayoría de las
 * pruebas escolares (Word→PDF): DCTDecode (JPEG tal cual) y FlateDecode
 * (píxeles crudos, con o sin predictores PNG).
 */
async function decodificarImagenPdf(
  stream: PDFRawStream,
): Promise<{ data: Buffer; mediaType: MediaTypeImagen } | null> {
  const dict = stream.dict
  const width = dict.lookup(PDFName.of('Width'), PDFNumber).asNumber()
  const height = dict.lookup(PDFName.of('Height'), PDFNumber).asNumber()
  if (!width || !height) return null
  if (width < LADO_MINIMO_IMAGEN_PDF || height < LADO_MINIMO_IMAGEN_PDF) {
    return null
  }

  // Filter puede ser un nombre o un arreglo de nombres.
  const filtroObj = dict.lookup(PDFName.of('Filter'))
  const filtros: string[] = []
  if (filtroObj instanceof PDFName) filtros.push(filtroObj.decodeText())
  if (filtroObj instanceof PDFArray) {
    for (const f of filtroObj.asArray()) {
      if (f instanceof PDFName) filtros.push(f.decodeText())
    }
  }

  // JPEG incrustado: los bytes del stream SON el archivo JPEG.
  if (filtros.includes('DCTDecode')) {
    return { data: Buffer.from(stream.getContents()), mediaType: 'image/jpeg' }
  }

  // Píxeles crudos comprimidos con zlib.
  if (filtros.length === 1 && filtros[0] === 'FlateDecode') {
    const bits = dict.lookupMaybe(PDFName.of('BitsPerComponent'), PDFNumber)
    if (bits && bits.asNumber() !== 8) return null

    let crudo: Buffer
    try {
      crudo = inflateSync(Buffer.from(stream.getContents()))
    } catch {
      return null
    }

    // Canales por tamaño (evita parsear ColorSpace/ICC): sin predictor el
    // stream mide width*height*canales; con predictores PNG cada fila lleva
    // un byte extra de tipo de filtro.
    const porPixel = crudo.length / (width * height)
    let channels: 1 | 3 | null = porPixel === 1 ? 1 : porPixel === 3 ? 3 : null
    if (channels === null) {
      const conPredictor = (c: number) => (width * c + 1) * height
      if (crudo.length === conPredictor(3)) {
        crudo = deshacerPredictorPng(crudo, width, height, 3)
        channels = 3
      } else if (crudo.length === conPredictor(1)) {
        crudo = deshacerPredictorPng(crudo, width, height, 1)
        channels = 1
      } else {
        // 4 canales = CMYK u otro layout no soportado: se descarta.
        return null
      }
    }

    try {
      const png = await sharp(crudo, {
        raw: { width, height, channels },
      })
        .png()
        .toBuffer()
      return { data: png, mediaType: 'image/png' }
    } catch {
      return null
    }
  }

  return null
}

/**
 * Extrae las imágenes incrustadas de un PDF (XObjects `/Image`), redimensiona
 * a los límites de visión de la API y descarta en silencio los formatos no
 * soportados y las imágenes decorativas diminutas. Nunca lanza: ante un PDF
 * ilegible devuelve un arreglo vacío (el documento igual viaja completo a la
 * IA como bloque `document`).
 */
async function extraerImagenesPdf(bytes: Buffer): Promise<ImagenExtraida[]> {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  } catch {
    return []
  }

  const imagenes: ImagenExtraida[] = []
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (imagenes.length >= MAX_IMAGENES_PDF) break
    if (!(obj instanceof PDFRawStream)) continue
    if (obj.dict.lookupMaybe(PDFName.of('Subtype'), PDFName) !== PDFName.of('Image')) {
      continue
    }
    try {
      const decodificada = await decodificarImagenPdf(obj)
      if (!decodificada) continue
      const redimensionada = await redimensionarONulo(decodificada.data)
      if (!redimensionada) continue
      imagenes.push({
        indice: imagenes.length,
        mediaType: decodificada.mediaType,
        base64: redimensionada.toString('base64'),
      })
    } catch {
      // Una imagen problemática no debe tumbar la extracción del resto.
    }
  }
  return imagenes
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
    // Claude LEE las figuras dentro del PDF de forma nativa, pero para poder
    // re-subirlas como imagen de la pregunta/alternativa necesitamos los bytes
    // de cada una: se extraen los XObjects y se adjuntan numerados después del
    // documento (sin marcadores en el texto, a diferencia del DOCX: la IA las
    // asocia visualmente).
    const imagenes = await extraerImagenesPdf(bytes)
    const bloques: BloqueContenido[] = [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: MIME_PDF,
          data: bytes.toString('base64'),
        },
      },
    ]
    for (const img of imagenes) {
      bloques.push({ type: 'text', text: `Imagen ${img.indice}:` })
      bloques.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
      })
    }
    return { bloques, imagenes }
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
