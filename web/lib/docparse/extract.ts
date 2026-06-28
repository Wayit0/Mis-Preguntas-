import mammoth from 'mammoth'

/**
 * Extracción de documentos para la importación con IA (Fase 7).
 *
 * Convierte un archivo subido (PDF, DOCX o imagen) en los *content blocks* de
 * la API de Anthropic, listos para incluirse en un mensaje de usuario en la
 * Fase 7.2. La función es **pura**: nunca llama al API: solo prepara los datos.
 *
 * Estrategia (aprovechar capacidades nativas de Claude en vez de OCR propio):
 *   - DOCX  → mammoth.extractRawText → un bloque `text`.
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
// API principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve los content blocks de Anthropic que representan el contenido del
 * archivo, listos para enviarse a la IA en la Fase 7.2.
 *
 * Lanza {@link TipoArchivoNoSoportadoError} si el mime no es PDF, DOCX ni una
 * imagen soportada.
 */
export async function extraerBloquesDocumento(
  entrada: ArchivoEntrada,
): Promise<BloqueContenido[]> {
  const { bytes, mime } = await normalizar(entrada)

  if (mime === MIME_DOCX) {
    const { value } = await mammoth.extractRawText({ buffer: bytes })
    return [{ type: 'text', text: value.trim() }]
  }

  if (mime === MIME_PDF) {
    return [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: MIME_PDF,
          data: bytes.toString('base64'),
        },
      },
    ]
  }

  if ((MIMES_IMAGEN as readonly string[]).includes(mime)) {
    return [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mime as MediaTypeImagen,
          data: bytes.toString('base64'),
        },
      },
    ]
  }

  throw new TipoArchivoNoSoportadoError(mime)
}
