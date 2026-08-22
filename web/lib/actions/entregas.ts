'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { asignaciones, entregas, inscripciones } from '@/lib/db/schema'
import { getActor } from '@/lib/authz'
import { aplanarPreguntas, corregir } from '@/lib/tareas/contenido'

/**
 * Entrega de una tarea: valida rol student + inscripción + plazo, corrige las
 * alternativas contra el snapshot del servidor y persiste. El estudiante puede
 * rehacerla mientras no venza el plazo: `onConflictDoUpdate` sobre el unique
 * (asignacionId, estudianteId) sobrescribe la entrega anterior (respuestas,
 * puntaje y fecha) en vez de fallar por duplicado.
 */
export async function entregarTarea(
  asignacionId: number,
  respuestas: Record<string, string>,
): Promise<{ ok: true; puntaje: number; total: number } | { error: string }> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }
  if (actor.role !== 'student') return { error: 'No autorizado.' }
  if (!Number.isFinite(asignacionId)) return { error: 'Tarea no encontrada.' }

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
    await db
      .insert(entregas)
      .values({
        asignacionId: asig.id,
        estudianteId: actor.userId,
        respuestas: limpias,
        puntaje,
        total,
      })
      .onConflictDoUpdate({
        target: [entregas.asignacionId, entregas.estudianteId],
        set: { respuestas: limpias, puntaje, total, enviadoEl: new Date() },
      })
  } catch (e) {
    console.error('[entregas]', e)
    return { error: 'No se pudo guardar tu entrega. Intenta de nuevo.' }
  }
  revalidatePath(`/tareas/${asig.id}`)
  revalidatePath('/tareas')
  return { ok: true, puntaje, total }
}
