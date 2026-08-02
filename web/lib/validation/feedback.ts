import { z } from 'zod'

// ---------------------------------------------------------------------------
// Validación del feedback de usuarios (widget flotante y encuestas
// contextuales). El contexto es un objeto plano pequeño (parámetros de la
// pantalla evaluada); el tope de tamaño evita payloads abusivos.
// ---------------------------------------------------------------------------

export const MAX_LARGO_COMENTARIO_FEEDBACK = 2000

/** Tope del contexto serializado (los parámetros de una generación caben de sobra). */
export const MAX_BYTES_CONTEXTO_FEEDBACK = 4 * 1024

export const feedbackSchema = z.object({
  pagina: z.string().trim().min(1).max(200),
  puntaje: z.number().int().min(1).max(5),
  comentario: z
    .string()
    .trim()
    .max(
      MAX_LARGO_COMENTARIO_FEEDBACK,
      `El comentario no puede superar los ${MAX_LARGO_COMENTARIO_FEEDBACK} caracteres`,
    )
    .optional()
    .transform((v) => v ?? ''),
  contexto: z
    .record(z.unknown())
    .optional()
    .refine(
      (v) => !v || JSON.stringify(v).length <= MAX_BYTES_CONTEXTO_FEEDBACK,
      'El contexto del feedback es demasiado grande',
    ),
})

export type FeedbackInput = z.input<typeof feedbackSchema>
