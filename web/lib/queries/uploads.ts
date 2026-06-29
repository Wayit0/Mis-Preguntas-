import { and, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colegios, preguntas } from '@/lib/db/schema'
import {
  colegioIdDeUsuario,
  preguntaCompartidaVisible,
} from '@/lib/queries/visibilidad'

/**
 * Autoriza el acceso a una imagen del Blob por su clave.
 *
 * Toda imagen servida está referenciada por una `pregunta` (se sube dentro de
 * `crearPregunta`, junto con la fila; los `textos` no tienen imágenes y el logo
 * del PDF no se almacena). El usuario puede verla si existe una pregunta que
 * referencia la clave y además:
 *   (a) es el dueño de esa pregunta (`user_id = userId`), o
 *   (b) esa pregunta le es visible según la visibilidad unificada de la Parte D
 *       ({@link preguntaCompartidaVisible}): `compartida=1` y (mismo colegio que
 *       el autor) O (el autor me invitó como colaborador).
 *
 * Si ninguna pregunta referencia la clave —o ninguna de las que la referencian
 * cumple (a) o (b)— devuelve `false` (la route responde 404, sin revelar la
 * existencia del blob a usuarios no autorizados). Crítico: NO reintroducir el
 * IDOR — el dueño y la visibilidad son la ÚNICA puerta de acceso.
 */
export async function puedeVerImagen(
  key: string,
  userId: number,
): Promise<boolean> {
  const colegioId = await colegioIdDeUsuario(userId)

  const referenciaLaClave = or(
    eq(preguntas.imagenPregunta, key),
    eq(preguntas.imagenA, key),
    eq(preguntas.imagenB, key),
    eq(preguntas.imagenC, key),
    eq(preguntas.imagenD, key),
    eq(preguntas.imagenE, key),
  )

  const filas = await db
    .select({ id: preguntas.id })
    .from(preguntas)
    .where(
      and(
        referenciaLaClave,
        or(
          // (a) dueño de la pregunta que referencia la clave.
          eq(preguntas.userId, userId),
          // (b) la pregunta le es visible (auto-colegio o invitación).
          preguntaCompartidaVisible(userId, colegioId),
        ),
      ),
    )
    .limit(1)

  if (filas.length > 0) return true

  // El logo del colegio es visible para cualquier miembro de ese colegio.
  if (colegioId !== null) {
    const [filaColegio] = await db
      .select({ id: colegios.id })
      .from(colegios)
      .where(and(eq(colegios.id, colegioId), eq(colegios.logo, key)))
      .limit(1)
    if (filaColegio) return true
  }

  return false
}
