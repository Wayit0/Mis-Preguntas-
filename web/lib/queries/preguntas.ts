import { and, desc, eq, gt, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { preguntas } from '@/lib/db/schema'

/** Una fila de la tabla `preguntas` tal cual se lee de la base. */
export type Pregunta = typeof preguntas.$inferSelect

/** Estado de compartición usado por el filtro de la lista. */
export type EstadoCompartida = 'todas' | 'compartida' | 'privada'

export interface FiltrosPreguntas {
  materia?: string
  nivel?: string
  estado?: EstadoCompartida
}

/**
 * Preguntas creadas por el usuario, opcionalmente acotadas a una asignatura y a
 * los filtros de materia/nivel/estado. Orden descendente por id (las más
 * recientes primero).
 */
export async function listarPreguntasPropias(
  userId: number,
  asignatura?: string,
  filtros?: FiltrosPreguntas,
): Promise<Pregunta[]> {
  const conds: SQL[] = [eq(preguntas.userId, userId)]
  if (asignatura) conds.push(eq(preguntas.asignatura, asignatura))
  if (filtros?.materia) conds.push(eq(preguntas.materia, filtros.materia))
  if (filtros?.nivel) conds.push(eq(preguntas.nivel, filtros.nivel))
  if (filtros?.estado === 'compartida') conds.push(gt(preguntas.compartida, 0))
  if (filtros?.estado === 'privada') conds.push(eq(preguntas.compartida, 0))

  return db
    .select()
    .from(preguntas)
    .where(and(...conds))
    .orderBy(desc(preguntas.id))
}

export interface OpcionesFiltros {
  materias: string[]
  niveles: string[]
}

/**
 * Valores distintos de materia y nivel entre las preguntas del usuario (acotado
 * a la asignatura si se indica). Alimenta los selects de la barra de filtros.
 */
export async function opcionesDeFiltros(
  userId: number,
  asignatura?: string,
): Promise<OpcionesFiltros> {
  const conds: SQL[] = [eq(preguntas.userId, userId)]
  if (asignatura) conds.push(eq(preguntas.asignatura, asignatura))

  const filas = await db
    .selectDistinct({ materia: preguntas.materia, nivel: preguntas.nivel })
    .from(preguntas)
    .where(and(...conds))

  const materias = new Set<string>()
  const niveles = new Set<string>()
  for (const f of filas) {
    if (f.materia) materias.add(f.materia)
    if (f.nivel) niveles.add(f.nivel)
  }

  return {
    materias: [...materias].sort((a, b) => a.localeCompare(b, 'es')),
    niveles: [...niveles].sort((a, b) => a.localeCompare(b, 'es')),
  }
}

/**
 * Carga una pregunta concreta del usuario (para editar). Devuelve `null` si no
 * existe o no le pertenece (guard de propiedad). Tolera ids no numéricos.
 */
export async function cargarPreguntaPorId(
  id: number,
  userId: number,
): Promise<Pregunta | null> {
  if (!Number.isFinite(id)) return null
  const [fila] = await db
    .select()
    .from(preguntas)
    .where(and(eq(preguntas.id, id), eq(preguntas.userId, userId)))
    .limit(1)
  return fila ?? null
}
