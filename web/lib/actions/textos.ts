'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { preguntas, textos } from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'
import { textoSchema, primerErrorTexto } from '@/lib/validation/texto'

/** Resultado de crear un texto: error legible, o el id del texto creado. */
export type ResultadoTexto = { error: string } | { id: number }

/**
 * Crea un texto del usuario autenticado. Valida el input con Zod y devuelve el
 * id del texto recién creado (la navegación a la lista la hace el cliente).
 */
export async function guardarTexto(
  input: Record<string, unknown>,
): Promise<ResultadoTexto> {
  const session = await getSession()
  if (!session) return { error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)

  const parsed = textoSchema.safeParse(input)
  if (!parsed.success) return { error: primerErrorTexto(parsed.error) }
  const data = parsed.data

  const [fila] = await db
    .insert(textos)
    .values({
      userId,
      asignatura: data.asignatura,
      titulo: data.titulo,
      contenido: data.contenido,
      compartida: data.compartida,
    })
    .returning({ id: textos.id })

  revalidatePath('/textos')
  return { id: fila.id }
}

/**
 * Elimina un texto del usuario (guard de propiedad). Como en app.py, primero
 * desasocia las preguntas que lo referencian (texto_id = NULL) y luego borra el
 * texto; ambas operaciones van en una transacción para que sea atómico. Las
 * preguntas NO se borran: sólo pierden la referencia al texto.
 */
export async function eliminarTexto(id: number): Promise<void> {
  const session = await getSession()
  if (!session) return
  const userId = Number(session.user.id)
  if (!Number.isFinite(id)) return

  // Guard de propiedad: sólo continúa si el texto pertenece al usuario. Así no
  // se desasocian preguntas de un texto ajeno.
  const [existente] = await db
    .select({ id: textos.id })
    .from(textos)
    .where(and(eq(textos.id, id), eq(textos.userId, userId)))
    .limit(1)
  if (!existente) return

  await db.transaction(async (tx) => {
    await tx
      .update(preguntas)
      .set({ textoId: null })
      .where(eq(preguntas.textoId, id))
    await tx
      .delete(textos)
      .where(and(eq(textos.id, id), eq(textos.userId, userId)))
  })

  revalidatePath('/textos')
}
