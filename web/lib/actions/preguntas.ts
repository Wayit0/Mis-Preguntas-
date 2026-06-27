'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { preguntas } from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'
import { uploadImage } from '@/lib/storage/blob'
import {
  preguntaSchema,
  primerErrorPregunta,
  type PreguntaInput,
} from '@/lib/validation/pregunta'

/** Resultado de una mutación de formulario: error legible o nada (éxito). */
export type ResultadoPregunta = { error: string } | void

/** Slots de imagen y la columna de la tabla a la que mapean. */
const SLOTS_IMAGEN = [
  { campo: 'imagen_pregunta', columna: 'imagenPregunta' },
  { campo: 'imagen_A', columna: 'imagenA' },
  { campo: 'imagen_B', columna: 'imagenB' },
  { campo: 'imagen_C', columna: 'imagenC' },
  { campo: 'imagen_D', columna: 'imagenD' },
  { campo: 'imagen_E', columna: 'imagenE' },
] as const

type ColumnaImagen = (typeof SLOTS_IMAGEN)[number]['columna']

/** Extrae los campos de texto del FormData para validarlos con Zod. */
function extraerCampos(formData: FormData): Record<string, unknown> {
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
async function subirImagenes(
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
function camposDb(data: PreguntaInput) {
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

/**
 * Crea una pregunta del usuario autenticado. Sube las imágenes que vengan e
 * inserta la fila. Revalida la lista (la navegación a ella la hace el cliente).
 */
export async function crearPregunta(
  formData: FormData,
): Promise<ResultadoPregunta> {
  const session = await getSession()
  if (!session) return { error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)

  const parsed = preguntaSchema.safeParse(extraerCampos(formData))
  if (!parsed.success) return { error: primerErrorPregunta(parsed.error) }
  const data = parsed.data

  const imagenes = await subirImagenes(formData)

  await db.insert(preguntas).values({
    userId,
    asignatura: data.asignatura,
    ...camposDb(data),
    imagenPregunta: imagenes.imagenPregunta ?? null,
    imagenA: imagenes.imagenA ?? null,
    imagenB: imagenes.imagenB ?? null,
    imagenC: imagenes.imagenC ?? null,
    imagenD: imagenes.imagenD ?? null,
    imagenE: imagenes.imagenE ?? null,
  })

  revalidatePath('/preguntas')
}

/**
 * Actualiza una pregunta del usuario (guard de propiedad). Sólo reemplaza una
 * imagen si se subió un archivo nuevo para ese slot; el resto se conserva.
 */
export async function actualizarPregunta(
  id: number,
  formData: FormData,
): Promise<ResultadoPregunta> {
  const session = await getSession()
  if (!session) return { error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)
  if (!Number.isFinite(id)) return { error: 'Pregunta no encontrada.' }

  const [existente] = await db
    .select({ id: preguntas.id })
    .from(preguntas)
    .where(and(eq(preguntas.id, id), eq(preguntas.userId, userId)))
    .limit(1)
  if (!existente) return { error: 'No tienes permiso para editar esta pregunta.' }

  const parsed = preguntaSchema.safeParse(extraerCampos(formData))
  if (!parsed.success) return { error: primerErrorPregunta(parsed.error) }
  const data = parsed.data

  const imagenes = await subirImagenes(formData)

  await db
    .update(preguntas)
    .set({
      asignatura: data.asignatura,
      ...camposDb(data),
      // Sólo se incluyen las columnas de imagen con archivo nuevo.
      ...imagenes,
    })
    .where(and(eq(preguntas.id, id), eq(preguntas.userId, userId)))

  revalidatePath('/preguntas')
}

/** Elimina una pregunta del usuario (guard de propiedad). */
export async function eliminarPregunta(id: number): Promise<void> {
  const session = await getSession()
  if (!session) return
  const userId = Number(session.user.id)
  if (!Number.isFinite(id)) return

  await db
    .delete(preguntas)
    .where(and(eq(preguntas.id, id), eq(preguntas.userId, userId)))

  revalidatePath('/preguntas')
}

/** Cambia el estado de compartición de una pregunta del usuario. */
export async function toggleCompartida(
  id: number,
  valor: number,
): Promise<void> {
  const session = await getSession()
  if (!session) return
  const userId = Number(session.user.id)
  if (!Number.isFinite(id)) return

  await db
    .update(preguntas)
    .set({ compartida: valor })
    .where(and(eq(preguntas.id, id), eq(preguntas.userId, userId)))

  revalidatePath('/preguntas')
}
