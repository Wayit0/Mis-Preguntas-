import { and, desc, eq, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pruebas } from '@/lib/db/schema'
import { listarPreguntasPropias, opcionesDeFiltros } from '@/lib/queries/preguntas'
import { cargarTextosPropios, contarPreguntasPorTexto } from '@/lib/queries/textos'
import type {
  PreguntaSeleccionable,
  TextoSeleccionable,
} from '@/components/prueba/generador-prueba'

/** Una fila de la tabla `pruebas` tal cual se lee de la base. */
export type Prueba = typeof pruebas.$inferSelect

/**
 * Pruebas creadas por el usuario, opcionalmente acotadas a una asignatura.
 * Orden descendente por fecha de creación (las más recientes primero); el id
 * resuelve empates cuando `created_at` coincide.
 */
export async function listarPruebasPropias(
  userId: number,
  asignatura?: string,
): Promise<Prueba[]> {
  const conds: SQL[] = [eq(pruebas.userId, userId)]
  if (asignatura) conds.push(eq(pruebas.asignatura, asignatura))

  return db
    .select()
    .from(pruebas)
    .where(and(...conds))
    .orderBy(desc(pruebas.createdAt), desc(pruebas.id))
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
  const [lista, opciones, textos] = await Promise.all([
    listarPreguntasPropias(userId, asignatura),
    opcionesDeFiltros(userId, asignatura),
    cargarTextosPropios(userId, asignatura),
  ])

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
