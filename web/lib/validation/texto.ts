import { z } from 'zod'

// ---------------------------------------------------------------------------
// Validación de textos de comprensión lectora (paridad con el MVP / app.py).
//
// Un texto tiene título, contenido y una visibilidad (compartida) que reproduce
// el radio de 3 niveles del MVP: 0 = privado, 1 = sólo colaboradores, 2 = todos.
// ---------------------------------------------------------------------------

/** Niveles de visibilidad de un texto (idénticos al MVP). */
export const VISIBILIDAD_TEXTO = [
  { valor: 0, etiqueta: '🔒 Privado' },
  { valor: 1, etiqueta: '🤝 Solo mis colaboradores' },
  { valor: 2, etiqueta: '🌐 Todos' },
] as const

export const textoSchema = z.object({
  asignatura: z.string().trim().min(1, 'La asignatura es obligatoria'),
  titulo: z.string().trim().min(1, 'Escribe el título del texto'),
  contenido: z.string().trim().min(1, 'Escribe el contenido del texto'),
  // 0 = privado, 1 = colaboradores, 2 = todos (igual que el radio del MVP).
  compartida: z.coerce.number().int().min(0).max(2).default(0),
})

/** Input ya validado de un texto. */
export type TextoInput = z.infer<typeof textoSchema>

/** Devuelve el primer mensaje de error de un `safeParse` fallido. */
export function primerErrorTexto(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Datos del texto no válidos'
}
