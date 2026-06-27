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
