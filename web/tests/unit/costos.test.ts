import { describe, it, expect } from 'vitest'
import {
  calcularCostoMicroUsd,
  formatearUsd,
  PRECIOS_POR_MTOK,
} from '@/lib/ai/costos'

describe('costos de IA', () => {
  it('calcula el costo de un uso típico de importación (opus 4.8)', () => {
    // 50k tokens de entrada + 10k de salida:
    // 50k/1M * $5 = $0.25 ; 10k/1M * $25 = $0.25 → $0.50 = 500_000 microUSD
    const micro = calcularCostoMicroUsd('claude-opus-4-8', {
      inputTokens: 50_000,
      outputTokens: 10_000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    })
    expect(micro).toBe(500_000)
    expect(formatearUsd(micro)).toBe('$0.5000')
  })

  it('incluye los tokens de caché con sus tarifas propias', () => {
    // 1M cache write = $6.25 ; 1M cache read = $0.50
    const micro = calcularCostoMicroUsd('claude-opus-4-8', {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
    })
    expect(micro).toBe(6_750_000)
    expect(formatearUsd(micro)).toBe('$6.75')
  })

  it('modelo desconocido → costo 0 (los tokens igual quedan registrados)', () => {
    expect(
      calcularCostoMicroUsd('modelo-inexistente', {
        inputTokens: 1000,
        outputTokens: 1000,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      }),
    ).toBe(0)
  })

  it('la tabla de precios cubre el modelo de importación', () => {
    expect(PRECIOS_POR_MTOK['claude-opus-4-8']).toBeDefined()
  })
})
