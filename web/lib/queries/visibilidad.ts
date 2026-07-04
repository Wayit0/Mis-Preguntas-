import { and, eq, exists, ne, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colaboraciones, preguntas, usuarios } from '@/lib/db/schema'

/**
 * Única fuente de verdad de la visibilidad del banco compartido (Parte D).
 *
 * Devuelve la condición SQL (Drizzle) que selecciona, sobre la tabla
 * `preguntas`, las preguntas **compartidas visibles para el actor**: una
 * pregunta P de autor A (con A ≠ actor) con `compartida = 1` es visible si se
 * cumple AL MENOS UNA (UNION / OR, retro-compatible):
 *
 *  (1) AUTO-COLEGIO: la pregunta pertenece al colegio del actor
 *      (`preguntas.colegio_id` = `actorColegioId`) y `actorColegioId` NO es
 *      null. Las cuentas personales (colegio null) nunca disparan este caso.
 *      El colegio se ANCLA en la propia pregunta (`preguntas.colegio_id`, que se
 *      estampa al crear), no en el autor: así sigue visible en el banco del
 *      colegio aunque el autor sea suspendido o eliminado del colegio.
 *  (2) INVITACIÓN (modelo actual): existe `colaboraciones.from_user_id = A
 *      (autor) AND to_user_id = actor`, vía EXISTS correlacionado.
 *
 * Como la condición se expresa solo en términos de `preguntas` (más subqueries
 * correlacionadas), se reutiliza idéntica en consultas con join a `usuarios`
 * (compartido/dashboard) y en el chequeo por clave de imagen (uploads), sin
 * depender de qué tablas haya en el FROM externo.
 *
 * El `ne(user_id, actor)` excluye las preguntas propias: el auto-colegio si no
 * lo haría las incluiría (uno comparte colegio consigo mismo). Para uploads,
 * donde el dueño se autoriza por separado (OR con `user_id = actor`), excluir
 * aquí lo propio es inofensivo y mantiene una sola definición.
 *
 * @param actorId        id del usuario para quien se calcula la visibilidad.
 * @param actorColegioId colegio_id del actor (null = cuenta personal/admin).
 */
export function preguntaCompartidaVisible(
  actorId: number,
  actorColegioId: number | null,
): SQL {
  // (2) INVITACIÓN: el autor me invitó como colaborador.
  const invitacion = exists(
    db
      .select({ one: sql`1` })
      .from(colaboraciones)
      .where(
        and(
          eq(colaboraciones.fromUserId, preguntas.userId),
          eq(colaboraciones.toUserId, actorId),
        ),
      ),
  )

  const visibles: SQL[] = [invitacion]

  // (1) AUTO-COLEGIO: la pregunta PERTENECE a mi colegio (`preguntas.colegio_id`
  // = colegio del actor). Ancla el contenido al colegio: sigue visible aunque el
  // autor haya sido suspendido o eliminado del colegio. Solo aplica si el actor
  // pertenece a un colegio.
  if (actorColegioId !== null) {
    visibles.push(eq(preguntas.colegioId, actorColegioId))
  }

  return and(
    eq(preguntas.compartida, 1),
    ne(preguntas.userId, actorId),
    or(...visibles)!,
  )!
}

/**
 * Lee el `colegio_id` del actor (null si es cuenta personal/admin global o si
 * el usuario no existe). Helper de conveniencia para los callers que necesitan
 * pasar el colegio a {@link preguntaCompartidaVisible}.
 */
export async function colegioIdDeUsuario(
  userId: number,
): Promise<number | null> {
  const [fila] = await db
    .select({ colegioId: usuarios.colegioId })
    .from(usuarios)
    .where(eq(usuarios.id, userId))
    .limit(1)
  return fila?.colegioId ?? null
}
