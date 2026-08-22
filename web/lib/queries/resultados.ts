import { and, count, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { asignaciones, cursos, entregas, inscripciones, usuarios } from '@/lib/db/schema'
import type { ContenidoAsignacion } from '@/lib/tareas/contenido'

export interface AsignacionResumen {
  id: number
  titulo: string
  fechaLimite: Date | null
  nEntregas: number
  nAlumnos: number
  createdAt: Date
}

/** Asignaciones de un curso del profesor, con avance. Vacío si es ajeno. */
export async function listarAsignacionesDeCurso(
  cursoId: number,
  userId: number,
): Promise<AsignacionResumen[]> {
  const [curso] = await db.select({ id: cursos.id }).from(cursos)
    .where(and(eq(cursos.id, cursoId), eq(cursos.userId, userId))).limit(1)
  if (!curso) return []

  const [filas, [alumnos], porAsig] = await Promise.all([
    db.select().from(asignaciones).where(eq(asignaciones.cursoId, cursoId))
      .orderBy(desc(asignaciones.createdAt), desc(asignaciones.id)),
    db.select({ n: count() }).from(inscripciones)
      .where(eq(inscripciones.cursoId, cursoId)),
    db.select({ asignacionId: entregas.asignacionId, n: count() }).from(entregas)
      .innerJoin(asignaciones, eq(entregas.asignacionId, asignaciones.id))
      .where(eq(asignaciones.cursoId, cursoId))
      .groupBy(entregas.asignacionId),
  ])
  const nEntregas = new Map(porAsig.map((e) => [e.asignacionId, Number(e.n)]))
  return filas.map((a) => ({
    id: a.id,
    titulo: a.titulo,
    fechaLimite: a.fechaLimite,
    nEntregas: nEntregas.get(a.id) ?? 0,
    nAlumnos: Number(alumnos.n),
    createdAt: a.createdAt,
  }))
}

export interface FilaResultado {
  estudianteId: number
  nombre: string
  entrega: {
    respuestas: Record<string, string>
    /** Dibujos del desarrollo, por índice de pregunta (ver `entregas.dibujos`). */
    dibujos: Record<string, string>
    puntaje: number
    total: number
    enviadoEl: Date
  } | null
}

export interface Resultados {
  id: number
  titulo: string
  fechaLimite: Date | null
  cursoId: number
  cursoNombre: string
  contenido: ContenidoAsignacion
  filas: FilaResultado[]
}

/** Resultados de una asignación con guard de propiedad del curso. */
export async function cargarResultados(
  asignacionId: number,
  userId: number,
): Promise<Resultados | null> {
  if (!Number.isFinite(asignacionId)) return null
  const [asig] = await db
    .select({
      id: asignaciones.id,
      titulo: asignaciones.titulo,
      fechaLimite: asignaciones.fechaLimite,
      contenido: asignaciones.contenido,
      cursoId: cursos.id,
      cursoNombre: cursos.nombre,
    })
    .from(asignaciones)
    .innerJoin(cursos, eq(asignaciones.cursoId, cursos.id))
    .where(and(eq(asignaciones.id, asignacionId), eq(cursos.userId, userId)))
    .limit(1)
  if (!asig) return null

  const [alumnos, filasEntregas] = await Promise.all([
    db.select({ id: usuarios.id, nombre: usuarios.nombre })
      .from(inscripciones)
      .innerJoin(usuarios, eq(inscripciones.estudianteId, usuarios.id))
      .where(eq(inscripciones.cursoId, asig.cursoId))
      .orderBy(usuarios.nombre),
    db.select().from(entregas).where(eq(entregas.asignacionId, asignacionId)),
  ])
  const porEstudiante = new Map(filasEntregas.map((e) => [e.estudianteId, e]))

  return {
    ...asig,
    filas: alumnos.map((a) => {
      const e = porEstudiante.get(a.id)
      return {
        estudianteId: a.id,
        nombre: a.nombre,
        entrega: e
          ? {
              respuestas: e.respuestas,
              dibujos: e.dibujos,
              puntaje: e.puntaje,
              total: e.total,
              enviadoEl: e.enviadoEl,
            }
          : null,
      }
    }),
  }
}
