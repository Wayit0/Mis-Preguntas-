import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock del SDK de Anthropic: `new Anthropic()` → `.messages.parse(...)`.
// Nunca se llama al API real; controlamos `parsed_output`/`stop_reason`.
const mocks = vi.hoisted(() => {
  const parse = vi.fn()
  return { parse }
})

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = { parse: mocks.parse }
  }
  return { default: Anthropic }
})

import { detectarPreguntas } from '@/lib/ai/import'
import type { BloqueContenido } from '@/lib/docparse/extract'

const bloques: BloqueContenido[] = [{ type: 'text', text: 'documento de prueba' }]

beforeEach(() => {
  vi.clearAllMocks()
  // Aseguramos el camino real (no el fixture de E2E).
  delete process.env.IMPORT_AI_FAKE
})

describe('ai/import detectarPreguntas (SDK mockeado)', () => {
  it('parsea y valida 2 preguntas, descartando la inválida (enunciado vacío)', async () => {
    mocks.parse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: {
        preguntas: [
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
      },
    })

    const preguntas = await detectarPreguntas(bloques, 'Matemáticas')

    expect(preguntas).toHaveLength(1)
    expect(preguntas[0].pregunta).toBe('¿Cuánto es 2 + 2?')
    expect(preguntas[0].correcta).toBe('B')
    expect(preguntas[0].tipo).toBe('seleccion_multiple')
    expect(mocks.parse).toHaveBeenCalledTimes(1)
  })

  it('devuelve [] cuando parsed_output es null', async () => {
    mocks.parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: null })
    await expect(detectarPreguntas(bloques, 'Física')).resolves.toEqual([])
  })

  it('devuelve [] cuando el modelo rechaza (stop_reason "refusal")', async () => {
    mocks.parse.mockResolvedValue({ stop_reason: 'refusal', parsed_output: null })
    await expect(detectarPreguntas(bloques, 'Física')).resolves.toEqual([])
  })

  it('llama al modelo correcto y adjunta la asignatura como último bloque de texto', async () => {
    mocks.parse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { preguntas: [] },
    })

    await detectarPreguntas(bloques, 'Biología')

    const args = mocks.parse.mock.calls[0][0]
    expect(args.model).toBe('claude-opus-4-8')
    expect(args.output_config?.format).toBeTruthy()

    const content = args.messages[0].content as Array<{ type: string; text?: string }>
    const ultimo = content[content.length - 1]
    expect(ultimo.type).toBe('text')
    expect(ultimo.text).toContain('Biología')
  })

  it('usa el fixture y no llama al API cuando IMPORT_AI_FAKE está activo', async () => {
    process.env.IMPORT_AI_FAKE = '1'

    const preguntas = await detectarPreguntas(bloques, 'Física')

    expect(mocks.parse).not.toHaveBeenCalled()
    expect(preguntas.length).toBeGreaterThanOrEqual(1)
    expect(preguntas.every((p) => p.pregunta.trim().length > 0)).toBe(true)
  })

  it('conserva imagenesAlternativas ({letra, indice}) al cribar', async () => {
    mocks.parse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: {
        preguntas: [
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
            imagenesAlternativas: [
              { letra: 'A', indice: 0 },
              { letra: 'B', indice: 1 },
            ],
          },
        ],
      },
    })

    const preguntas = await detectarPreguntas(bloques, 'Física')

    expect(preguntas).toHaveLength(1)
    expect(preguntas[0].imagenesAlternativas).toEqual([
      { letra: 'A', indice: 0 },
      { letra: 'B', indice: 1 },
    ])
  })

  it('propaga el error si la llamada al modelo falla', async () => {
    mocks.parse.mockRejectedValueOnce(new Error('fallo de red'))

    await expect(detectarPreguntas(bloques, 'Física')).rejects.toThrow(
      'fallo de red',
    )
    expect(mocks.parse).toHaveBeenCalledTimes(1)
  })
})
