import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock del SDK de Anthropic: `new Anthropic()` → `.messages.create(...)`.
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

import { generarPreguntas } from '@/lib/ai/generar'
import type { GenerarParams } from '@/lib/validation/generar'

const params: GenerarParams = {
  asignatura: 'Física',
  nivel: '2° Medio',
  tema: 'Leyes de Newton',
  queEvaluar: 'Aplicar la segunda ley en problemas con roce',
  tipo: 'seleccion_multiple',
  cantidad: 3,
}

function respuestaTool(preguntas: unknown[]) {
  return {
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        name: 'entregar_preguntas_generadas',
        input: { preguntas },
      },
    ],
    usage: { input_tokens: 900, output_tokens: 400 },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.GENERAR_AI_FAKE
})

describe('ai/generar generarPreguntas (SDK mockeado)', () => {
  it('parsea, criba (descarta enunciado vacío) y reporta uso', async () => {
    mocks.create.mockResolvedValue(
      respuestaTool([
        {
          pregunta: 'Un bloque de $5\\,kg$ se empuja con $20\\,N$…',
          A: '4 m/s²',
          B: '2 m/s²',
          C: '5 m/s²',
          D: '10 m/s²',
          E: null,
          correcta: 'A',
          explicacion: 'Por $F=ma$, $a=20/5=4$.',
        },
        { pregunta: '   ', A: null, B: null, C: null, D: null, E: null, correcta: null, explicacion: null },
      ]),
    )
    const { preguntas, uso } = await generarPreguntas(params)
    expect(preguntas).toHaveLength(1)
    expect(preguntas[0].correcta).toBe('A')
    expect(uso?.inputTokens).toBe(900)
    expect(uso?.outputTokens).toBe(400)
  })

  it('incluye los parámetros del docente en la petición', async () => {
    mocks.create.mockResolvedValue(respuestaTool([]))
    await generarPreguntas(params)
    const llamada = mocks.create.mock.calls[0][0]
    const textoUser = JSON.stringify(llamada.messages)
    expect(textoUser).toContain('Leyes de Newton')
    expect(textoUser).toContain('2° Medio')
    expect(textoUser).toContain('roce')
    expect(llamada.tool_choice).toEqual({
      type: 'tool',
      name: 'entregar_preguntas_generadas',
    })
    expect(llamada.thinking).toEqual({ type: 'disabled' })
  })

  it('refusal → arreglo vacío sin lanzar', async () => {
    mocks.create.mockResolvedValue({
      stop_reason: 'refusal',
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    })
    const { preguntas } = await generarPreguntas(params)
    expect(preguntas).toEqual([])
  })

  it('fixture GENERAR_AI_FAKE: respeta cantidad y tipo, sin tocar la red', async () => {
    process.env.GENERAR_AI_FAKE = '1'
    const r = await generarPreguntas({ ...params, cantidad: 2 })
    expect(mocks.create).not.toHaveBeenCalled()
    expect(r.preguntas).toHaveLength(2)
    expect(r.preguntas[0].correcta).toBe('A')
    expect(r.uso).toBeNull()

    const rDesarrollo = await generarPreguntas({
      ...params,
      tipo: 'desarrollo_corto',
      cantidad: 1,
    })
    expect(rDesarrollo.preguntas[0].correcta).toBeNull()
    expect(rDesarrollo.preguntas[0].A).toBeNull()
  })
})
