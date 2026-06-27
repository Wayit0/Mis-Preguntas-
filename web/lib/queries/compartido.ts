import { and, asc, eq, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colaboraciones, preguntas, usuarios } from '@/lib/db/schema'
import type { Pregunta } from '@/lib/queries/preguntas'

/**
 * Una pregunta del banco compartido junto con el nombre del autor que la
 * publicó. Extiende `Pregunta` para poder reutilizar la tarjeta de Mis
 * Preguntas en modo solo lectura.
 */
export type PreguntaCompartida = Pregunta & { autor: string }

/**
 * Preguntas compartidas visibles para el usuario: aquellas con `compartida=1`
 * cuyos autores me invitaron como colaborador
 * (`colaboraciones.from_user_id = preguntas.user_id AND to_user_id = userId`).
 *
 * Misma semántica que `getDashboardStats.compartidasConmigo`
 * (`web/lib/queries/dashboard.ts`): el `innerJoin` con `colaboraciones` ya
 * excluye las preguntas propias (no existe una colaboración conmigo mismo).
 * Si se pasa `asignatura`, la lista se acota a esa asignatura. Orden por nombre
 * de autor y luego id, igual que `cargar_banco_compartido` del MVP (app.py).
 */
export async function cargarBancoCompartido(
  userId: number,
  asignatura?: string,
): Promise<PreguntaCompartida[]> {
  const conds: SQL[] = [
    eq(colaboraciones.toUserId, userId),
    eq(preguntas.compartida, 1),
  ]
  if (asignatura) conds.push(eq(preguntas.asignatura, asignatura))

  const filas = await db
    .select({ pregunta: preguntas, autor: usuarios.nombre })
    .from(preguntas)
    .innerJoin(colaboraciones, eq(colaboraciones.fromUserId, preguntas.userId))
    .innerJoin(usuarios, eq(usuarios.id, preguntas.userId))
    .where(and(...conds))
    .orderBy(asc(usuarios.nombre), asc(preguntas.id))

  return filas.map((f) => ({ ...f.pregunta, autor: f.autor }))
}
