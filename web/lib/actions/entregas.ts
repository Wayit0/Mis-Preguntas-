'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { asignaciones, entregas, inscripciones } from '@/lib/db/schema'
import { getActor } from '@/lib/authz'
import { aplanarPreguntas, corregir } from '@/lib/tareas/contenido'

/**
 * Entrega única de una tarea: valida rol student + inscripción + plazo, corrige
 * las alternativas contra el snapshot del servidor y persiste. El unique
 * (asignacionId, estudianteId) garantiza un intento aunque haya doble submit.
 */
export async function entregarTarea(
  asignacionId: number,
  respuestas: Record<string, string>,
): Promise<{ ok: true; puntaje: number; total: number } | { error: string }> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }
  if (actor.role !== 'student') return { error: 'No autorizado.' }

  const [asig] = await db
    .select({
      id: asignaciones.id,
      contenido: asignaciones.contenido,
      fechaLimite: asignaciones.fechaLimite,
    })
    .from(asignaciones)
    .innerJoin(inscripciones, and(
      eq(inscripciones.cursoId, asignaciones.cursoId),
      eq(inscripciones.estudianteId, actor.userId),
    ))
    .where(eq(asignaciones.id, asignacionId))
    .limit(1)
  if (!asig) return { error: 'Tarea no encontrada.' }

  if (asig.fechaLimite && asig.fechaLimite < new Date()) {
    return { error: 'El plazo de entrega ya venció.' }
  }

  // Sanitiza: solo claves de índices válidos y valores string acotados.
  const n = aplanarPreguntas(asig.contenido).length
  const limpias: Record<string, string> = {}
  for (let i = 0; i < n; i++) {
    const v = respuestas?.[String(i)]
    if (typeof v === 'string' && v.trim()) limpias[String(i)] = v.slice(0, 10000)
  }

  const { puntaje, total } = corregir(asig.contenido, limpias)
  try {
    await db.insert(entregas).values({
      asignacionId: asig.id,
      estudianteId: actor.userId,
      respuestas: limpias,
      puntaje,
      total,
    })
  } catch {
    // Violación del unique = ya entregó.
    return { error: 'Ya entregaste esta tarea.' }
  }
  revalidatePath(`/tareas/${asig.id}`)
  revalidatePath('/tareas')
  return { ok: true, puntaje, total }
}
