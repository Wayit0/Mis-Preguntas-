import { and, eq, inArray, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colaboraciones, preguntas } from '@/lib/db/schema'

/**
 * Autoriza el acceso a una imagen del Blob por su clave.
 *
 * Toda imagen servida está referenciada por una `pregunta` (se sube dentro de
 * `crearPregunta`, junto con la fila; los `textos` no tienen imágenes y el logo
 * del PDF no se almacena). El usuario puede verla si:
 *   (a) es el dueño de una pregunta que la referencia (`user_id = userId`), o
 *   (b) un colaborador le compartió una pregunta que la referencia
 *       (`compartida = 1` y existe `colaboraciones.from_user_id = autor AND
 *        to_user_id = userId`) — misma semántica que `cargarBancoCompartido`.
 *
 * Si ninguna pregunta referencia la clave, devuelve `false` (la route responde
 * 404, sin revelar la existencia del blob a usuarios no autorizados).
 */
export async function puedeVerImagen(
  key: string,
  userId: number,
): Promise<boolean> {
  const filas = await db
    .select({ userId: preguntas.userId, compartida: preguntas.compartida })
    .from(preguntas)
    .where(
      or(
        eq(preguntas.imagenPregunta, key),
        eq(preguntas.imagenA, key),
        eq(preguntas.imagenB, key),
        eq(preguntas.imagenC, key),
        eq(preguntas.imagenD, key),
        eq(preguntas.imagenE, key),
      ),
    )

  if (filas.length === 0) return false

  // (a) dueño
  if (filas.some((f) => f.userId === userId)) return true

  // (b) compartida conmigo por un colaborador
  const autoresCompartidos = [
    ...new Set(
      filas.filter((f) => (f.compartida ?? 0) === 1).map((f) => f.userId),
    ),
  ]
  if (autoresCompartidos.length === 0) return false

  const relacion = await db
    .select({ from: colaboraciones.fromUserId })
    .from(colaboraciones)
    .where(
      and(
        eq(colaboraciones.toUserId, userId),
        inArray(colaboraciones.fromUserId, autoresCompartidos),
      ),
    )
    .limit(1)

  return relacion.length > 0
}
