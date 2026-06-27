'use server'

import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'

const emailSchema = z.string().email()

/**
 * Indica si existe un usuario con ese correo. Se usa sólo para afinar el mensaje
 * de error del login (distinguir "Correo no encontrado" de "Contraseña
 * incorrecta"), reproduciendo el comportamiento del MVP. Es una lectura, no una
 * mutación.
 */
export async function correoRegistrado(email: string): Promise<boolean> {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return false
  const [u] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, parsed.data))
    .limit(1)
  return Boolean(u)
}
