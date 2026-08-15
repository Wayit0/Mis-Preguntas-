import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { preguntas, textos } from '@/lib/db/schema'
import type { ContenidoAsignacion, PreguntaSnapshot } from '@/lib/tareas/contenido'

function aSnapshot(f: typeof preguntas.$inferSelect): PreguntaSnapshot {
  return {
    preguntaId: f.id,
    tipo: f.tipo ?? 'seleccion_multiple',
    enunciado: f.pregunta,
    A: f.A, B: f.B, C: f.C, D: f.D, E: f.E,
    correcta: f.correcta,
    explicacion: f.explicacion,
    imagenPregunta: f.imagenPregunta,
    imagenA: f.imagenA, imagenB: f.imagenB, imagenC: f.imagenC,
    imagenD: f.imagenD, imagenE: f.imagenE,
    imagenTamano: f.imagenTamano,
  }
}

/**
 * Congela el contenido de una prueba para una asignación: preguntas sueltas en
 * el orden de `preguntasIds` y textos (con sus preguntas asociadas) en el orden
 * de `textosIds`. Solo incluye filas del `userId` dueño — ids ajenos o ya
 * borrados se ignoran en silencio.
 */
export async function construirSnapshot(prueba: {
  preguntasIds: number[]
  textosIds: number[]
  userId: number
}): Promise<ContenidoAsignacion> {
  const { preguntasIds, textosIds, userId } = prueba

  const sueltas = preguntasIds.length
    ? await db.select().from(preguntas)
        .where(and(inArray(preguntas.id, preguntasIds), eq(preguntas.userId, userId)))
    : []
  const porId = new Map(sueltas.map((p) => [p.id, p]))

  const filasTextos = textosIds.length
    ? await db.select().from(textos)
        .where(and(inArray(textos.id, textosIds), eq(textos.userId, userId)))
    : []
  const textosPorId = new Map(filasTextos.map((t) => [t.id, t]))

  const preguntasDeTextos = filasTextos.length
    ? await db.select().from(preguntas)
        .where(and(inArray(preguntas.textoId, textosIds), eq(preguntas.userId, userId)))
        .orderBy(preguntas.id)
    : []

  return {
    textos: textosIds
      .map((id) => textosPorId.get(id))
      .filter((t) => t != null)
      .map((t) => ({
        titulo: t.titulo,
        contenido: t.contenido,
        preguntas: preguntasDeTextos.filter((p) => p.textoId === t.id).map(aSnapshot),
      })),
    preguntas: preguntasIds
      .map((id) => porId.get(id))
      .filter((p) => p != null)
      .map(aSnapshot),
  }
}
