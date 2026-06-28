import { and, count, eq, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colaboraciones, preguntas, textos } from '@/lib/db/schema'
import {
  colegioIdDeUsuario,
  preguntaCompartidaVisible,
} from '@/lib/queries/visibilidad'

export interface DashboardStats {
  /** Preguntas creadas por el usuario (filtradas por asignatura si se indica). */
  misPreguntas: number
  /** Textos creados por el usuario (filtrados por asignatura si se indica). */
  misTextos: number
  /**
   * Preguntas compartidas visibles para el usuario según la visibilidad
   * unificada de la Parte D ({@link preguntaCompartidaVisible}): `compartida=1`
   * y (mismo colegio que el autor) O (el autor me invitó como colaborador).
   */
  compartidasConmigo: number
  /** Colaboradores que el usuario invitó (colaboraciones con `from_user_id = userId`). */
  colaboradores: number
}

// Lee el único valor de un `SELECT count(*)`. drizzle siempre devuelve una fila
// para una agregación sin GROUP BY, pero el `?? 0` mantiene el tipo no-nulo.
async function contar(query: Promise<{ value: number }[]>): Promise<number> {
  const [row] = await query
  return row?.value ?? 0
}

/**
 * Conteos del panel para un usuario. Si se pasa `asignatura`, los conteos de
 * preguntas, textos y compartidas se restringen a esa asignatura; el conteo de
 * colaboradores es global (no depende de la asignatura).
 */
export async function getDashboardStats(
  userId: number,
  asignatura?: string,
): Promise<DashboardStats> {
  const preguntasWhere: SQL | undefined = asignatura
    ? and(eq(preguntas.userId, userId), eq(preguntas.asignatura, asignatura))
    : eq(preguntas.userId, userId)

  const textosWhere: SQL | undefined = asignatura
    ? and(eq(textos.userId, userId), eq(textos.asignatura, asignatura))
    : eq(textos.userId, userId)

  const colegioId = await colegioIdDeUsuario(userId)
  const compartidasConds: SQL[] = [preguntaCompartidaVisible(userId, colegioId)]
  if (asignatura) {
    compartidasConds.push(eq(preguntas.asignatura, asignatura))
  }

  const [misPreguntas, misTextos, compartidasConmigo, colaboradores] =
    await Promise.all([
      contar(
        db.select({ value: count() }).from(preguntas).where(preguntasWhere),
      ),
      contar(db.select({ value: count() }).from(textos).where(textosWhere)),
      contar(
        db
          .select({ value: count() })
          .from(preguntas)
          .where(and(...compartidasConds)),
      ),
      contar(
        db
          .select({ value: count() })
          .from(colaboraciones)
          .where(eq(colaboraciones.fromUserId, userId)),
      ),
    ])

  return { misPreguntas, misTextos, compartidasConmigo, colaboradores }
}
