import { and, asc, eq, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { preguntas, usuarios } from '@/lib/db/schema'
import type { Pregunta } from '@/lib/queries/preguntas'
import {
  colegioIdDeUsuario,
  preguntaCompartidaVisible,
} from '@/lib/queries/visibilidad'

/**
 * Una pregunta del banco compartido junto con el nombre del autor que la
 * publicó. Extiende `Pregunta` para poder reutilizar la tarjeta de Mis
 * Preguntas en modo solo lectura.
 */
export type PreguntaCompartida = Pregunta & { autor: string }

/**
 * Preguntas compartidas visibles para el usuario, según la visibilidad
 * unificada de la Parte D ({@link preguntaCompartidaVisible}): `compartida=1` y
 * (auto-colegio: mismo colegio que el autor) O (invitación: el autor me invitó
 * como colaborador). Las cuentas personales solo ven por invitación.
 *
 * Mantiene el nombre del autor uniendo `preguntas.user_id → usuarios.id`; el
 * auto-colegio de la condición usa un alias distinto, así que no choca con este
 * join. Si se pasa `asignatura`, la lista se acota a esa asignatura. Orden por
 * nombre de autor y luego id, igual que `cargar_banco_compartido` del MVP.
 */
export async function cargarBancoCompartido(
  userId: number,
  asignatura?: string,
): Promise<PreguntaCompartida[]> {
  const colegioId = await colegioIdDeUsuario(userId)

  const conds: SQL[] = [preguntaCompartidaVisible(userId, colegioId)]
  if (asignatura) conds.push(eq(preguntas.asignatura, asignatura))

  const filas = await db
    .select({ pregunta: preguntas, autor: usuarios.nombre })
    .from(preguntas)
    .innerJoin(usuarios, eq(usuarios.id, preguntas.userId))
    .where(and(...conds))
    .orderBy(asc(usuarios.nombre), asc(preguntas.id))

  return filas.map((f) => ({ ...f.pregunta, autor: f.autor }))
}
