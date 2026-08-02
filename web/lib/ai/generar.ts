import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod/v4'

import type { UsoDeteccion } from '@/lib/ai/import'
import {
  PreguntasGeneradasSchema,
  preguntaGeneradaValidaSchema,
  type GenerarParams,
  type PreguntaGenerada,
} from '@/lib/validation/generar'

// ---------------------------------------------------------------------------
// Generación de preguntas con Anthropic (/generar).
//
// Mismo patrón que lib/ai/import.ts: tool use FORZADO con un schema mínimo
// (structured outputs se descartó allí por "Grammar compilation timed out";
// ver ese archivo). El modelo recibe los parámetros del docente y devuelve
// las preguntas llamando UNA vez a la herramienta; la criba con Zod descarta
// lo inválido sin tumbar el resto.
// ---------------------------------------------------------------------------

/** Modelo de generación (id exacto, sin sufijo de fecha). */
const MODELO = 'claude-sonnet-5'

/** Nombre de la herramienta con la que el modelo entrega las preguntas. */
const HERRAMIENTA = 'entregar_preguntas_generadas'

const ESQUEMA_HERRAMIENTA = z.toJSONSchema(
  PreguntasGeneradasSchema,
) as Anthropic.Tool.InputSchema

/** Resultado de la generación: preguntas válidas + uso real de la API. */
export interface ResultadoGeneracionIa {
  preguntas: PreguntaGenerada[]
  /** null cuando no hubo llamada real (fixture de e2e). */
  uso: UsoDeteccion | null
}

/** Instrucciones de generación (español es-CL). */
const SISTEMA = `Eres un experto en educación chilena y en diseño de ítems de \
evaluación. Crearás preguntas ORIGINALES de evaluación escolar a partir de los \
parámetros que entrega un docente: asignatura, nivel (curso), tema, qué quiere \
evaluar, tipo de pregunta y cantidad.

Crea EXACTAMENTE la cantidad de preguntas solicitada, todas del tipo pedido y \
en español de Chile:
- "pregunta": enunciado claro, conciso y autocontenido, con vocabulario y \
dificultad apropiados al nivel indicado. Usa LaTeX entre signos $...$ para \
fórmulas. NO dependas de imágenes, gráficos ni material externo: si la \
pregunta necesita datos, inclúyelos en el propio enunciado.
- El enunciado se muestra como TEXTO CORRIDO (los saltos de línea se pierden): \
NO uses tablas ni columnas separadas con "|" ni ningún formato tabulado. Si \
necesitas entregar varios datos, preséntalos en prosa enumerada, por ejemplo: \
"El sismo 1 tuvo magnitud 7,2 y profundidad de 15 km, y provocó tsunami; el \
sismo 2 tuvo magnitud 7,5 y profundidad de 20 km, y provocó tsunami; ...".
- NO incluyas en el enunciado la definición ni la teoría del concepto que se \
está evaluando (si la pregunta evalúa desplazamiento, no expliques qué es el \
desplazamiento): definir el concepto regala la respuesta y quita valor \
evaluativo. Entrega solo la situación y los datos necesarios.
- Si el tipo es "seleccion_multiple": completa "A", "B", "C" y "D" con cuatro \
alternativas y deja "E" en null. Debe existir UNA SOLA respuesta correcta, \
claramente defendible; indícala en "correcta" (la letra). Los distractores \
deben ser plausibles y reflejar errores típicos de estudiantes de ese nivel, \
no relleno absurdo. Las alternativas deben ser homogéneas en largo y \
estructura (la correcta no debe destacar por ser la más larga) y el enunciado \
no debe dar pistas.
- Si el tipo es de desarrollo ("desarrollo_corto" o "desarrollo_largo"): deja \
"A", "B", "C", "D", "E" y "correcta" en null.
- "explicacion": para selección múltiple, explica brevemente por qué la \
correcta es correcta y por qué cada distractor no lo es. Para desarrollo, \
escribe una respuesta modelo y una pauta de corrección con 2 a 4 criterios \
observables.

Reglas:
- Resuelve cada pregunta con rigor ANTES de entregarla; descarta enunciados \
ambiguos o con datos inconsistentes.
- Las preguntas deben apuntar exactamente a lo que el docente quiere evaluar; \
dentro de eso, varía el ángulo o la habilidad entre preguntas para no \
repetirte.`

/** Filtra y normaliza las preguntas generadas, descartando las inválidas. */
function cribarPreguntas(items: readonly unknown[]): PreguntaGenerada[] {
  const validas: PreguntaGenerada[] = []
  for (const item of items) {
    const parsed = preguntaGeneradaValidaSchema.safeParse(item)
    if (parsed.success) validas.push(parsed.data)
  }
  return validas
}

/**
 * Fixture determinista para e2e: con `GENERAR_AI_FAKE` presente no se toca la
 * red; se fabrican `cantidad` preguntas del tipo pedido (pasan por la criba).
 */
function fixtureFake(params: GenerarParams): unknown[] {
  const esSeleccion = params.tipo === 'seleccion_multiple'
  return Array.from({ length: params.cantidad }, (_, i) =>
    esSeleccion
      ? {
          pregunta: `¿Pregunta generada ${i + 1} sobre ${params.tema}? [demo-generar]`,
          A: 'Alternativa correcta',
          B: 'Distractor uno',
          C: 'Distractor dos',
          D: 'Distractor tres',
          E: null,
          correcta: 'A',
          explicacion: 'Pauta de demostración del fixture.',
        }
      : {
          pregunta: `Desarrolla la pregunta ${i + 1} sobre ${params.tema} [demo-generar]`,
          A: null,
          B: null,
          C: null,
          D: null,
          E: null,
          correcta: null,
          explicacion: 'Respuesta modelo de demostración del fixture.',
        },
  )
}

/**
 * Genera preguntas a partir de los parámetros del docente. Si el modelo no
 * llama a la herramienta o rechaza la petición (`stop_reason === 'refusal'`),
 * devuelve un arreglo vacío en lugar de fallar.
 */
export async function generarPreguntas(
  params: GenerarParams,
): Promise<ResultadoGeneracionIa> {
  if (process.env.GENERAR_AI_FAKE) {
    return { preguntas: cribarPreguntas(fixtureFake(params)), uso: null }
  }

  const client = new Anthropic() // lee ANTHROPIC_API_KEY del entorno

  const instruccion =
    `Crea ${params.cantidad} pregunta(s) de tipo "${params.tipo}" y ` +
    `entrégalas llamando a la herramienta ${HERRAMIENTA}.\n` +
    `Asignatura: ${params.asignatura}\n` +
    `Nivel (curso): ${params.nivel}\n` +
    `Tema: ${params.tema}\n` +
    `Qué se quiere evaluar: ${params.queEvaluar}`

  const res = await client.messages.create({
    model: MODELO,
    max_tokens: 8000,
    // En Sonnet 5 omitir `thinking` activa adaptive thinking; explícitamente
    // OFF para costo y latencia predecibles (misma decisión que lib/ai/import).
    thinking: { type: 'disabled' },
    system: SISTEMA,
    messages: [{ role: 'user', content: [{ type: 'text', text: instruccion }] }],
    tools: [
      {
        name: HERRAMIENTA,
        description:
          'Registra las preguntas de evaluación generadas. Llámala una sola ' +
          'vez con el arreglo completo de preguntas.',
        input_schema: ESQUEMA_HERRAMIENTA,
      },
    ],
    tool_choice: { type: 'tool', name: HERRAMIENTA },
  })

  const uso: UsoDeteccion = {
    modelo: MODELO,
    inputTokens: res.usage.input_tokens ?? 0,
    outputTokens: res.usage.output_tokens ?? 0,
    cacheCreationTokens: res.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
  }

  if (res.stop_reason === 'refusal') return { preguntas: [], uso }

  const bloque = res.content.find((b) => b.type === 'tool_use')
  const preguntas =
    bloque?.type === 'tool_use'
      ? (bloque.input as { preguntas?: unknown[] } | null)?.preguntas
      : undefined
  const items = Array.isArray(preguntas) ? preguntas : []
  return { preguntas: cribarPreguntas(items), uso }
}
