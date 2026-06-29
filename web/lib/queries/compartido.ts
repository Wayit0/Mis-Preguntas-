import { and, asc, eq, or, sql, type SQL } from 'drizzle-orm'
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

  // El Banco Compartido refleja todo el pool que el usuario puede ver: lo que
  // OTROS comparten con él ({@link preguntaCompartidaVisible}, que excluye lo
  // propio) MÁS sus PROPIAS preguntas compartidas (van marcadas "Tuya" y
  // editables en la UI). Así "lo que comparto" también aparece aquí.
  const visibilidad = or(
    preguntaCompartidaVisible(userId, colegioId),
    and(eq(preguntas.compartida, 1), eq(preguntas.userId, userId)),
  )!

  const conds: SQL[] = [visibilidad]
  if (asignatura) conds.push(eq(preguntas.asignatura, asignatura))

  const filas = await db
    .select({ pregunta: preguntas, autor: usuarios.nombre })
    .from(preguntas)
    .innerJoin(usuarios, eq(usuarios.id, preguntas.userId))
    .where(and(...conds))
    // Las tuyas primero, luego por autor e id (orden estable).
    .orderBy(sql`(${preguntas.userId} = ${userId}) desc`, asc(usuarios.nombre), asc(preguntas.id))

  return filas.map((f) => ({ ...f.pregunta, autor: f.autor }))
}
