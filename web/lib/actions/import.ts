'use server'

import { getSession } from '@/lib/get-session'
import { crearPregunta } from '@/lib/actions/preguntas'
import { LETRAS } from '@/lib/validation/pregunta'
import {
  guardarImportSchema,
  type GuardarImportInput,
  type ImagenParaGuardar,
} from '@/lib/validation/import'

// ---------------------------------------------------------------------------
// Server action de "Importar Documento con IA" (Fase 7.2): el guardado en lote
// (`guardarPreguntasImportadas`), reusando `crearPregunta`.
//
// El ANÁLISIS del documento NO vive aquí: es el route handler de streaming
// `/api/importar` (ver lib/import/analizar.ts) porque puede superar el timeout
// de inactividad del front-end de Azure y necesita keepalives.
// ---------------------------------------------------------------------------

/** Resultado de la confirmación (guardado en lote). */
export type ResultadoGuardado =
  | { ok: true; guardadas: number }
  | { ok: false; error: string }

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
