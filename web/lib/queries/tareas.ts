import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { asignaciones, cursos, entregas, inscripciones, pruebas } from '@/lib/db/schema'
import {
  sinRespuestas,
  type ContenidoAsignacion,
  type ContenidoEstudiante,
} from '@/lib/tareas/contenido'

export interface TareaResumen {
  id: number
  titulo: string
  cursoId: number
  curso: string
  // De la prueba de origen (asignaciones.pruebaId es informativa, puede
  // quedar huérfana si se borró la prueba) — null si ya no existe.
  asignatura: string | null
  fechaLimite: Date | null
  estado: 'pendiente' | 'entregada' | 'vencida'
  puntaje: number | null
  total: number | null
}

function estadoDe(
  fechaLimite: Date | null,
  entrega: { puntaje: number } | undefined,
): TareaResumen['estado'] {
  if (entrega) return 'entregada'
  if (fechaLimite && fechaLimite < new Date()) return 'vencida'
  return 'pendiente'
}

/** Todas las asignaciones de los cursos del estudiante, con su estado. */
export async function listarTareasDeEstudiante(
  estudianteId: number,
): Promise<TareaResumen[]> {
  const filas = await db
    .select({
      id: asignaciones.id,
      titulo: asignaciones.titulo,
      cursoId: cursos.id,
      curso: cursos.nombre,
      asignatura: pruebas.asignatura,
      fechaLimite: asignaciones.fechaLimite,
    })
    .from(inscripciones)
    .innerJoin(cursos, eq(inscripciones.cursoId, cursos.id))
    .innerJoin(asignaciones, eq(asignaciones.cursoId, cursos.id))
    .leftJoin(pruebas, eq(pruebas.id, asignaciones.pruebaId))
    .where(eq(inscripciones.estudianteId, estudianteId))
    .orderBy(desc(asignaciones.createdAt), desc(asignaciones.id))
  if (filas.length === 0) return []

  const propias = await db.select().from(entregas).where(and(
    eq(entregas.estudianteId, estudianteId),
    inArray(entregas.asignacionId, filas.map((f) => f.id)),
  ))
  const porAsig = new Map(propias.map((e) => [e.asignacionId, e]))

  return filas.map((f) => {
    const entrega = porAsig.get(f.id)
    return {
      id: f.id,
      titulo: f.titulo,
      cursoId: f.cursoId,
      curso: f.curso,
      asignatura: f.asignatura,
      fechaLimite: f.fechaLimite,
      estado: estadoDe(f.fechaLimite, entrega),
      puntaje: entrega?.puntaje ?? null,
      total: entrega?.total ?? null,
    }
  })
}

interface TareaBase {
  id: number
  titulo: string
  instrucciones: string | null
  fechaLimite: Date | null
  curso: string
}

export type TareaEstudiante =
  | (TareaBase & { entregada: false; contenido: ContenidoEstudiante })
  | (TareaBase & {
      entregada: true
      contenido: ContenidoAsignacion
      respuestas: Record<string, string>
      puntaje: number
      total: number
    })

/**
 * Carga una tarea PARA el estudiante: null si la asignación no existe o él no
 * está inscrito en su curso. Sin entrega, el contenido va SIN correctas ni
 * explicaciones; con entrega, va completo más sus respuestas y puntaje.
 */
export async function cargarTareaParaEstudiante(
  asignacionId: number,
  estudianteId: number,
): Promise<TareaEstudiante | null> {
  if (!Number.isFinite(asignacionId)) return null
  const [fila] = await db
    .select({
      id: asignaciones.id,
      titulo: asignaciones.titulo,
      instrucciones: asignaciones.instrucciones,
      fechaLimite: asignaciones.fechaLimite,
      contenido: asignaciones.contenido,
      curso: cursos.nombre,
    })
    .from(asignaciones)
    .innerJoin(cursos, eq(asignaciones.cursoId, cursos.id))
    .innerJoin(inscripciones, and(
      eq(inscripciones.cursoId, cursos.id),
      eq(inscripciones.estudianteId, estudianteId),
    ))
    .where(eq(asignaciones.id, asignacionId))
    .limit(1)
  if (!fila) return null

  const [entrega] = await db.select().from(entregas).where(and(
    eq(entregas.asignacionId, asignacionId),
    eq(entregas.estudianteId, estudianteId),
  )).limit(1)

  const base: TareaBase = {
    id: fila.id,
    titulo: fila.titulo,
    instrucciones: fila.instrucciones,
    fechaLimite: fila.fechaLimite,
    curso: fila.curso,
  }
  if (!entrega) {
    return { ...base, entregada: false, contenido: sinRespuestas(fila.contenido) }
  }
  return {
    ...base,
    entregada: true,
    contenido: fila.contenido,
    respuestas: entrega.respuestas,
    puntaje: entrega.puntaje,
    total: entrega.total,
  }
}
