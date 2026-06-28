import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'

// ---------------------------------------------------------------------------
// Helpers de autorización (server-side) reutilizables.
//
// IMPORTANTE — REGLA DE SEGURIDAD: las server actions y route handlers DEBEN
// validar permisos con estos helpers (getActor/requireActor/requireRole/
// esAdminDeColegio/esGlobalAdmin). NO confíes en la UI: ocultar un botón no
// impide que un cliente llame a la action. Cada mutación que dependa del rol o
// del colegio tiene que re-verificar la identidad aquí, en el servidor.
//
// `getActor()` es la fuente de verdad del rol/colegio: lee la fila de `usuarios`
// (no sólo la sesión), de modo que un cambio de rol/colegio en la BD se refleja
// de inmediato aunque la sesión cacheada traiga un valor antiguo.
// ---------------------------------------------------------------------------

export type Rol = 'global_admin' | 'school_admin' | 'teacher'

export interface Actor {
  userId: number
  role: Rol
  colegioId: number | null
  nombre: string
  email: string
}

/**
 * Lee la sesión + la fila de `usuarios` y devuelve el actor, o `null` si no hay
 * sesión válida (o el usuario ya no existe).
 */
export async function getActor(): Promise<Actor | null> {
  const session = await getSession()
  const rawId = session?.user?.id
  if (rawId == null) return null

  const userId = Number(rawId)
  if (!Number.isFinite(userId)) return null

  const [row] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, userId))
    .limit(1)
  if (!row) return null

  return {
    userId: row.id,
    role: row.role as Rol,
    colegioId: row.colegioId ?? null,
    nombre: row.nombre,
    email: row.email,
  }
}

/**
 * Devuelve el actor o redirige a /login si no hay sesión. Úsalo al inicio de
 * server components / actions que requieran un usuario autenticado.
 */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor()
  if (!actor) redirect('/login')
  return actor
}

/**
 * Exige que el actor tenga uno de los roles permitidos. Redirige a /login si no
 * hay sesión y a "/" si la sesión existe pero el rol no está autorizado (evita
 * filtrar la existencia del recurso a usuarios no autorizados).
 */
export async function requireRole(roles: string[]): Promise<Actor> {
  const actor = await requireActor()
  if (!roles.includes(actor.role)) redirect('/')
  return actor
}

/** ¿El actor es admin global? */
export function esGlobalAdmin(actor: Actor | null | undefined): boolean {
  return actor?.role === 'global_admin'
}

/**
 * ¿El actor puede administrar el colegio dado? Lo es el admin global (cualquier
 * colegio) y el school_admin cuyo `colegioId` coincide con el solicitado.
 */
export function esAdminDeColegio(
  actor: Actor | null | undefined,
  colegioId: number,
): boolean {
  if (!actor) return false
  if (actor.role === 'global_admin') return true
  return actor.role === 'school_admin' && actor.colegioId === colegioId
}
