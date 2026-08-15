import { and, count, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { asignaciones, cursos, inscripciones, usuarios } from '@/lib/db/schema'

export interface CursoResumen {
  id: number
  nombre: string
  joinCode: string
  nAlumnos: number
  nTareas: number
}

/** Cursos del profesor con conteo de alumnos y tareas. */
export async function listarCursosPropios(userId: number): Promise<CursoResumen[]> {
  const filas = await db.select().from(cursos)
    .where(eq(cursos.userId, userId))
    .orderBy(desc(cursos.createdAt), desc(cursos.id))
  if (filas.length === 0) return []

  const [alumnos, tareas] = await Promise.all([
    db.select({ cursoId: inscripciones.cursoId, n: count() }).from(inscripciones)
      .innerJoin(cursos, eq(inscripciones.cursoId, cursos.id))
      .where(eq(cursos.userId, userId))
      .groupBy(inscripciones.cursoId),
    db.select({ cursoId: asignaciones.cursoId, n: count() }).from(asignaciones)
      .innerJoin(cursos, eq(asignaciones.cursoId, cursos.id))
      .where(eq(cursos.userId, userId))
      .groupBy(asignaciones.cursoId),
  ])
  const nAlumnos = new Map(alumnos.map((a) => [a.cursoId, Number(a.n)]))
  const nTareas = new Map(tareas.map((t) => [t.cursoId, Number(t.n)]))
  return filas.map((c) => ({
    id: c.id, nombre: c.nombre, joinCode: c.joinCode,
    nAlumnos: nAlumnos.get(c.id) ?? 0,
    nTareas: nTareas.get(c.id) ?? 0,
  }))
}

export interface CursoDetalle {
  id: number
  nombre: string
  joinCode: string
  alumnos: { id: number; nombre: string; email: string }[]
}

/** Detalle de un curso con guard de propiedad (null si no existe o es ajeno). */
export async function cargarCursoPorId(
  id: number,
  userId: number,
): Promise<CursoDetalle | null> {
  if (!Number.isFinite(id)) return null
  const [curso] = await db.select().from(cursos)
    .where(and(eq(cursos.id, id), eq(cursos.userId, userId))).limit(1)
  if (!curso) return null

  const alumnos = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email })
    .from(inscripciones)
    .innerJoin(usuarios, eq(inscripciones.estudianteId, usuarios.id))
    .where(eq(inscripciones.cursoId, id))
    .orderBy(usuarios.nombre)

  return { id: curso.id, nombre: curso.nombre, joinCode: curso.joinCode, alumnos }
}

/** Cursos en los que está inscrito un estudiante. */
export async function cursosDeEstudiante(
  estudianteId: number,
): Promise<{ id: number; nombre: string }[]> {
  return db.select({ id: cursos.id, nombre: cursos.nombre })
    .from(inscripciones)
    .innerJoin(cursos, eq(inscripciones.cursoId, cursos.id))
    .where(eq(inscripciones.estudianteId, estudianteId))
    .orderBy(cursos.nombre)
}
