import { and, eq, exists, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { asignaciones, colegios, cursos, inscripciones, preguntas } from '@/lib/db/schema'
import {
  colegioIdDeUsuario,
  preguntaCompartidaVisible,
} from '@/lib/queries/visibilidad'

/**
 * Escapa `%`, `_` y `\` para usar `valor` como texto LITERAL dentro de un
 * patrón LIKE (con `ESCAPE '\'`). Las claves de blob son `randomUUID().ext`
 * (ver lib/storage/blob.ts) y nunca deberían traer estos caracteres, pero la
 * clave llega desde la URL pública (`[...path]`) así que se sanea igual: sin
 * esto, un `%`/`_` en la clave actuaría como comodín del LIKE.
 */
function escaparLike(valor: string): string {
  return valor.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * Autoriza el acceso a una imagen del Blob por su clave.
 *
 * Hay dos caminos independientes que autorizan una clave (basta con uno):
 *
 * 1. Referenciada por una `pregunta` (se sube dentro de `crearPregunta`, junto
 *    con la fila; los `textos` no tienen imágenes y el logo del PDF no se
 *    almacena). El usuario puede verla si existe una pregunta que referencia
 *    la clave y además:
 *      (a) es el dueño de esa pregunta (`user_id = userId`), o
 *      (b) esa pregunta le es visible según la visibilidad unificada de la
 *          Parte D ({@link preguntaCompartidaVisible}): `compartida=1` y
 *          (mismo colegio que el autor) O (el autor me invitó como
 *          colaborador).
 *
 * 2. Referenciada por el `contenido` (snapshot congelado, ver
 *    lib/tareas/contenido.ts) de una `asignación` de Cursos y Tareas, y el
 *    usuario es (a) el profesor dueño del curso de esa asignación, o (b) un
 *    estudiante inscrito en ese curso. Necesario porque el snapshot es
 *    INDEPENDIENTE de la pregunta original: sigue sirviendo la imagen aunque
 *    la pregunta fuente se haya borrado (por eso no basta con el camino 1).
 *
 * Si ninguno de los dos caminos autoriza la clave, devuelve `false` (la route
 * responde 404, sin revelar la existencia del blob a usuarios no
 * autorizados). Crítico: NO reintroducir el IDOR — el dueño y la visibilidad
 * son la ÚNICA puerta de acceso.
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

  // Camino 2: la clave está en el snapshot de una asignación de Cursos y
  // Tareas cuyo curso el usuario dicta (profesor) o cursa (estudiante
  // inscrito). El texto se busca entre comillas (`"<clave>"`) porque en el
  // jsonb es siempre el VALOR de un campo `imagen*` (string), nunca una clave
  // de objeto ni un valor numérico.
  const patron = `%"${escaparLike(key)}"%`
  const [filaAsignacion] = await db
    .select({ id: asignaciones.id })
    .from(asignaciones)
    .innerJoin(cursos, eq(asignaciones.cursoId, cursos.id))
    .where(
      and(
        sql`${asignaciones.contenido}::text LIKE ${patron} ESCAPE '\\'`,
        or(
          // (a) profesor dueño del curso de la asignación.
          eq(cursos.userId, userId),
          // (b) estudiante inscrito en ese curso.
          exists(
            db
              .select({ one: sql`1` })
              .from(inscripciones)
              .where(
                and(
                  eq(inscripciones.cursoId, asignaciones.cursoId),
                  eq(inscripciones.estudianteId, userId),
                ),
              ),
          ),
        ),
      ),
    )
    .limit(1)
  if (filaAsignacion) return true

  return false
}
