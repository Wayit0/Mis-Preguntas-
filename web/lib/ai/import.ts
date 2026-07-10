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
"correcta" la LETRA de la alternativa correcta: la que el documento señale o, \
si el documento no la trae, RESUÉLVELA tú con rigor (desarrolla el cálculo o \
razonamiento antes de decidir) y indícala.
- Para las de desarrollo, deja las alternativas y "correcta" en null.
- "explicacion": la explicación, pauta o solución si aparece en el documento. \
Si no aparece y tú resolviste la pregunta, escribe aquí una pauta breve de \
cómo se llega a la respuesta (máximo 2-3 líneas).
- "materia" y "nivel": complétalos sólo si el documento los indica claramente; \
si no, déjalos en null.

El documento puede incluir imágenes incrustadas (diagramas, gráficos, figuras \
geométricas, etc.). Según el tipo de documento se presentan así:
- En documentos de texto, cada imagen aparece como un marcador "[IMAGEN_n]" \
(n = 0, 1, 2…) en el lugar exacto donde estaba, y luego se adjunta la imagen \
con la etiqueta "Imagen n:". Al transcribir el enunciado, quita el marcador \
"[IMAGEN_n]" del texto.
- En PDFs no hay marcadores: las mismas imágenes del documento se adjuntan \
numeradas ("Imagen n:") después del PDF; compáralas visualmente con las \
figuras que ves dentro del PDF para saber a qué pregunta pertenece cada una.
Si el enunciado de una pregunta depende de una de esas imágenes (es decir, no \
se entiende sin verla), indica su número n en "imagenPreguntaIndice"; si no \
aplica ninguna imagen, deja el campo en null.

Si una ALTERNATIVA es una imagen o depende de una (p. ej. alternativas que son \
gráficos o figuras), regístralo en "imagenesAlternativas" como un texto \
compacto "LETRA:n" separado por comas, por ejemplo "A:0,B:1" (alternativa A \
usa la imagen 0 y la B la imagen 1); deja el texto de esa alternativa con su \
rótulo o descripción si existe (o una cadena vacía) y quita el marcador \
"[IMAGEN_n]". Si ninguna alternativa lleva imagen, deja "imagenesAlternativas" \
en null. Una misma imagen no puede ser a la vez del enunciado y de una \
alternativa: asígnala a donde corresponda según el documento.

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

  const llamar = () =>
    client.messages.parse({
      model: MODELO,
      max_tokens: 16000,
      system: SISTEMA,
      messages: [
        { role: 'user', content: [...contentBlocks, { type: 'text', text: instruccion }] },
      ],
      output_config: { format: zodOutputFormat(PreguntasDetectadasSchema) },
    })

  // "Grammar compilation timed out" (400) es un fallo de compilación de la
  // gramática del structured output en frío; la API la cachea una vez
  // compilada, así que un único reintento suele bastar. Cualquier otro error
  // se propaga (el SDK ya reintenta solo los 429/5xx).
  let res: Awaited<ReturnType<typeof llamar>>
  try {
    res = await llamar()
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (!msg.includes('Grammar compilation timed out')) throw err
    console.warn('[importar] grammar timeout; reintentando una vez…')
    res = await llamar()
  }

  if (res.stop_reason === 'refusal') return []

  const data = res.parsed_output
  if (!data) return []

  return cribarPreguntas(data.preguntas)
}
