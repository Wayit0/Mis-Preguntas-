import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

import type { BloqueContenido } from '@/lib/docparse/extract'
import {
  PreguntasDetectadasSchema,
  preguntaDetectadaValidaSchema,
  type PreguntaDetectada,
} from '@/lib/validation/import'

// ---------------------------------------------------------------------------
// Detección de preguntas con Anthropic (Fase 7.2).
//
// Toma los *content blocks* del documento (de `docparse/extract`) y le pide al
// modelo que extraiga las preguntas en forma estructurada (salida JSON validada
// contra `PreguntasDetectadasSchema` vía `zodOutputFormat`). Equivalente al
// `detectar_preguntas_con_claude` del MVP, ampliado a preguntas de desarrollo.
//
// Referencia de la API: SDK oficial de Anthropic, `client.messages.parse` con
// `output_config.format`. Modelo: `claude-opus-4-8` (sin sufijo de fecha).
// ---------------------------------------------------------------------------

/** Modelo de extracción (id exacto, sin sufijo de fecha). */
const MODELO = 'claude-opus-4-8'

/** Instrucciones de extracción (en español, es-CL). */
const SISTEMA = `Eres un asistente experto en educación chilena. Recibirás el \
contenido de un documento (texto, PDF o imagen) que contiene preguntas de una \
asignatura escolar. Tu tarea es extraer TODAS las preguntas que encuentres y \
devolverlas de forma estructurada.

Para cada pregunta:
- "pregunta": el enunciado completo, en texto plano. Conserva las fórmulas en \
LaTeX entre signos $...$ si aparecen.
- "tipo": "seleccion_multiple" si la pregunta ofrece alternativas; \
"desarrollo_corto" si es una pregunta abierta de respuesta breve; \
"desarrollo_largo" si requiere una respuesta extensa o argumentada.
- Para las de selección múltiple, completa "A", "B", "C", "D" y "E" con el \
texto de cada alternativa (deja en null las que no existan) e indica en \
"correcta" la LETRA de la alternativa correcta SÓLO si el documento la señala; \
en caso contrario usa null.
- Para las de desarrollo, deja las alternativas y "correcta" en null.
- "explicacion": la explicación, pauta o solución si aparece en el documento; \
si no aparece, deja una cadena vacía.
- "materia" y "nivel": complétalos sólo si el documento los indica claramente; \
si no, déjalos en null.

El documento puede incluir imágenes incrustadas (diagramas, gráficos, figuras \
geométricas, etc.). Cada una aparece en el texto como un marcador \
"[IMAGEN_n]" (n = 0, 1, 2…) en el lugar exacto donde estaba, y luego se adjunta \
la imagen correspondiente con la etiqueta "Imagen n:". Si el enunciado de una \
pregunta o alguna de sus alternativas A–E depende de una de esas imágenes \
(es decir, no se entiende sin verla), indica su número n en \
"imagenPreguntaIndice" (para el enunciado) o "imagenAIndice"…"imagenEIndice" \
(para la alternativa correspondiente). Usa el número EXACTO del marcador; si no \
aplica ninguna imagen, deja el campo en null. Al transcribir el enunciado o la \
alternativa, quita el marcador "[IMAGEN_n]" del texto (la referencia ya queda \
registrada en el campo correspondiente).

Reglas:
- No inventes preguntas, alternativas ni respuestas: extrae únicamente lo que \
aparece en el documento.
- Si el documento no contiene preguntas, devuelve un arreglo vacío.`

/** Filtra y normaliza las preguntas detectadas, descartando las inválidas. */
function cribarPreguntas(items: readonly unknown[]): PreguntaDetectada[] {
  const validas: PreguntaDetectada[] = []
  for (const item of items) {
    const parsed = preguntaDetectadaValidaSchema.safeParse(item)
    if (parsed.success) validas.push(parsed.data)
  }
  return validas
}

/**
 * Fixture determinista para pruebas E2E: cuando `IMPORT_AI_FAKE` está presente,
 * se omite la llamada real a Anthropic y se devuelve este conjunto (pasa por la
 * misma criba con Zod). Nunca se activa en producción (la variable no se define).
 *
 * La primera pregunta referencia `imagenPreguntaIndice: 0`: si el documento
 * subido no trae ninguna imagen incrustada (`imagenes` queda vacío), el índice
 * simplemente no resuelve a nada y no se muestra miniatura; si trae al menos
 * una (p. ej. el fixture `sample-con-imagen.docx` usado en el e2e de imágenes),
 * se resuelve a esa imagen y permite probar el flujo completo sin depender de
 * una llamada real a Claude.
 */
const FIXTURE_FAKE: readonly unknown[] = [
  {
    pregunta: '¿Cuál es la unidad de fuerza en el Sistema Internacional? [demo-import]',
    A: 'Newton',
    B: 'Joule',
    C: 'Watt',
    D: 'Pascal',
    E: null,
    correcta: 'A',
    explicacion: 'El newton (N) es la unidad de fuerza en el SI.',
    materia: 'Mecánica',
    nivel: 'PAES',
    tipo: 'seleccion_multiple',
    imagenPreguntaIndice: 0,
  },
  {
    pregunta: 'Explica con tus palabras la primera ley de Newton. [demo-import]',
    A: null,
    B: null,
    C: null,
    D: null,
    E: null,
    correcta: null,
    explicacion: '',
    materia: 'Mecánica',
    nivel: 'PAES',
    tipo: 'desarrollo_corto',
  },
]

/**
 * Extrae las preguntas presentes en un documento ya convertido a content blocks.
 *
 * Devuelve sólo las preguntas válidas (con enunciado no vacío). Si el modelo no
 * produce salida estructurada (`parsed_output` nulo) o rechaza la petición
 * (`stop_reason === 'refusal'`), devuelve un arreglo vacío en lugar de fallar.
 */
export async function detectarPreguntas(
  contentBlocks: BloqueContenido[],
  asignatura: string,
): Promise<PreguntaDetectada[]> {
  // Camino de prueba: sin tocar la red ni la API real de Anthropic.
  if (process.env.IMPORT_AI_FAKE) {
    return cribarPreguntas(FIXTURE_FAKE)
  }

  const client = new Anthropic() // lee ANTHROPIC_API_KEY del entorno

  const instruccion =
    `Extrae todas las preguntas del documento adjunto. ` +
    `La asignatura es "${asignatura}".`

  const content: Anthropic.ContentBlockParam[] = [
    ...contentBlocks,
    { type: 'text', text: instruccion },
  ]

  const res = await client.messages.parse({
    model: MODELO,
    max_tokens: 16000,
    system: SISTEMA,
    messages: [{ role: 'user', content }],
    output_config: { format: zodOutputFormat(PreguntasDetectadasSchema) },
  })

  if (res.stop_reason === 'refusal') return []

  const data = res.parsed_output
  if (!data) return []

  return cribarPreguntas(data.preguntas)
}
