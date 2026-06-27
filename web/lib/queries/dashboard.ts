import { and, count, eq, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colaboraciones, preguntas, textos } from '@/lib/db/schema'

export interface DashboardStats {
  /** Preguntas creadas por el usuario (filtradas por asignatura si se indica). */
  misPreguntas: number
  /** Textos creados por el usuario (filtrados por asignatura si se indica). */
  misTextos: number
  /**
   * Preguntas con `compartida=1` cuyos autores son colaboradores que me
   * invitaron (colaboraciones con `to_user_id = userId`). Misma semántica que
   * el banco compartido del MVP (`from_user_id = p.user_id AND to_user_id = uid`).
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

  const compartidasConds: SQL[] = [
    eq(colaboraciones.toUserId, userId),
    eq(preguntas.compartida, 1),
  ]
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
          .innerJoin(
            colaboraciones,
            eq(colaboraciones.fromUserId, preguntas.userId),
          )
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
