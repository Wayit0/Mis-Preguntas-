'use server'

import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { asignaciones, borradoresTarea, entregas, inscripciones } from '@/lib/db/schema'
import { getActor, type Actor } from '@/lib/authz'
import { aplanarPreguntas, corregir, type ContenidoAsignacion } from '@/lib/tareas/contenido'
import { deleteBlob, uploadImage } from '@/lib/storage/blob'

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
 * puntaje y fecha) en vez de fallar por duplicado, e incrementa `intentos`
 * (cuántas veces se entregó esta tarea — estadística de admin). Los dibujos NO viajan como
 * parámetro (ya se subieron al Blob uno por uno desde `guardarDibujoTarea`):
 * se toman tal cual del borrador vigente. El borrador se borra al entregar:
 * ya cumplió su propósito y no debe convivir con la entrega final.
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
      const [borrador] = await tx
        .select({ dibujos: borradoresTarea.dibujos })
        .from(borradoresTarea)
        .where(and(
          eq(borradoresTarea.asignacionId, asig.id),
          eq(borradoresTarea.estudianteId, actor!.userId),
        ))
        .limit(1)
      const dibujos = borrador?.dibujos ?? {}

      await tx
        .insert(entregas)
        .values({
          asignacionId: asig.id,
          estudianteId: actor!.userId,
          respuestas: limpias,
          dibujos,
          puntaje,
          total,
        })
        .onConflictDoUpdate({
          target: [entregas.asignacionId, entregas.estudianteId],
          set: {
            respuestas: limpias,
            dibujos,
            puntaje,
            total,
            enviadoEl: new Date(),
            intentos: sql`${entregas.intentos} + 1`,
          },
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

/**
 * Guarda (o reemplaza) el dibujo de una pregunta de desarrollo: sube el PNG
 * del `<canvas>` al Blob y persiste su clave en el borrador, bajo el mismo
 * índice de pregunta aplanada que usa `respuestas`. Reemplaza siempre el
 * dibujo anterior de esa pregunta (si había) y borra su blob para no dejar
 * huérfanos — cada trazo termina subiendo la imagen completa, no un delta.
 */
export async function guardarDibujoTarea(
  asignacionId: number,
  indice: number,
  formData: FormData,
): Promise<{ ok: true; key: string } | { error: string }> {
  const actor = await getActor()
  const rechazo = requireEstudianteActor(actor)
  if (rechazo) return rechazo
  if (!Number.isInteger(indice) || indice < 0) return { error: 'Pregunta inválida.' }

  const asig = await cargarAsignacionVigente(asignacionId, actor!.userId)
  if (!asig) return { error: 'Tarea no encontrada.' }
  if (asig.fechaLimite && asig.fechaLimite < new Date()) {
    return { error: 'El plazo de entrega ya venció.' }
  }
  if (indice >= aplanarPreguntas(asig.contenido).length) {
    return { error: 'Pregunta inválida.' }
  }

  const archivo = formData.get('imagen')
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: 'Dibujo inválido.' }
  }

  let key: string
  try {
    key = await uploadImage(archivo)
  } catch (e) {
    console.error('[borradores-tarea:dibujo]', e)
    return { error: 'No se pudo guardar el dibujo.' }
  }

  const [actual] = await db
    .select({ dibujos: borradoresTarea.dibujos })
    .from(borradoresTarea)
    .where(and(
      eq(borradoresTarea.asignacionId, asig.id),
      eq(borradoresTarea.estudianteId, actor!.userId),
    ))
    .limit(1)
  const keyAnterior = actual?.dibujos?.[String(indice)]
  const dibujos = { ...actual?.dibujos, [String(indice)]: key }

  try {
    await db
      .insert(borradoresTarea)
      .values({ asignacionId: asig.id, estudianteId: actor!.userId, respuestas: {}, dibujos })
      .onConflictDoUpdate({
        target: [borradoresTarea.asignacionId, borradoresTarea.estudianteId],
        set: { dibujos, updatedAt: new Date() },
      })
  } catch (e) {
    console.error('[borradores-tarea:dibujo]', e)
    // El blob ya se subió pero no se pudo referenciar: se limpia para no
    // dejarlo huérfano.
    await deleteBlob(key).catch(() => {})
    return { error: 'No se pudo guardar el dibujo.' }
  }
  if (keyAnterior && keyAnterior !== key) {
    await deleteBlob(keyAnterior).catch(() => {})
  }
  return { ok: true, key }
}
