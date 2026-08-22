'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { asignaciones, cursos, entregas } from '@/lib/db/schema'
import { getActor } from '@/lib/authz'
import { cargarPruebaPorId } from '@/lib/queries/pruebas'
import { construirSnapshot } from '@/lib/tareas/snapshot'
import { aplanarPreguntas } from '@/lib/tareas/contenido'

/**
 * Crea una asignación congelando el snapshot de la prueba. El profesor debe
 * ser dueño del curso Y de la prueba. La misma prueba puede asignarse varias
 * veces (cada asignación es independiente).
 */
export async function asignarPruebaACurso(input: {
  pruebaId: number
  cursoId: number
  fechaLimite?: string | null
  instrucciones?: string | null
}): Promise<{ ok: true; id: number } | { error: string }> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }
  if (actor.role === 'student') return { error: 'No autorizado.' }

  const [curso] = await db.select({ id: cursos.id }).from(cursos)
    .where(and(eq(cursos.id, input.cursoId), eq(cursos.userId, actor.userId)))
    .limit(1)
  if (!curso) return { error: 'Curso no encontrado.' }

  const prueba = await cargarPruebaPorId(input.pruebaId, actor.userId)
  if (!prueba) return { error: 'Prueba no encontrada.' }

  const contenido = await construirSnapshot({
    preguntasIds: prueba.preguntasIds,
    textosIds: prueba.textosIds,
    userId: actor.userId,
  })
  if (aplanarPreguntas(contenido).length === 0) {
    return { error: 'La prueba no tiene preguntas para asignar.' }
  }

  let fechaLimite: Date | null = null
  if (input.fechaLimite) {
    const d = new Date(input.fechaLimite)
    if (Number.isNaN(d.getTime())) return { error: 'Fecha límite inválida.' }
    fechaLimite = d
  }

  const [fila] = await db.insert(asignaciones).values({
    cursoId: curso.id,
    pruebaId: prueba.id,
    titulo: prueba.titulo?.trim() || 'Prueba',
    instrucciones: (input.instrucciones ?? prueba.instrucciones)?.trim() || null,
    contenido,
    fechaLimite,
  }).returning()

  revalidatePath(`/cursos/${curso.id}`)
  return { ok: true, id: fila.id }
}

/**
 * Edita el título y la fecha límite de una tarea ya asignada. Solo el dueño
 * del curso. No toca el contenido/snapshot ni las entregas ya hechas: mover
 * el plazo afecta a partir de ahora (entregarTarea revalida el plazo vigente
 * en cada llamada, no el que había al momento de una entrega anterior).
 */
export async function editarAsignacion(
  id: number,
  input: { titulo: string; fechaLimite?: string | null },
): Promise<{ ok: true } | { error: string }> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }

  const [fila] = await db
    .select({ id: asignaciones.id, cursoId: asignaciones.cursoId })
    .from(asignaciones)
    .innerJoin(cursos, eq(asignaciones.cursoId, cursos.id))
    .where(and(eq(asignaciones.id, id), eq(cursos.userId, actor.userId)))
    .limit(1)
  if (!fila) return { error: 'Tarea no encontrada.' }

  const titulo = input.titulo.trim()
  if (!titulo) return { error: 'El título no puede estar vacío.' }

  let fechaLimite: Date | null = null
  if (input.fechaLimite) {
    const d = new Date(input.fechaLimite)
    if (Number.isNaN(d.getTime())) return { error: 'Fecha límite inválida.' }
    fechaLimite = d
  }

  await db.update(asignaciones).set({ titulo, fechaLimite }).where(eq(asignaciones.id, id))

  revalidatePath(`/cursos/${fila.cursoId}`)
  revalidatePath(`/cursos/${fila.cursoId}/tareas/${id}`)
  revalidatePath('/tareas')
  return { ok: true }
}

/** Elimina la asignación Y sus entregas. Solo el dueño del curso. */
export async function eliminarAsignacion(
  id: number,
): Promise<{ ok: true } | { error: string }> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }

  const [fila] = await db
    .select({ id: asignaciones.id, cursoId: asignaciones.cursoId })
    .from(asignaciones)
    .innerJoin(cursos, eq(asignaciones.cursoId, cursos.id))
    .where(and(eq(asignaciones.id, id), eq(cursos.userId, actor.userId)))
    .limit(1)
  if (!fila) return { error: 'Tarea no encontrada.' }

  await db.transaction(async (tx) => {
    await tx.delete(entregas).where(eq(entregas.asignacionId, fila.id))
    await tx.delete(asignaciones).where(eq(asignaciones.id, fila.id))
  })
  revalidatePath(`/cursos/${fila.cursoId}`)
  return { ok: true }
}
