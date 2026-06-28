'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { preguntas, usuarios } from '@/lib/db/schema'
import { getActor, esAdminDeColegio, type Actor } from '@/lib/authz'
import { preguntaSchema, primerErrorPregunta } from '@/lib/validation/pregunta'
import {
  camposDb,
  extraerCampos,
  subirImagenes,
  type ResultadoPregunta,
} from '@/lib/actions/pregunta-fields'

// ---------------------------------------------------------------------------
// Gestión del banco del colegio (Parte E.1) — módulo SEPARADO de
// lib/actions/preguntas.ts a propósito. El guard de propiedad de aquel
// (and(eq(id), eq(userId))) NO se debilita: estas actions usan un guard
// DISTINTO — "mismo colegio + rol school_admin" — verificado con
// esAdminDeColegio contra el colegio del AUTOR de la pregunta. Se reutiliza el
// mapeo de campos (pregunta-fields) sin duplicarlo.
// ---------------------------------------------------------------------------

interface PreguntaAutor {
  preguntaId: number
  autorColegioId: number | null
}

/**
 * Carga el id de la pregunta y el colegio de su autor. Devuelve null si la
 * pregunta no existe.
 */
async function cargarPreguntaConAutor(
  id: number,
): Promise<PreguntaAutor | null> {
  if (!Number.isFinite(id)) return null
  const [fila] = await db
    .select({
      preguntaId: preguntas.id,
      autorColegioId: usuarios.colegioId,
    })
    .from(preguntas)
    .innerJoin(usuarios, eq(usuarios.id, preguntas.userId))
    .where(eq(preguntas.id, id))
    .limit(1)
  return fila ?? null
}

/**
 * Guard compartido: autoriza al actor a gestionar la pregunta `id` SOLO si su
 * autor pertenece a un colegio que el actor administra (school_admin del mismo
 * colegio, o global_admin). Devuelve el actor autorizado o un error legible.
 */
async function autorizarGestion(
  id: number,
): Promise<{ error: string } | { actor: Actor }> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }

  const info = await cargarPreguntaConAutor(id)
  if (!info) return { error: 'La pregunta no existe.' }

  // El autor debe pertenecer a un colegio y el actor debe administrar ESE
  // colegio. esAdminDeColegio cubre school_admin (mismo colegio) y global_admin.
  if (
    info.autorColegioId === null ||
    !esAdminDeColegio(actor, info.autorColegioId)
  ) {
    return { error: 'No tienes permiso para gestionar esta pregunta.' }
  }
  return { actor }
}

/**
 * Edita una pregunta del banco del colegio. Guard: el autor pertenece al colegio
 * que administra el actor (school_admin / global_admin). Reutiliza el mapeo de
 * campos e imágenes de las preguntas. Sólo reemplaza una imagen si se subió un
 * archivo nuevo para ese slot.
 */
export async function editarPreguntaColegio(
  id: number,
  formData: FormData,
): Promise<ResultadoPregunta> {
  const auth = await autorizarGestion(id)
  if ('error' in auth) return { error: auth.error }

  const parsed = preguntaSchema.safeParse(extraerCampos(formData))
  if (!parsed.success) return { error: primerErrorPregunta(parsed.error) }
  const data = parsed.data

  const imagenes = await subirImagenes(formData)

  await db
    .update(preguntas)
    .set({
      asignatura: data.asignatura,
      ...camposDb(data),
      ...imagenes,
    })
    .where(eq(preguntas.id, id))

  revalidatePath('/colegio')
  revalidatePath('/preguntas')
}

/**
 * Elimina una pregunta del banco del colegio. Mismo guard de "mismo colegio +
 * school_admin" que la edición.
 */
export async function eliminarPreguntaColegio(
  id: number,
): Promise<ResultadoPregunta> {
  const auth = await autorizarGestion(id)
  if ('error' in auth) return { error: auth.error }

  await db.delete(preguntas).where(eq(preguntas.id, id))

  revalidatePath('/colegio')
  revalidatePath('/preguntas')
}
