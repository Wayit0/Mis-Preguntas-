'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { preguntas } from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'
import { colegioIdDeUsuario } from '@/lib/queries/visibilidad'
import { preguntaSchema, primerErrorPregunta } from '@/lib/validation/pregunta'
import {
  camposDb,
  extraerCampos,
  subirImagenes,
  type ResultadoPregunta,
} from '@/lib/actions/pregunta-fields'

// El tipo de resultado y los helpers de mapeo FormData→columnas viven en
// `pregunta-fields` (módulo puro reutilizable, importable desde cualquier sitio).
// Aquí permanecen ÚNICAMENTE las actions con guard de propiedad
// (and(eq(id), eq(userId))). NOTA: un fichero 'use server' NO puede re-exportar
// tipos (el compilador RSC intenta tratarlos como server actions); por eso el
// tipo se importa de pregunta-fields donde se necesite, no desde aquí.

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
  const colegioId = await colegioIdDeUsuario(userId)

  await db.insert(preguntas).values({
    userId,
    colegioId,
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
