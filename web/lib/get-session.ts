import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

/**
 * Sesión del usuario, o `null` si no hay sesión válida O el usuario está
 * SUSPENDIDO (`banned`).
 *
 * better-auth sólo comprueba `banned` en el sign-in (hook session.create.before),
 * NO al leer la sesión: sin esto, un usuario suspendido con una sesión viva
 * seguiría pudiendo invocar todas las server actions y route handlers (que usan
 * getSession), evadiendo la suspensión. Aquí lo tratamos como sin sesión, de
 * forma centralizada, para que TODO el que use getSession lo rechace.
 * `banExpires` en el futuro = suspensión temporal aún vigente; sin `banExpires`
 * = permanente. (No hay cookie-cache configurado, así que el usuario devuelto es
 * fresco de la BD.)
 */
export async function getSession() {
  const res = await auth.api.getSession({ headers: await headers() })
  if (!res) return null
  const u = res.user as {
    banned?: boolean | null
    banExpires?: Date | string | null
  }
  if (u.banned && (!u.banExpires || new Date(u.banExpires) > new Date())) {
    return null
  }
  return res
}
