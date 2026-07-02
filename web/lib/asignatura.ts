import { cookies } from 'next/headers'
import { ASIGNATURAS, COOKIE_ASIGNATURA } from '@/components/shell/subjects'
import { asignaturaMasUsada } from '@/lib/queries/preguntas'

/**
 * Contexto de asignatura de la app. Vive en una cookie (no en la URL) para que
 * la última seleccionada se mantenga entre navegaciones y recargas, y para que
 * tanto los server components (listas, formularios) como el selector del menú
 * lateral lean el mismo valor. El nombre de la cookie se define en `subjects.ts`
 * (módulo sin imports de servidor) y se reexporta aquí por comodidad.
 */

export { COOKIE_ASIGNATURA }

/** `true` si `nombre` es una de las asignaturas conocidas. */
export function esAsignaturaValida(
  nombre: string | undefined | null,
): nombre is string {
  return !!nombre && ASIGNATURAS.some((a) => a.nombre === nombre)
}

/** Lee la asignatura de la cookie (validada contra la lista), o `null`. */
export async function leerCookieAsignatura(): Promise<string | null> {
  const store = await cookies()
  const valor = store.get(COOKIE_ASIGNATURA)?.value
  return esAsignaturaValida(valor) ? valor : null
}

/**
 * Resuelve la asignatura activa del usuario, en este orden:
 *  1. la última seleccionada (cookie), si es válida;
 *  2. la que más usa (la de más preguntas), si aún no ha elegido ninguna;
 *  3. `''` = "Todas las asignaturas" (usuario nuevo sin contenido).
 */
export async function resolverAsignatura(userId: number): Promise<string> {
  const cookie = await leerCookieAsignatura()
  if (cookie) return cookie
  return (await asignaturaMasUsada(userId)) ?? ''
}
