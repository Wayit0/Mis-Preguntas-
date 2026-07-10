'use server'

import { getSession } from '@/lib/get-session'
import {
  contarPaginasPdf,
  esTipoSoportado,
  extraerBloquesDocumento,
  MIME_PDF,
  type DocumentoExtraido,
  type ImagenExtraida,
} from '@/lib/docparse/extract'
import { detectarPreguntas } from '@/lib/ai/import'
import { crearPregunta } from '@/lib/actions/preguntas'
import { LETRAS } from '@/lib/validation/pregunta'
import {
  guardarImportSchema,
  MAX_PAGINAS_PDF,
  type GuardarImportInput,
  type ImagenParaGuardar,
  type PreguntaDetectada,
} from '@/lib/validation/import'

// ---------------------------------------------------------------------------
// Server actions de "Importar Documento con IA" (Fase 7.2).
//
//  1. `analizarDocumento`  — sube el archivo → docparse → detectarPreguntas.
//  2. `guardarPreguntasImportadas` — guarda en lote reusando `crearPregunta`.
// ---------------------------------------------------------------------------

/** Resultado del análisis de un documento. */
export type ResultadoAnalisis =
  | { ok: true; preguntas: PreguntaDetectada[]; imagenes: ImagenExtraida[] }
  | { ok: false; error: string }

/** Resultado de la confirmación (guardado en lote). */
export type ResultadoGuardado =
  | { ok: true; guardadas: number }
  | { ok: false; error: string }

/**
 * Recibe el documento subido (FormData con `archivo` y `asignatura`), lo
 * convierte a content blocks y detecta las preguntas con la IA. No persiste
 * nada: sólo devuelve las preguntas para que el usuario las revise.
 */
export async function analizarDocumento(
  formData: FormData,
): Promise<ResultadoAnalisis> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Debes iniciar sesión.' }

  const archivo = formData.get('archivo')
  const asignatura = (formData.get('asignatura') ?? '').toString().trim()

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: 'Sube un documento (PDF, DOCX o imagen).' }
  }
  if (!asignatura) {
    return { ok: false, error: 'Selecciona una asignatura.' }
  }
  if (!esTipoSoportado(archivo.type)) {
    return {
      ok: false,
      error: 'Tipo de archivo no soportado. Usa PDF, Word (DOCX) o una imagen.',
    }
  }

  // Límite de páginas para PDF: corta ANTES de llamar a la IA, con un mensaje
  // accionable. Si el PDF no se puede parsear (contarPaginasPdf → null), se
  // deja pasar: la extracción/IA darán su propio error si está dañado.
  if (archivo.type === MIME_PDF) {
    const paginas = await contarPaginasPdf(
      new Uint8Array(await archivo.arrayBuffer()),
    )
    if (paginas !== null && paginas > MAX_PAGINAS_PDF) {
      return {
        ok: false,
        error:
          `El PDF tiene ${paginas} páginas y el máximo es ${MAX_PAGINAS_PDF}. ` +
          'Divide el documento e impórtalo por partes.',
      }
    }
  }

  let documento: DocumentoExtraido
  try {
    documento = await extraerBloquesDocumento(archivo)
  } catch {
    return {
      ok: false,
      error: 'No pudimos leer el documento. Verifica que no esté dañado.',
    }
  }

  try {
    const preguntas = await detectarPreguntas(documento.bloques, asignatura)
    return { ok: true, preguntas, imagenes: documento.imagenes }
  } catch (err) {
    // Log con detalle para poder diagnosticar en los logs del servidor (Azure App
    // Service / Application Insights) qué falló realmente: el mensaje que ve el
    // profesor es genérico a propósito, pero acá sí queremos el detalle.
    console.error('[importar] detectarPreguntas falló:', err)

    // Distingue un problema de configuración (clave de Anthropic ausente o
    // inválida) de un fallo transitorio, para dar un mensaje accionable en vez
    // de pedir "inténtalo de nuevo" sobre algo que nunca va a funcionar.
    // - Clave INVÁLIDA → la API responde 401/403 (`err.status`).
    // - Clave AUSENTE → el SDK lanza ANTES de llamar a la API (sin `.status`),
    //   con un mensaje que menciona la API key.
    const status = (err as { status?: number } | null)?.status
    const mensaje = err instanceof Error ? err.message.toLowerCase() : ''
    const esProblemaDeClave =
      status === 401 ||
      status === 403 ||
      mensaje.includes('api key') ||
      mensaje.includes('anthropic_api_key')
    if (esProblemaDeClave) {
      return {
        ok: false,
        error:
          'La importación con IA no está configurada: falta o es inválida la ' +
          'clave de Anthropic. Avísale al administrador del sitio.',
      }
    }
    return {
      ok: false,
      error: 'La IA no pudo procesar el documento. Inténtalo de nuevo.',
    }
  }
}

/** Extensión de archivo por mime, para el nombre del `File` reconstruido. */
const EXT_POR_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/**
 * Si `img` trae datos, reconstruye el `File` (a partir del base64 extraído del
 * documento) y lo agrega al FormData bajo `campo`, para que `subirImagenes` (en
 * `pregunta-fields.ts`, ya usado por `crearPregunta`) lo suba a Blob Storage
 * igual que si viniera de un `<input type="file">`.
 */
function setImagenSiExiste(
  fd: FormData,
  campo: string,
  img: ImagenParaGuardar | null | undefined,
): void {
  if (!img) return
  const ext = EXT_POR_MIME[img.mediaType] ?? 'png'
  const bytes = Buffer.from(img.base64, 'base64')
  fd.set(campo, new File([bytes], `${campo}.${ext}`, { type: img.mediaType }))
}

/** Construye el FormData de una pregunta para reutilizar `crearPregunta`. */
function formDataDePregunta(
  asignatura: string,
  p: GuardarImportInput['preguntas'][number],
): FormData {
  const fd = new FormData()
  fd.set('asignatura', asignatura)
  fd.set('tipo', p.tipo)
  fd.set('pregunta', p.pregunta)
  fd.set('materia', p.materia)
  fd.set('nivel', p.nivel)
  fd.set('explicacion', p.explicacion)
  fd.set('compartida', '0')
  setImagenSiExiste(fd, 'imagen_pregunta', p.imagenPregunta)

  if (p.tipo === 'seleccion_multiple') {
    fd.set('A', p.A)
    fd.set('B', p.B)
    fd.set('C', p.C)
    fd.set('D', p.D)
    fd.set('E', p.E)
    setImagenSiExiste(fd, 'imagen_A', p.imagenA)
    setImagenSiExiste(fd, 'imagen_B', p.imagenB)
    setImagenSiExiste(fd, 'imagen_C', p.imagenC)
    setImagenSiExiste(fd, 'imagen_D', p.imagenD)
    setImagenSiExiste(fd, 'imagen_E', p.imagenE)
    // `crearPregunta` exige una correcta A–E para selección múltiple; si la
    // detección no la trae, usamos 'A' como valor por defecto seguro.
    const correcta = (LETRAS as readonly string[]).includes(p.correcta)
      ? p.correcta
      : 'A'
    fd.set('correcta', correcta)
  }

  return fd
}

/**
 * Guarda en lote las preguntas revisadas por el usuario, reutilizando la server
 * action `crearPregunta` (que valida propiedad y revalida la lista). Respeta la
 * asignatura del contexto. Devuelve cuántas se guardaron.
 */
export async function guardarPreguntasImportadas(
  input: GuardarImportInput,
): Promise<ResultadoGuardado> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Debes iniciar sesión.' }

  const parsed = guardarImportSchema.safeParse(input)
  if (!parsed.success) {
    const msg =
      parsed.error.issues[0]?.message ?? 'Datos de importación no válidos.'
    return { ok: false, error: msg }
  }
  const { asignatura, preguntas } = parsed.data

  let guardadas = 0
  for (const p of preguntas) {
    const resultado = await crearPregunta(formDataDePregunta(asignatura, p))
    if (!(resultado && 'error' in resultado)) guardadas++
  }

  if (guardadas === 0) {
    return {
      ok: false,
      error: 'No se pudo guardar ninguna pregunta. Revisa los datos.',
    }
  }
  return { ok: true, guardadas }
}
