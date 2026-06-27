'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { colaboraciones } from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'
import { buscarUsuarioPorEmail } from '@/lib/queries/colaboradores'

/** Resultado de invitar a un colega: error legible, o el nombre del invitado. */
export type ResultadoColaborador = { error: string } | { ok: true; nombre: string }

/**
 * Agrega a un colega (por email) a la lista del usuario actual: a partir de ese
 * momento el colega podrá ver las preguntas que el usuario marque como
 * compartidas. Paridad con `agregar_colaborador` (app.py): el usuario actual es
 * el `from` y el colega encontrado es el `to`.
 *
 * Valida que el email exista, que no sea el del propio usuario, y es idempotente
 * (no duplica la colaboración si ya existe — la PK compuesta lo impediría, así
 * que usamos `onConflictDoNothing` como hace el `except IntegrityError` del MVP).
 */
export async function agregarColaborador(
  toEmail: string,
): Promise<ResultadoColaborador> {
  const session = await getSession()
  if (!session) return { error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)

  const email = (toEmail ?? '').trim().toLowerCase()
  if (!email) return { error: 'Escribe el email del colega que quieres agregar.' }

  // No puede agregarse a sí mismo (no existe una colaboración con uno mismo).
  const emailPropio = (session.user.email ?? '').trim().toLowerCase()
  if (email === emailPropio) {
    return { error: 'No puedes agregarte a ti mismo como colaborador.' }
  }

  const colega = await buscarUsuarioPorEmail(email, userId)
  if (!colega) {
    return { error: 'No encontramos a ningún colega registrado con ese email.' }
  }

  await db
    .insert(colaboraciones)
    .values({ fromUserId: userId, toUserId: colega.id })
    .onConflictDoNothing()

  revalidatePath('/colaboradores')
  return { ok: true, nombre: colega.nombre }
}

/**
 * Quita a un colega de la lista del usuario actual: deja de ver las preguntas
 * compartidas del usuario. Paridad con `eliminar_colaborador` (app.py): borra la
 * fila `(from = usuario actual, to = colega)`. El guard por `from_user_id`
 * asegura que sólo se borren colaboraciones propias.
 */
export async function eliminarColaborador(toUserId: number): Promise<void> {
  const session = await getSession()
  if (!session) return
  const userId = Number(session.user.id)
  if (!Number.isFinite(toUserId)) return

  await db
    .delete(colaboraciones)
    .where(
      and(
        eq(colaboraciones.fromUserId, userId),
        eq(colaboraciones.toUserId, toUserId),
      ),
    )

  revalidatePath('/colaboradores')
}
