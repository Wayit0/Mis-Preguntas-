import { db } from '@/lib/db'
import { usosIa } from '@/lib/db/schema'
import { calcularCostoMicroUsd } from '@/lib/ai/costos'
import type { UsoDeteccion } from '@/lib/ai/import'

/**
 * Registra un uso de IA en `usos_ia` (panel de costos del admin y cuotas
 * mensuales por acción). Nunca lanza: un fallo al registrar no debe romper la
 * operación que ya funcionó.
 */
export async function registrarUsoIa(
  userId: number,
  accion: string,
  uso: UsoDeteccion,
  detalle: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(usosIa).values({
      userId,
      accion,
      modelo: uso.modelo,
      inputTokens: uso.inputTokens,
      outputTokens: uso.outputTokens,
      cacheCreationTokens: uso.cacheCreationTokens,
      cacheReadTokens: uso.cacheReadTokens,
      costoMicroUsd: calcularCostoMicroUsd(uso.modelo, uso),
      detalle,
    })
  } catch (err) {
    console.error(`[usos-ia] no se pudo registrar el uso (${accion}):`, err)
  }
}
