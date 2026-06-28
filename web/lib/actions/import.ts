'use server'

import { getSession } from '@/lib/get-session'
import {
  esTipoSoportado,
  extraerBloquesDocumento,
} from '@/lib/docparse/extract'
import { detectarPreguntas } from '@/lib/ai/import'
import { crearPregunta } from '@/lib/actions/preguntas'
import { LETRAS } from '@/lib/validation/pregunta'
import {
  guardarImportSchema,
  type GuardarImportInput,
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
  | { ok: true; preguntas: PreguntaDetectada[] }
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

  let bloques
  try {
    bloques = await extraerBloquesDocumento(archivo)
  } catch {
    return {
      ok: false,
      error: 'No pudimos leer el documento. Verifica que no esté dañado.',
    }
  }

  try {
    const preguntas = await detectarPreguntas(bloques, asignatura)
    return { ok: true, preguntas }
  } catch {
    return {
      ok: false,
      error: 'La IA no pudo procesar el documento. Inténtalo de nuevo.',
    }
  }
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

  if (p.tipo === 'seleccion_multiple') {
    fd.set('A', p.A)
    fd.set('B', p.B)
    fd.set('C', p.C)
    fd.set('D', p.D)
    fd.set('E', p.E)
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
