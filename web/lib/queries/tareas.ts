import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  asignaciones,
  borradoresTarea,
  cursos,
  entregas,
  inscripciones,
  pruebas,
} from '@/lib/db/schema'
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
  | (TareaBase & {
      entregada: false
      contenido: ContenidoEstudiante
      /** Último pre-guardado (autoguardado) de la tarea en curso, si existe. */
      borrador: Record<string, string>
      /** Dibujos del desarrollo pre-guardados, por índice de pregunta. */
      dibujos: Record<string, string>
    })
  | (TareaBase & {
      entregada: true
      contenido: ContenidoAsignacion
      respuestas: Record<string, string>
      /** Dibujos del desarrollo entregados, por índice de pregunta. */
      dibujos: Record<string, string>
      puntaje: number
      total: number
    })

/**
 * Fila cruda de la asignación (guard de inscripción incluido), compartida por
 * `cargarTareaParaEstudiante` y `cargarTareaParaRehacer`. Null si la asignación
 * no existe o el estudiante no está inscrito en su curso.
 */
async function cargarFilaAsignacion(
  asignacionId: number,
  estudianteId: number,
): Promise<(TareaBase & { contenido: ContenidoAsignacion }) | null> {
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
  return fila ?? null
}

/** Respuestas y dibujos del último pre-guardado, o vacíos si no hay ninguno. */
async function cargarBorrador(
  asignacionId: number,
  estudianteId: number,
): Promise<{ respuestas: Record<string, string>; dibujos: Record<string, string> }> {
  const [borrador] = await db
    .select({ respuestas: borradoresTarea.respuestas, dibujos: borradoresTarea.dibujos })
    .from(borradoresTarea)
    .where(and(
      eq(borradoresTarea.asignacionId, asignacionId),
      eq(borradoresTarea.estudianteId, estudianteId),
    ))
    .limit(1)
  return { respuestas: borrador?.respuestas ?? {}, dibujos: borrador?.dibujos ?? {} }
}

/**
 * Carga una tarea PARA el estudiante: null si la asignación no existe o él no
 * está inscrito en su curso. Sin entrega, el contenido va SIN correctas ni
 * explicaciones (más el último pre-guardado, si existe); con entrega, va
 * completo más sus respuestas y puntaje.
 */
export async function cargarTareaParaEstudiante(
  asignacionId: number,
  estudianteId: number,
): Promise<TareaEstudiante | null> {
  const fila = await cargarFilaAsignacion(asignacionId, estudianteId)
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
    const { respuestas: borrador, dibujos } = await cargarBorrador(asignacionId, estudianteId)
    return {
      ...base,
      entregada: false,
      contenido: sinRespuestas(fila.contenido),
      borrador,
      dibujos,
    }
  }
  return {
    ...base,
    entregada: true,
    contenido: fila.contenido,
    respuestas: entrega.respuestas,
    dibujos: entrega.dibujos,
    puntaje: entrega.puntaje,
    total: entrega.total,
  }
}

/**
 * Carga una tarea YA entregada para rehacerla: mismo guard de inscripción,
 * pero el contenido siempre va SIN correctas ni explicaciones (como una tarea
 * nueva) más el pre-guardado del intento en curso, si existe. Ignora la
 * entrega previa, que se sobrescribirá al reenviar. El llamador (la página) es
 * responsable de no ofrecer esto si el plazo venció.
 */
export async function cargarTareaParaRehacer(
  asignacionId: number,
  estudianteId: number,
): Promise<
  | (TareaBase & {
      entregada: false
      contenido: ContenidoEstudiante
      borrador: Record<string, string>
      dibujos: Record<string, string>
    })
  | null
> {
  const fila = await cargarFilaAsignacion(asignacionId, estudianteId)
  if (!fila) return null
  const { respuestas: borrador, dibujos } = await cargarBorrador(asignacionId, estudianteId)
  return {
    id: fila.id,
    titulo: fila.titulo,
    instrucciones: fila.instrucciones,
    fechaLimite: fila.fechaLimite,
    curso: fila.curso,
    entregada: false,
    contenido: sinRespuestas(fila.contenido),
    borrador,
    dibujos,
  }
}
