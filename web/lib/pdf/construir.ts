import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { preguntas as tablaPreguntas, textos as tablaTextos } from '@/lib/db/schema'
import {
  generarPruebaPdf,
  type PreguntaPdf,
  type TextoPdf,
} from '@/lib/pdf/prueba'

/**
 * Error de "selección vacía": la prueba no contiene ninguna pregunta (ni suelta
 * ni vía un texto). Los llamadores lo mapean a un 400 legible, en vez de un 500.
 */
export class PruebaSinPreguntasError extends Error {
  constructor() {
    super('Selecciona al menos una pregunta o un texto.')
    this.name = 'PruebaSinPreguntasError'
  }
}

/** Opciones para construir el PDF de una prueba (encabezado + selección). */
export interface OpcionesPrueba {
  asignatura: string
  titulo?: string
  colegio?: string
  profesor?: string
  instrucciones?: string
  formulas?: string[]
  /** IDs de preguntas sueltas — el ORDEN determina el orden en el PDF. */
  preguntasIds: number[]
  /** IDs de textos de comprensión (se incluyen completos con sus preguntas). */
  textosIds: number[]
  /** Logo del colegio ya resuelto a bytes (o null). */
  logo?: Buffer | null
}

/** Convierte una lista de valores de FormData a ids numéricos válidos y únicos. */
export function idsDesde(values: FormDataEntryValue[]): number[] {
  const out = new Set<number>()
  for (const v of values) {
    const n = Number(v)
    if (Number.isInteger(n) && n > 0) out.add(n)
  }
  return [...out]
}

/** Mapea una fila de la tabla `preguntas` a la forma que consume el generador. */
function aPreguntaPdf(fila: typeof tablaPreguntas.$inferSelect): PreguntaPdf {
  return {
    enunciado: fila.pregunta,
    tipo: fila.tipo,
    A: fila.A,
    B: fila.B,
    C: fila.C,
    D: fila.D,
    E: fila.E,
    correcta: fila.correcta,
    explicacion: fila.explicacion,
    imagen_pregunta: fila.imagenPregunta,
    imagen_A: fila.imagenA,
    imagen_B: fila.imagenB,
    imagen_C: fila.imagenC,
    imagen_D: fila.imagenD,
    imagen_E: fila.imagenE,
    texto_id: fila.textoId,
  }
}

/**
 * Construye el PDF de una prueba a partir de una selección de preguntas (y,
 * opcionalmente, textos) del usuario. Todas las queries filtran por `userId`
 * (guard de propiedad), respetan el orden de selección y excluyen las preguntas
 * ya incluidas por un texto. Lanza `PruebaSinPreguntasError` si no hay ninguna
 * pregunta; cualquier otro fallo lo propaga (error de renderizado).
 */
export async function construirPruebaPdf(
  userId: number,
  opts: OpcionesPrueba,
): Promise<Buffer> {
  const idsTextos = opts.textosIds
  const idsPreguntas = opts.preguntasIds

  // Textos seleccionados (propios) y sus preguntas asociadas (propias).
  const textosPdf: TextoPdf[] = []
  const preguntasDeTextos: PreguntaPdf[] = []
  const idsEnTextos = new Set<number>()

  if (idsTextos.length > 0) {
    const filasTextos = await db
      .select()
      .from(tablaTextos)
      .where(and(eq(tablaTextos.userId, userId), inArray(tablaTextos.id, idsTextos)))

    // Respetar el orden de selección recibido.
    const porId = new Map(filasTextos.map((t) => [t.id, t]))
    for (const tid of idsTextos) {
      const t = porId.get(tid)
      if (!t) continue
      const filasPreg = await db
        .select()
        .from(tablaPreguntas)
        .where(
          and(eq(tablaPreguntas.userId, userId), eq(tablaPreguntas.textoId, t.id)),
        )
        .orderBy(tablaPreguntas.id)
      // Se incluye el texto aunque no tenga preguntas asociadas (texto solo).
      textosPdf.push({ id: t.id, titulo: t.titulo, contenido: t.contenido })
      for (const fp of filasPreg) {
        preguntasDeTextos.push(aPreguntaPdf(fp))
        idsEnTextos.add(fp.id)
      }
    }
  }

  // Preguntas sueltas seleccionadas (propias), excluyendo las ya incluidas vía
  // un texto seleccionado.
  const preguntasSueltas: PreguntaPdf[] = []
  if (idsPreguntas.length > 0) {
    const filas = await db
      .select()
      .from(tablaPreguntas)
      .where(
        and(eq(tablaPreguntas.userId, userId), inArray(tablaPreguntas.id, idsPreguntas)),
      )
      .orderBy(tablaPreguntas.id)
    // Respetar el orden de selección recibido.
    const porId = new Map(filas.map((p) => [p.id, p]))
    for (const pid of idsPreguntas) {
      const p = porId.get(pid)
      if (!p || idsEnTextos.has(p.id)) continue
      preguntasSueltas.push(aPreguntaPdf(p))
    }
  }

  // Válida si hay al menos un texto o una pregunta (un texto puede ir solo).
  if (textosPdf.length === 0 && preguntasSueltas.length === 0) {
    throw new PruebaSinPreguntasError()
  }

  return generarPruebaPdf({
    titulo: opts.titulo ?? '',
    asignatura: opts.asignatura,
    colegio: opts.colegio ?? '',
    profesor: opts.profesor ?? '',
    logo: opts.logo ?? null,
    instrucciones: opts.instrucciones ?? '',
    formulas: opts.formulas ?? [],
    textos: textosPdf,
    // Orden: primero las de textos (agrupadas), luego las sueltas.
    preguntas: [...preguntasDeTextos, ...preguntasSueltas],
  })
}

/** Nombre de archivo seguro para la descarga (sin acentos ni caracteres raros). */
export function nombreArchivo(asignatura: string): string {
  const base = asignatura
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `prueba_${base || 'general'}.pdf`
}
