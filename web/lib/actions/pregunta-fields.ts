// Helpers PUROS de mapeo FormData → columnas de `preguntas`. Se extraen aquí
// (módulo normal, sin 'use server') para reutilizarlos tanto en la action con
// guard de propiedad (lib/actions/preguntas.ts) como en la action de gestión del
// banco del colegio (lib/actions/banco-colegio.ts) SIN duplicar la lógica de
// mapeo ni tocar los guards. Estos helpers NO autorizan nada: la autorización
// vive en cada action que los usa.

import { uploadImage } from '@/lib/storage/blob'
import type { PreguntaInput } from '@/lib/validation/pregunta'

/** Resultado de una mutación de formulario de pregunta: error legible o nada. */
export type ResultadoPregunta = { error: string } | void

/** Slots de imagen y la columna de la tabla a la que mapean. */
export const SLOTS_IMAGEN = [
  { campo: 'imagen_pregunta', columna: 'imagenPregunta' },
  { campo: 'imagen_A', columna: 'imagenA' },
  { campo: 'imagen_B', columna: 'imagenB' },
  { campo: 'imagen_C', columna: 'imagenC' },
  { campo: 'imagen_D', columna: 'imagenD' },
  { campo: 'imagen_E', columna: 'imagenE' },
] as const

export type ColumnaImagen = (typeof SLOTS_IMAGEN)[number]['columna']

/** Extrae los campos de texto del FormData para validarlos con Zod. */
export function extraerCampos(formData: FormData): Record<string, unknown> {
  const t = (k: string) => (formData.get(k) ?? '').toString()
  return {
    asignatura: t('asignatura'),
    materia: t('materia'),
    contenido: t('contenido'),
    nivel: t('nivel'),
    pregunta: t('pregunta'),
    A: t('A'),
    B: t('B'),
    C: t('C'),
    D: t('D'),
    E: t('E'),
    correcta: t('correcta'),
    explicacion: t('explicacion'),
    tipo: t('tipo') || 'seleccion_multiple',
    compartida: t('compartida') || '0',
  }
}

/**
 * Sube las imágenes presentes en el FormData (sólo las que traen un archivo no
 * vacío) y devuelve un mapa columna→clave del blob. Las que no vengan quedan
 * fuera del mapa (en alta se guardan como NULL; en edición se conserva la
 * imagen previa al no tocar la columna).
 */
export async function subirImagenes(
  formData: FormData,
): Promise<Partial<Record<ColumnaImagen, string>>> {
  const resultado: Partial<Record<ColumnaImagen, string>> = {}
  for (const { campo, columna } of SLOTS_IMAGEN) {
    const archivo = formData.get(campo)
    if (archivo instanceof File && archivo.size > 0) {
      resultado[columna] = await uploadImage(archivo)
    }
  }
  return resultado
}

/** Convierte '' en null para columnas de texto opcionales. */
function oNull(valor: string): string | null {
  return valor.length > 0 ? valor : null
}

/** Columnas de texto/alternativas derivadas del input validado. */
export function camposDb(data: PreguntaInput) {
  const esSeleccion = data.tipo === 'seleccion_multiple'
  return {
    materia: oNull(data.materia),
    contenido: oNull(data.contenido),
    nivel: oNull(data.nivel),
    pregunta: data.pregunta,
    A: esSeleccion ? oNull(data.A) : null,
    B: esSeleccion ? oNull(data.B) : null,
    C: esSeleccion ? oNull(data.C) : null,
    D: esSeleccion ? oNull(data.D) : null,
    E: esSeleccion ? oNull(data.E) : null,
    correcta: esSeleccion ? oNull(data.correcta) : null,
    explicacion: oNull(data.explicacion),
    compartida: data.compartida,
    tipo: data.tipo,
  }
}
