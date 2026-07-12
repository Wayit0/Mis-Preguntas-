import { and, count, desc, eq, ilike, isNull, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pruebas, usuarios } from '@/lib/db/schema'
import { listarPreguntasPropias, opcionesDeFiltros } from '@/lib/queries/preguntas'
import { cargarTextosPropios, contarPreguntasPorTexto } from '@/lib/queries/textos'
import type {
  PreguntaSeleccionable,
  TextoSeleccionable,
} from '@/components/prueba/generador-prueba'

/** Una fila de la tabla `pruebas` tal cual se lee de la base. */
export type Prueba = typeof pruebas.$inferSelect

export const POR_PAGINA_PRUEBAS = 24

export interface FiltrosPruebas {
  /** Búsqueda por título. */
  busqueda?: string
  /** `undefined` = todas; `null` = sin carpeta; `number` = esa carpeta. */
  carpetaId?: number | null
}

export interface PaginaPruebas {
  items: Prueba[]
  total: number
}

/**
 * Pruebas del usuario acotadas por asignatura, búsqueda (título) y carpeta,
 * PAGINADAS. Orden descendente por fecha (id como desempate).
 */
export async function listarPruebasPropias(
  userId: number,
  asignatura?: string,
  filtros?: FiltrosPruebas,
  pagina = 1,
  porPagina = POR_PAGINA_PRUEBAS,
): Promise<PaginaPruebas> {
  const conds: SQL[] = [eq(pruebas.userId, userId)]
  if (asignatura) conds.push(eq(pruebas.asignatura, asignatura))
  if (filtros?.carpetaId === null) conds.push(isNull(pruebas.carpetaId))
  else if (typeof filtros?.carpetaId === 'number') {
    conds.push(eq(pruebas.carpetaId, filtros.carpetaId))
  }
  if (filtros?.busqueda?.trim()) {
    conds.push(ilike(pruebas.titulo, `%${filtros.busqueda.trim()}%`))
  }
  const where = and(...conds)

  const [{ n }] = await db.select({ n: count() }).from(pruebas).where(where)
  const items = await db
    .select()
    .from(pruebas)
    .where(where)
    .orderBy(desc(pruebas.createdAt), desc(pruebas.id))
    .limit(porPagina)
    .offset(Math.max(0, (pagina - 1) * porPagina))
  return { items, total: Number(n) }
}

/**
 * Carga una prueba por id con guard de propiedad: devuelve la fila sólo si es
 * del usuario, o `null` en caso contrario (no existe o es de otro).
 */
export async function cargarPruebaPorId(
  id: number,
  userId: number,
): Promise<Prueba | null> {
  if (!Number.isFinite(id)) return null
  const [fila] = await db
    .select()
    .from(pruebas)
    .where(and(eq(pruebas.id, id), eq(pruebas.userId, userId)))
    .limit(1)
  return fila ?? null
}

/**
 * Instrucciones por defecto del usuario (las de su última prueba guardada con
 * instrucciones), para pre-rellenar el generador. `null` si nunca guardó unas.
 */
export async function instruccionesDefaultDeUsuario(
  userId: number,
): Promise<string | null> {
  const [fila] = await db
    .select({ instruccionesDefault: usuarios.instruccionesDefault })
    .from(usuarios)
    .where(eq(usuarios.id, userId))
    .limit(1)
  return fila?.instruccionesDefault ?? null
}

/**
 * Datos que necesita el generador de pruebas (`GeneradorPrueba`): las preguntas
 * sueltas seleccionables (serializadas y sin las asociadas a un texto), las
 * materias para el filtro, y TODOS los textos del usuario (con o sin preguntas
 * asociadas; un texto puede incluirse solo). Se comparte entre `/prueba` (crear)
 * y `/mis-pruebas/[id]/editar` (editar).
 */
export async function cargarDatosGenerador(
  userId: number,
  asignatura?: string,
): Promise<{
  preguntas: PreguntaSeleccionable[]
  materias: string[]
  textos: TextoSeleccionable[]
}> {
  // El generador filtra/pagina en el cliente, así que necesita TODAS las
  // preguntas y textos del usuario: se pide una página muy grande.
  const TODO = 100000
  const [listaPag, opciones, textosPag] = await Promise.all([
    listarPreguntasPropias(userId, asignatura, undefined, 1, TODO),
    opcionesDeFiltros(userId, asignatura),
    cargarTextosPropios(userId, asignatura, undefined, 1, TODO),
  ])
  const lista = listaPag.items
  const textos = textosPag.items

  const conteos = await contarPreguntasPorTexto(textos.map((t) => t.id))

  // Forma serializable y mínima para el cliente. Las preguntas "sueltas" (sin
  // texto asociado) se eligen individualmente; las de un texto se incluyen al
  // seleccionar el texto.
  const preguntas = lista
    .filter((p) => p.textoId == null)
    .map((p) => ({
      id: p.id,
      enunciado: p.pregunta,
      materia: p.materia ?? '',
      contenido: p.contenido ?? '',
      nivel: p.nivel ?? '',
      tipo: p.tipo ?? 'seleccion_multiple',
      correcta: p.correcta ?? '',
      A: p.A ?? '',
      B: p.B ?? '',
      C: p.C ?? '',
      D: p.D ?? '',
      E: p.E ?? '',
    }))

  const textosUtiles = textos.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    nPreguntas: conteos.get(t.id) ?? 0,
  }))

  return { preguntas, materias: opciones.materias, textos: textosUtiles }
}
