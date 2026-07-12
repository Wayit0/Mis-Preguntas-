import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { carpetas, preguntas, pruebas, textos } from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// Carpetas personales (preguntas/pruebas/textos). Funciones puras de lectura: el
// guard de propiedad (userId) va en cada query. Ver lib/actions/carpetas.ts para
// las mutaciones.
// ---------------------------------------------------------------------------

export interface Carpeta {
  id: number
  nombre: string
  parentId: number | null
}

/** Los tres tipos de contenido que una carpeta puede organizar. */
export type TipoContenido = 'preguntas' | 'pruebas' | 'textos'

const TABLA = {
  preguntas,
  pruebas,
  textos,
} as const

/** Todas las carpetas del usuario (planas), ordenadas por nombre. */
export async function listarCarpetas(userId: number): Promise<Carpeta[]> {
  return db
    .select({ id: carpetas.id, nombre: carpetas.nombre, parentId: carpetas.parentId })
    .from(carpetas)
    .where(eq(carpetas.userId, userId))
    .orderBy(asc(carpetas.nombre))
}

/** Subcarpetas directas de `parentId` (null = carpetas de la raíz). */
export async function subcarpetas(
  userId: number,
  parentId: number | null,
): Promise<Carpeta[]> {
  return db
    .select({ id: carpetas.id, nombre: carpetas.nombre, parentId: carpetas.parentId })
    .from(carpetas)
    .where(
      and(
        eq(carpetas.userId, userId),
        parentId === null
          ? isNull(carpetas.parentId)
          : eq(carpetas.parentId, parentId),
      ),
    )
    .orderBy(asc(carpetas.nombre))
}

/**
 * Ruta (breadcrumb) desde la raíz hasta `carpetaId`, inclusive. Vacío si es la
 * raíz (null) o si la carpeta no existe / no es del usuario. Camina hacia arriba
 * por `parentId` con guardas contra ciclos y contra profundidad excesiva.
 */
export async function rutaCarpeta(
  userId: number,
  carpetaId: number | null,
): Promise<Carpeta[]> {
  const ruta: Carpeta[] = []
  const vistos = new Set<number>()
  let actual: number | null = carpetaId
  while (actual != null && !vistos.has(actual) && ruta.length < 20) {
    vistos.add(actual)
    const [c]: Carpeta[] = await db
      .select({ id: carpetas.id, nombre: carpetas.nombre, parentId: carpetas.parentId })
      .from(carpetas)
      .where(and(eq(carpetas.id, actual), eq(carpetas.userId, userId)))
      .limit(1)
    if (!c) break
    ruta.unshift(c)
    actual = c.parentId
  }
  return ruta
}

/**
 * Cuenta cuántos ítems de un tipo hay en cada una de las carpetas dadas. Devuelve
 * un Map carpetaId -> conteo (las carpetas sin ítems no aparecen). Sirve para el
 * badge "(N)" de cada subcarpeta en la navegación.
 */
export async function contarItemsEnCarpetas(
  userId: number,
  tipo: TipoContenido,
  carpetaIds: number[],
): Promise<Map<number, number>> {
  const mapa = new Map<number, number>()
  if (carpetaIds.length === 0) return mapa
  const tabla = TABLA[tipo]
  const filas = await db
    .select({ carpetaId: tabla.carpetaId, n: sql<number>`count(*)` })
    .from(tabla)
    .where(and(eq(tabla.userId, userId), inArray(tabla.carpetaId, carpetaIds)))
    .groupBy(tabla.carpetaId)
  for (const f of filas) {
    if (f.carpetaId != null) mapa.set(f.carpetaId, Number(f.n))
  }
  return mapa
}

/**
 * Ids de la carpeta `raizId` y TODAS sus descendientes (para reubicar/validar).
 * Recorre el árbol en memoria a partir de las carpetas del usuario. Incluye a
 * `raizId`.
 */
export async function carpetaYDescendientes(
  userId: number,
  raizId: number,
): Promise<number[]> {
  const todas = await listarCarpetas(userId)
  const hijosPorPadre = new Map<number, number[]>()
  for (const c of todas) {
    if (c.parentId != null) {
      const arr = hijosPorPadre.get(c.parentId) ?? []
      arr.push(c.id)
      hijosPorPadre.set(c.parentId, arr)
    }
  }
  const resultado: number[] = []
  const pila = [raizId]
  const vistos = new Set<number>()
  while (pila.length > 0) {
    const id = pila.pop() as number
    if (vistos.has(id)) continue
    vistos.add(id)
    resultado.push(id)
    for (const hijo of hijosPorPadre.get(id) ?? []) pila.push(hijo)
  }
  return resultado
}
