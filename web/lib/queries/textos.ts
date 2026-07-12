import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  type SQL,
} from 'drizzle-orm'
import { db } from '@/lib/db'
import { preguntas, textos } from '@/lib/db/schema'

/** Una fila de la tabla `textos` tal cual se lee de la base. */
export type Texto = typeof textos.$inferSelect

/** Una fila de la tabla `preguntas` (subconjunto compartido con queries/preguntas). */
export type PreguntaDeTexto = typeof preguntas.$inferSelect

export const POR_PAGINA_TEXTOS = 24

export interface FiltrosTextos {
  /** Búsqueda por título. */
  busqueda?: string
  /** `undefined` = todas; `null` = sin carpeta; `number` = esa carpeta. */
  carpetaId?: number | null
}

export interface PaginaTextos {
  items: Texto[]
  total: number
}

/**
 * Textos del usuario acotados por asignatura, búsqueda (título) y carpeta,
 * PAGINADOS. Orden descendente por fecha (id como desempate).
 */
export async function cargarTextosPropios(
  userId: number,
  asignatura?: string,
  filtros?: FiltrosTextos,
  pagina = 1,
  porPagina = POR_PAGINA_TEXTOS,
): Promise<PaginaTextos> {
  const conds: SQL[] = [eq(textos.userId, userId)]
  if (asignatura) conds.push(eq(textos.asignatura, asignatura))
  if (filtros?.carpetaId === null) conds.push(isNull(textos.carpetaId))
  else if (typeof filtros?.carpetaId === 'number') {
    conds.push(eq(textos.carpetaId, filtros.carpetaId))
  }
  if (filtros?.busqueda?.trim()) {
    conds.push(ilike(textos.titulo, `%${filtros.busqueda.trim()}%`))
  }
  const where = and(...conds)

  const [{ n }] = await db.select({ n: count() }).from(textos).where(where)
  const items = await db
    .select()
    .from(textos)
    .where(where)
    .orderBy(desc(textos.createdAt), desc(textos.id))
    .limit(porPagina)
    .offset(Math.max(0, (pagina - 1) * porPagina))
  return { items, total: Number(n) }
}

/**
 * Carga un texto por id con guard de propiedad: devuelve la fila sólo si es del
 * usuario, o `null` en caso contrario (no existe o es de otro).
 */
export async function cargarTextoPorId(
  id: number,
  userId: number,
): Promise<Texto | null> {
  if (!Number.isFinite(id)) return null
  const [fila] = await db
    .select()
    .from(textos)
    .where(and(eq(textos.id, id), eq(textos.userId, userId)))
    .limit(1)
  return fila ?? null
}

/**
 * Preguntas asociadas a un texto (`texto_id = textoId`), ordenadas por id. Igual
 * que `cargar_preguntas_de_texto` en app.py. Tolera ids no numéricos.
 */
export async function cargarPreguntasDeTexto(
  textoId: number,
): Promise<PreguntaDeTexto[]> {
  if (!Number.isFinite(textoId)) return []
  return db
    .select()
    .from(preguntas)
    .where(eq(preguntas.textoId, textoId))
    .orderBy(asc(preguntas.id))
}

/**
 * Cuenta cuántas preguntas hay asociadas a cada uno de los textos indicados.
 * Devuelve un Map id→nº. Alimenta el contador "nº de preguntas asociadas" de la
 * lista sin caer en N+1 consultas.
 */
export async function contarPreguntasPorTexto(
  textoIds: number[],
): Promise<Map<number, number>> {
  const mapa = new Map<number, number>()
  if (textoIds.length === 0) return mapa

  const filas = await db
    .select({ textoId: preguntas.textoId, n: count() })
    .from(preguntas)
    .where(inArray(preguntas.textoId, textoIds))
    .groupBy(preguntas.textoId)

  for (const f of filas) {
    if (f.textoId != null) mapa.set(f.textoId, f.n)
  }
  return mapa
}
