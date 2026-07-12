import { and, count, desc, eq, gt, ilike, isNull, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { preguntas } from '@/lib/db/schema'

/** Tamaño de página por defecto en las listas paginadas. */
export const POR_PAGINA_PREGUNTAS = 24

/**
 * La asignatura con más preguntas del usuario. Alimenta el default del contexto
 * de asignatura cuando el usuario aún no ha elegido una (no hay cookie). Devuelve
 * `null` si el usuario no tiene ninguna pregunta.
 */
export async function asignaturaMasUsada(userId: number): Promise<string | null> {
  const filas = await db
    .select({ asignatura: preguntas.asignatura, n: count() })
    .from(preguntas)
    .where(eq(preguntas.userId, userId))
    .groupBy(preguntas.asignatura)
    .orderBy(desc(count()))
    .limit(1)
  return filas[0]?.asignatura ?? null
}

/** Una fila de la tabla `preguntas` tal cual se lee de la base. */
export type Pregunta = typeof preguntas.$inferSelect

/** Estado de compartición usado por el filtro de la lista. */
export type EstadoCompartida = 'todas' | 'compartida' | 'privada'

export interface FiltrosPreguntas {
  materia?: string
  nivel?: string
  estado?: EstadoCompartida
  /** Búsqueda por código (#123) o texto libre en el enunciado. */
  busqueda?: string
  /**
   * Filtro por carpeta: `undefined` = todas (no filtra), `null` = sin carpeta
   * (raíz), `number` = esa carpeta.
   */
  carpetaId?: number | null
}

/** Página de resultados: los ítems de la página + el total (para el paginador). */
export interface PaginaPreguntas {
  items: Pregunta[]
  total: number
}

function condicionesPreguntas(
  userId: number,
  asignatura?: string,
  filtros?: FiltrosPreguntas,
): SQL[] {
  const conds: SQL[] = [eq(preguntas.userId, userId)]
  if (asignatura) conds.push(eq(preguntas.asignatura, asignatura))
  if (filtros?.materia) conds.push(eq(preguntas.materia, filtros.materia))
  if (filtros?.nivel) conds.push(eq(preguntas.nivel, filtros.nivel))
  if (filtros?.estado === 'compartida') conds.push(gt(preguntas.compartida, 0))
  if (filtros?.estado === 'privada') conds.push(eq(preguntas.compartida, 0))
  if (filtros?.carpetaId === null) conds.push(isNull(preguntas.carpetaId))
  else if (typeof filtros?.carpetaId === 'number') {
    conds.push(eq(preguntas.carpetaId, filtros.carpetaId))
  }
  if (filtros?.busqueda) {
    const term = filtros.busqueda.trim()
    const sinHash = term.replace(/^#/, '')
    const numId = Number(sinHash)
    if (sinHash && Number.isInteger(numId) && numId > 0) {
      conds.push(eq(preguntas.id, numId))
    } else if (term) {
      conds.push(ilike(preguntas.pregunta, `%${term}%`))
    }
  }
  return conds
}

/**
 * Preguntas del usuario acotadas por asignatura, filtros (materia/nivel/estado/
 * carpeta) y búsqueda, PAGINADAS. Orden descendente por id (más recientes
 * primero). Devuelve la página y el total de coincidencias.
 */
export async function listarPreguntasPropias(
  userId: number,
  asignatura?: string,
  filtros?: FiltrosPreguntas,
  pagina = 1,
  porPagina = POR_PAGINA_PREGUNTAS,
): Promise<PaginaPreguntas> {
  const where = and(...condicionesPreguntas(userId, asignatura, filtros))
  const [{ n }] = await db
    .select({ n: count() })
    .from(preguntas)
    .where(where)
  const items = await db
    .select()
    .from(preguntas)
    .where(where)
    .orderBy(desc(preguntas.id))
    .limit(porPagina)
    .offset(Math.max(0, (pagina - 1) * porPagina))
  return { items, total: Number(n) }
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
