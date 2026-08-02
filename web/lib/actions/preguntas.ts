'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { preguntas } from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'
import { colegioIdDeUsuario } from '@/lib/queries/visibilidad'
import { rutaCarpeta } from '@/lib/queries/carpetas'
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
 * Lee `carpetaId` del FormData (si viene) y verifica que la carpeta exista y
 * sea del usuario. Vive fuera de `preguntaSchema`/`camposDb` (compartidos con
 * `banco-colegio.ts`, que no maneja carpetas de usuario) — sólo lo usa
 * `crearPregunta`, para poder clasificar preguntas en carpeta ya al crearlas
 * (p. ej. desde la barra de selección de "Importar Documento").
 */
async function carpetaIdDeFormData(
  formData: FormData,
  userId: number,
): Promise<{ error: string } | { carpetaId: number | null }> {
  const valor = formData.get('carpetaId')
  if (valor == null || valor === '') return { carpetaId: null }
  const carpetaId = Number(valor)
  if (!Number.isFinite(carpetaId)) return { error: 'Carpeta no válida.' }
  const ruta = await rutaCarpeta(userId, carpetaId)
  if (ruta.length === 0) return { error: 'La carpeta destino no existe.' }
  return { carpetaId }
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

  const resultadoCarpeta = await carpetaIdDeFormData(formData, userId)
  if ('error' in resultadoCarpeta) return { error: resultadoCarpeta.error }

  const imagenes = await subirImagenes(formData)
  const colegioId = await colegioIdDeUsuario(userId)

  await db.insert(preguntas).values({
    userId,
    colegioId,
    asignatura: data.asignatura,
    carpetaId: resultadoCarpeta.carpetaId,
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

/**
 * Elimina varias preguntas del usuario de una vez (guard de propiedad vía
 * `inArray` + `userId`). Usada por la vista de "Preguntas duplicadas" para
 * borrar las copias seleccionadas en un solo submit.
 */
export async function eliminarPreguntasEnLote(formData: FormData): Promise<void> {
  const session = await getSession()
  if (!session) return
  const userId = Number(session.user.id)

  const ids = formData
    .getAll('id')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0)
  if (ids.length === 0) return

  await db
    .delete(preguntas)
    .where(and(inArray(preguntas.id, ids), eq(preguntas.userId, userId)))

  revalidatePath('/preguntas')
  revalidatePath('/preguntas/duplicadas')
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

/**
 * Cambia el estado de compartición de varias preguntas del usuario a la vez
 * (guard de propiedad vía `inArray` + `userId`). Usada por la barra de
 * selección múltiple en "Mis Preguntas".
 */
export async function cambiarCompartidaEnLote(
  ids: number[],
  valor: number,
): Promise<void> {
  const session = await getSession()
  if (!session) return
  const userId = Number(session.user.id)

  const idsValidos = ids.filter((n) => Number.isInteger(n) && n > 0)
  if (idsValidos.length === 0) return

  await db
    .update(preguntas)
    .set({ compartida: valor })
    .where(and(inArray(preguntas.id, idsValidos), eq(preguntas.userId, userId)))

  revalidatePath('/preguntas')
}
