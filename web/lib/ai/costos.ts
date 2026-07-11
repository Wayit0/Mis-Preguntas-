// ---------------------------------------------------------------------------
// Precios de la API de Anthropic y cálculo de costos (panel de admin).
//
// Precios por MILLÓN de tokens en USD, según la tabla oficial de modelos
// (platform.claude.com/docs). Cache write = 1.25x input (TTL 5 min);
// cache read = 0.1x input. Si Anthropic cambia precios, actualizar aquí: las
// filas históricas de `usos_ia` guardan el costo calculado al momento del uso.
// ---------------------------------------------------------------------------

export interface PrecioModelo {
  /** USD por 1M de tokens de entrada. */
  input: number
  /** USD por 1M de tokens de salida. */
  output: number
  /** USD por 1M de tokens escritos a caché (1.25x input, TTL 5 min). */
  cacheWrite: number
  /** USD por 1M de tokens leídos de caché (0.1x input). */
  cacheRead: number
}

export const PRECIOS_POR_MTOK: Record<string, PrecioModelo> = {
  'claude-opus-4-8': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-sonnet-5': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
}

/** Tokens de un uso, tal como los reporta la API en `response.usage`. */
export interface TokensUso {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

/**
 * Costo del uso en MICRODÓLARES (USD * 1e6), redondeado al entero más cercano.
 * Modelo desconocido → 0 (el registro de tokens igual queda para auditar).
 */
export function calcularCostoMicroUsd(modelo: string, t: TokensUso): number {
  const precio = PRECIOS_POR_MTOK[modelo]
  if (!precio) return 0
  const usd =
    (t.inputTokens * precio.input +
      t.outputTokens * precio.output +
      t.cacheCreationTokens * precio.cacheWrite +
      t.cacheReadTokens * precio.cacheRead) /
    1_000_000
  return Math.round(usd * 1_000_000)
}

/** Formatea microdólares como USD legible (ej: 12345 → "$0.0123"). */
export function formatearUsd(microUsd: number): string {
  const usd = microUsd / 1_000_000
  if (usd >= 1) return `$${usd.toFixed(2)}`
  return `$${usd.toFixed(4)}`
}
