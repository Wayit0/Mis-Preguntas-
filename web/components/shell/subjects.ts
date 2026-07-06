/**
 * Nombre de la cookie del contexto de asignatura. Vive aquí (módulo sin imports
 * de servidor) para poder compartirlo entre el selector cliente y el helper de
 * servidor `lib/asignatura.ts` sin filtrar `next/headers` al bundle del cliente.
 */
export const COOKIE_ASIGNATURA = 'asignatura'

/**
 * Fija (o borra, con `null`) la cookie del contexto de asignatura desde el
 * cliente. Vive a nivel de módulo (fuera de cualquier componente) para reusarla
 * en el selector y en el cuadro de onboarding sin repetir la lógica. Los
 * llamadores deben refrescar (`router.refresh()`) tras invocarla.
 */
export function fijarCookieAsignatura(nombre: string | null): void {
  if (typeof document === 'undefined') return
  document.cookie = nombre
    ? `${COOKIE_ASIGNATURA}=${encodeURIComponent(nombre)}; path=/; max-age=31536000; samesite=lax`
    : `${COOKIE_ASIGNATURA}=; path=/; max-age=0; samesite=lax`
}

export interface Asignatura {
  /** Nombre visible y, a la vez, valor del searchParam `?asignatura=`. */
  nombre: string
  emoji: string
}

// Las 8 asignaturas del currículum (paridad con el MVP). El `nombre` se usa tal
// cual como valor del contexto de asignatura en la URL (`?asignatura=`).
export const ASIGNATURAS: Asignatura[] = [
  { nombre: 'Física', emoji: '⚛️' },
  { nombre: 'Química', emoji: '🧪' },
  { nombre: 'Biología', emoji: '🧬' },
  { nombre: 'Matemáticas', emoji: '📐' },
  { nombre: 'Filosofía', emoji: '🏛️' },
  { nombre: 'Ciencias de la Ciudadanía', emoji: '🏫' },
  { nombre: 'Lenguaje', emoji: '📖' },
  { nombre: 'SAS', emoji: '🌍' },
]
