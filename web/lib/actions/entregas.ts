'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { asignaciones, borradoresTarea, entregas, inscripciones } from '@/lib/db/schema'
import { getActor, type Actor } from '@/lib/authz'
import { aplanarPreguntas, corregir, type ContenidoAsignacion } from '@/lib/tareas/contenido'

interface AsignacionVigente {
  id: number
  contenido: ContenidoAsignacion
  fechaLimite: Date | null
}

/**
 * Carga la asignación + valida inscripción y plazo; usado por `entregarTarea`
 * y `guardarBorradorTarea` para no duplicar el guard. `null` = no encontrada o
 * el estudiante no está inscrito; el plazo vencido se reporta como error
 * aparte porque ambos llamadores dan un mensaje distinto según el contexto.
 */
async function cargarAsignacionVigente(
  asignacionId: number,
  estudianteId: number,
): Promise<AsignacionVigente | null> {
  if (!Number.isFinite(asignacionId)) return null
  const [asig] = await db
    .select({
      id: asignaciones.id,
      contenido: asignaciones.contenido,
      fechaLimite: asignaciones.fechaLimite,
    })
    .from(asignaciones)
    .innerJoin(inscripciones, and(
      eq(inscripciones.cursoId, asignaciones.cursoId),
      eq(inscripciones.estudianteId, estudianteId),
    ))
    .where(eq(asignaciones.id, asignacionId))
    .limit(1)
  return asig ?? null
}

/** Sanitiza: solo claves de índices válidos (según el contenido) y valores string acotados. */
function limpiarRespuestas(
  contenido: ContenidoAsignacion,
  respuestas: Record<string, string>,
): Record<string, string> {
  const n = aplanarPreguntas(contenido).length
  const limpias: Record<string, string> = {}
  for (let i = 0; i < n; i++) {
    const v = respuestas?.[String(i)]
    if (typeof v === 'string' && v.trim()) limpias[String(i)] = v.slice(0, 10000)
  }
  return limpias
}

function requireEstudianteActor(actor: Actor | null): { error: string } | null {
  if (!actor) return { error: 'Debes iniciar sesión.' }
  if (actor.role !== 'student') return { error: 'No autorizado.' }
  return null
}

/**
 * Entrega de una tarea: valida rol student + inscripción + plazo, corrige las
 * alternativas contra el snapshot del servidor y persiste. El estudiante puede
 * rehacerla mientras no venza el plazo: `onConflictDoUpdate` sobre el unique
 * (asignacionId, estudianteId) sobrescribe la entrega anterior (respuestas,
 * puntaje y fecha) en vez de fallar por duplicado. El borrador (pre-guardado)
 * se borra al entregar: ya cumplió su propósito y no debe convivir con la
 * entrega final.
 */
export async function entregarTarea(
  asignacionId: number,
  respuestas: Record<string, string>,
): Promise<{ ok: true; puntaje: number; total: number } | { error: string }> {
  const actor = await getActor()
  const rechazo = requireEstudianteActor(actor)
  if (rechazo) return rechazo

  const asig = await cargarAsignacionVigente(asignacionId, actor!.userId)
  if (!asig) return { error: 'Tarea no encontrada.' }
  if (asig.fechaLimite && asig.fechaLimite < new Date()) {
    return { error: 'El plazo de entrega ya venció.' }
  }

  const limpias = limpiarRespuestas(asig.contenido, respuestas)
  const { puntaje, total } = corregir(asig.contenido, limpias)
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(entregas)
        .values({
          asignacionId: asig.id,
          estudianteId: actor!.userId,
          respuestas: limpias,
          puntaje,
          total,
        })
        .onConflictDoUpdate({
          target: [entregas.asignacionId, entregas.estudianteId],
          set: { respuestas: limpias, puntaje, total, enviadoEl: new Date() },
        })
      await tx
        .delete(borradoresTarea)
        .where(and(
          eq(borradoresTarea.asignacionId, asig.id),
          eq(borradoresTarea.estudianteId, actor!.userId),
        ))
    })
  } catch (e) {
    console.error('[entregas]', e)
    return { error: 'No se pudo guardar tu entrega. Intenta de nuevo.' }
  }
  revalidatePath(`/tareas/${asig.id}`)
  revalidatePath('/tareas')
  return { ok: true, puntaje, total }
}

/**
 * Pre-guardado de una tarea EN CURSO (no es la entrega final): autoguardado
 * silencioso mientras el estudiante responde, para que pueda cerrar y retomar
 * después sin perder lo avanzado. `onConflictDoUpdate` sobrescribe el borrador
 * anterior completo. No revalida rutas (se llama muy seguido, con debounce
 * desde el cliente) y no se usa una vez que existe una entrega real.
 */
export async function guardarBorradorTarea(
  asignacionId: number,
  respuestas: Record<string, string>,
): Promise<{ ok: true } | { error: string }> {
  const actor = await getActor()
  const rechazo = requireEstudianteActor(actor)
  if (rechazo) return rechazo

  const asig = await cargarAsignacionVigente(asignacionId, actor!.userId)
  if (!asig) return { error: 'Tarea no encontrada.' }
  if (asig.fechaLimite && asig.fechaLimite < new Date()) {
    return { error: 'El plazo de entrega ya venció.' }
  }

  const limpias = limpiarRespuestas(asig.contenido, respuestas)
  try {
    await db
      .insert(borradoresTarea)
      .values({ asignacionId: asig.id, estudianteId: actor!.userId, respuestas: limpias })
      .onConflictDoUpdate({
        target: [borradoresTarea.asignacionId, borradoresTarea.estudianteId],
        set: { respuestas: limpias, updatedAt: new Date() },
      })
  } catch (e) {
    console.error('[borradores-tarea]', e)
    return { error: 'No se pudo guardar el borrador.' }
  }
  return { ok: true }
}
