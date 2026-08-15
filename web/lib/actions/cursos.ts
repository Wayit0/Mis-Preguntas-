'use server'

import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { cursos, inscripciones } from '@/lib/db/schema'
import { getActor } from '@/lib/authz'

export type ResultadoCurso = { ok: true; id: number } | { error: string }

function generarToken(bytes = 12): string {
  return randomBytes(bytes).toString('base64url')
}

/** joinCode único con reintento ante colisión (mismo patrón que colegios). */
async function generarJoinCodeUnico(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const codigo = generarToken(12)
    const [existe] = await db.select({ id: cursos.id }).from(cursos)
      .where(eq(cursos.joinCode, codigo)).limit(1)
    if (!existe) return codigo
  }
  return generarToken(24)
}

/** Crea un curso del profesor actual. Los estudiantes no pueden crear cursos. */
export async function crearCurso(nombre: string): Promise<ResultadoCurso> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }
  if (actor.role === 'student') return { error: 'No autorizado.' }

  const limpio = (nombre ?? '').trim()
  if (!limpio) return { error: 'Ingresa el nombre del curso.' }
  if (limpio.length > 120) return { error: 'El nombre es demasiado largo.' }

  const joinCode = await generarJoinCodeUnico()
  const [fila] = await db.insert(cursos)
    .values({ userId: actor.userId, nombre: limpio, joinCode })
    .returning()
  revalidatePath('/cursos')
  return { ok: true, id: fila.id }
}

/** Quita a un alumno del curso (borra la inscripción, no sus entregas). */
export async function quitarAlumno(
  cursoId: number,
  estudianteId: number,
): Promise<{ ok: true } | { error: string }> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }

  const [curso] = await db.select({ id: cursos.id }).from(cursos)
    .where(and(eq(cursos.id, cursoId), eq(cursos.userId, actor.userId)))
    .limit(1)
  if (!curso) return { error: 'Curso no encontrado.' }

  await db.delete(inscripciones).where(and(
    eq(inscripciones.cursoId, cursoId),
    eq(inscripciones.estudianteId, estudianteId),
  ))
  revalidatePath(`/cursos/${cursoId}`)
  return { ok: true }
}

/**
 * Inscribe al estudiante actual al curso del código. Idempotente si ya estaba.
 * Solo estudiantes: un profesor no se inscribe a cursos.
 */
export async function inscribirConCodigo(
  codigo: string,
): Promise<{ ok: true; cursoId: number } | { error: string }> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }
  if (actor.role !== 'student') return { error: 'Solo los estudiantes pueden unirse a un curso.' }

  const limpio = (codigo ?? '').trim()
  if (!limpio) return { error: 'Ingresa el código del curso.' }

  const [curso] = await db.select({ id: cursos.id }).from(cursos)
    .where(eq(cursos.joinCode, limpio)).limit(1)
  if (!curso) return { error: 'El código no corresponde a ningún curso.' }

  await db.insert(inscripciones)
    .values({ cursoId: curso.id, estudianteId: actor.userId })
    .onConflictDoNothing()
  revalidatePath('/tareas')
  return { ok: true, cursoId: curso.id }
}
