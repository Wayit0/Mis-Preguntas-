import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock del SDK de Anthropic: `new Anthropic()` → `.messages.create(...)`.
// Nunca se llama al API real; controlamos el bloque `tool_use`/`stop_reason`.
const mocks = vi.hoisted(() => {
  const create = vi.fn()
  return { create }
})

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = { create: mocks.create }
  }
  return { default: Anthropic }
})

import { detectarPreguntas } from '@/lib/ai/import'
import { parsearImagenesAlternativas } from '@/lib/validation/import'
import type { BloqueContenido } from '@/lib/docparse/extract'

const bloques: BloqueContenido[] = [{ type: 'text', text: 'documento de prueba' }]

/** Arma una respuesta con un bloque tool_use cuyo input trae `preguntas`. */
function respuestaTool(
  preguntas: unknown[],
  usage = { input_tokens: 10, output_tokens: 5 },
) {
  return {
    stop_reason: 'tool_use',
    content: [
      { type: 'tool_use', name: 'entregar_preguntas', input: { preguntas } },
    ],
    usage,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Aseguramos el camino real (no el fixture de E2E).
  delete process.env.IMPORT_AI_FAKE
})

describe('ai/import detectarPreguntas (SDK mockeado)', () => {
  it('parsea y valida 2 preguntas, descartando la inválida (enunciado vacío)', async () => {
    mocks.create.mockResolvedValue(
      respuestaTool(
        [
          {
            pregunta: '¿Cuánto es 2 + 2?',
            A: '3',
            B: '4',
            C: '5',
            D: '6',
            E: null,
            correcta: 'B',
            explicacion: 'Dos más dos son cuatro.',
            materia: 'Aritmética',
            nivel: 'PAES',
            tipo: 'seleccion_multiple',
          },
          {
            // Inválida: enunciado vacío → debe descartarse en la criba.
            pregunta: '   ',
            A: null,
            B: null,
            C: null,
            D: null,
            E: null,
            correcta: null,
            explicacion: '',
            materia: null,
            nivel: null,
            tipo: 'desarrollo_corto',
          },
        ],
        { input_tokens: 1200, output_tokens: 300 },
      ),
    )

    const { preguntas, uso } = await detectarPreguntas(bloques, 'Matemáticas')

    expect(preguntas).toHaveLength(1)
    expect(preguntas[0].pregunta).toBe('¿Cuánto es 2 + 2?')
    expect(preguntas[0].correcta).toBe('B')
    expect(preguntas[0].tipo).toBe('seleccion_multiple')
    expect(uso?.modelo).toBe('claude-opus-4-8')
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('devuelve [] cuando la respuesta no trae bloque tool_use', async () => {
    mocks.create.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'No encontré preguntas.' }],
      usage: { input_tokens: 10, output_tokens: 0 },
    })
    const res = await detectarPreguntas(bloques, 'Física')
    expect(res.preguntas).toEqual([])
  })

  it('devuelve [] cuando el modelo rechaza (stop_reason "refusal")', async () => {
    mocks.create.mockResolvedValue({
      stop_reason: 'refusal',
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    })
    const res = await detectarPreguntas(bloques, 'Física')
    expect(res.preguntas).toEqual([])
  })

  it('fuerza la herramienta, envía su input_schema y adjunta la asignatura', async () => {
    mocks.create.mockResolvedValue(respuestaTool([]))

    await detectarPreguntas(bloques, 'Biología')

    const args = mocks.create.mock.calls[0][0]
    expect(args.model).toBe('claude-opus-4-8')
    // Tool use forzado (no structured outputs / no output_config).
    expect(args.output_config).toBeUndefined()
    expect(args.tool_choice).toEqual({ type: 'tool', name: 'entregar_preguntas' })
    expect(args.tools[0].name).toBe('entregar_preguntas')
    // El input_schema se derivó del zod y es un objeto JSON-Schema con `preguntas`.
    expect(args.tools[0].input_schema.type).toBe('object')
    expect(args.tools[0].input_schema.properties.preguntas).toBeTruthy()

    const content = args.messages[0].content as Array<{ type: string; text?: string }>
    const ultimo = content[content.length - 1]
    expect(ultimo.type).toBe('text')
    expect(ultimo.text).toContain('Biología')
  })

  it('usa el fixture y no llama al API cuando IMPORT_AI_FAKE está activo', async () => {
    process.env.IMPORT_AI_FAKE = '1'

    const { preguntas, uso } = await detectarPreguntas(bloques, 'Física')

    expect(mocks.create).not.toHaveBeenCalled()
    expect(uso).toBeNull()
    expect(preguntas.length).toBeGreaterThanOrEqual(1)
    expect(preguntas.every((p) => p.pregunta.trim().length > 0)).toBe(true)
  })

  it('conserva imagenesAlternativas (string compacto "A:0,B:1") al cribar', async () => {
    mocks.create.mockResolvedValue(
      respuestaTool([
        {
          pregunta: '¿Qué gráfico representa un MRU?',
          A: '',
          B: '',
          C: 'Ninguno de los anteriores',
          D: null,
          E: null,
          correcta: 'A',
          explicacion: '',
          materia: null,
          nivel: null,
          tipo: 'seleccion_multiple',
          imagenPreguntaIndice: null,
          imagenesAlternativas: 'A:0,B:1',
        },
      ]),
    )

    const { preguntas } = await detectarPreguntas(bloques, 'Física')

    expect(preguntas).toHaveLength(1)
    expect(preguntas[0].imagenesAlternativas).toBe('A:0,B:1')
  })

  it('parsearImagenesAlternativas: pares válidos, espacios, basura y null', () => {
    expect(parsearImagenesAlternativas('A:0,B:1')).toEqual([
      { letra: 'A', indice: 0 },
      { letra: 'B', indice: 1 },
    ])
    expect(parsearImagenesAlternativas(' C : 2 ')).toEqual([
      { letra: 'C', indice: 2 },
    ])
    // Letras fuera de A–E, índices no numéricos y tramos vacíos se descartan.
    expect(parsearImagenesAlternativas('F:0,A:x,,B:3')).toEqual([
      { letra: 'B', indice: 3 },
    ])
    expect(parsearImagenesAlternativas(null)).toEqual([])
    expect(parsearImagenesAlternativas(undefined)).toEqual([])
    expect(parsearImagenesAlternativas('')).toEqual([])
  })

  it('propaga el error si la llamada al modelo falla', async () => {
    mocks.create.mockRejectedValueOnce(new Error('fallo de red'))

    await expect(detectarPreguntas(bloques, 'Física')).rejects.toThrow(
      'fallo de red',
    )
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
})
