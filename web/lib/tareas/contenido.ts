// ---------------------------------------------------------------------------
// Forma del snapshot congelado de una asignación y su corrección. Puro (sin
// BD): la construcción desde una prueba vive en lib/tareas/snapshot.ts.
// ---------------------------------------------------------------------------

export interface PreguntaSnapshot {
  /** id de la pregunta original, informativo (puede ya no existir). */
  preguntaId: number
  tipo: string
  enunciado: string
  A: string | null
  B: string | null
  C: string | null
  D: string | null
  E: string | null
  correcta: string | null
  explicacion: string | null
  imagenPregunta: string | null
  imagenA: string | null
  imagenB: string | null
  imagenC: string | null
  imagenD: string | null
  imagenE: string | null
  imagenTamano: string
}

export interface TextoSnapshot {
  titulo: string
  contenido: string
  preguntas: PreguntaSnapshot[]
}

export interface ContenidoAsignacion {
  textos: TextoSnapshot[]
  preguntas: PreguntaSnapshot[]
}

/** Versión sin respuestas, apta para serializar al estudiante ANTES de entregar. */
export type PreguntaEstudiante = Omit<PreguntaSnapshot, 'correcta' | 'explicacion'>
export interface ContenidoEstudiante {
  textos: { titulo: string; contenido: string; preguntas: PreguntaEstudiante[] }[]
  preguntas: PreguntaEstudiante[]
}

/**
 * Orden canónico de las preguntas de una asignación: las de cada texto (en
 * orden) y luego las sueltas. El ÍNDICE en esta lista es la clave del jsonb
 * `entregas.respuestas` — cambiarlo rompería entregas existentes.
 */
export function aplanarPreguntas(c: ContenidoAsignacion): PreguntaSnapshot[] {
  return [...c.textos.flatMap((t) => t.preguntas), ...c.preguntas]
}

/**
 * Corrige las alternativas: total = preguntas seleccion_multiple con correcta
 * definida; puntaje = coincidencias (trim + mayúsculas). Desarrollo no puntúa.
 */
export function corregir(
  c: ContenidoAsignacion,
  respuestas: Record<string, string>,
): { puntaje: number; total: number } {
  let puntaje = 0
  let total = 0
  aplanarPreguntas(c).forEach((p, i) => {
    if (p.tipo !== 'seleccion_multiple' || !p.correcta?.trim()) return
    total++
    const r = (respuestas[String(i)] ?? '').trim().toUpperCase()
    if (r && r === p.correcta.trim().toUpperCase()) puntaje++
  })
  return { puntaje, total }
}

function sinRespuestasDePregunta(p: PreguntaSnapshot): PreguntaEstudiante {
  const { correcta: _c, explicacion: _e, ...resto } = p
  return resto
}

/** Quita correcta/explicacion de todo el contenido (lo que ve el estudiante). */
export function sinRespuestas(c: ContenidoAsignacion): ContenidoEstudiante {
  return {
    textos: c.textos.map((t) => ({
      titulo: t.titulo,
      contenido: t.contenido,
      preguntas: t.preguntas.map(sinRespuestasDePregunta),
    })),
    preguntas: c.preguntas.map(sinRespuestasDePregunta),
  }
}
