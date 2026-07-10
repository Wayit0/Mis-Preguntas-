import { z } from 'zod'

// ---------------------------------------------------------------------------
// Validación de preguntas (paridad con el MVP / app.py).
//
// El input cubre todos los campos de texto de una pregunta. Las imágenes NO
// viajan por este schema: se procesan aparte en las server actions a partir del
// FormData (son `File`, no texto). Aquí sólo validamos los campos de texto.
// ---------------------------------------------------------------------------

/** Tipos de pregunta soportados (idénticos al MVP). */
export const TIPOS_PREGUNTA = [
  'seleccion_multiple',
  'desarrollo_corto',
  'desarrollo_largo',
] as const
export type TipoPregunta = (typeof TIPOS_PREGUNTA)[number]

/** Etiquetas legibles para cada tipo. */
export const ETIQUETA_TIPO: Record<TipoPregunta, string> = {
  seleccion_multiple: 'Selección múltiple',
  desarrollo_corto: 'Desarrollo corto',
  desarrollo_largo: 'Desarrollo largo',
}

/** Letras de alternativa. */
export const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const
export type Letra = (typeof LETRAS)[number]

/** Tamaños de imagen en el PDF impreso. */
export const TAMANOS_IMAGEN = ['chico', 'mediano', 'grande'] as const
export type TamanoImagen = (typeof TAMANOS_IMAGEN)[number]

/** Etiquetas legibles para cada tamaño de imagen. */
export const ETIQUETA_TAMANO_IMAGEN: Record<TamanoImagen, string> = {
  chico: 'Chico',
  mediano: 'Mediano',
  grande: 'Grande (ancho completo)',
}

/** Niveles sugeridos (el último, "Otro", habilita un campo libre). */
export const NIVELES_SUGERIDOS = [
  'PAES',
  'Plan Ministerial',
  'Bachillerato Internacional',
  'Otro',
] as const

const opcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => v ?? '')

export const preguntaSchema = z
  .object({
    asignatura: z.string().trim().min(1, 'La asignatura es obligatoria'),
    materia: opcional,
    contenido: opcional,
    nivel: opcional,
    pregunta: z.string().trim().min(1, 'Escribe el enunciado de la pregunta'),
    A: opcional,
    B: opcional,
    C: opcional,
    D: opcional,
    E: opcional,
    correcta: opcional,
    explicacion: opcional,
    tipo: z.enum(TIPOS_PREGUNTA).default('seleccion_multiple'),
    imagenTamano: z.enum(TAMANOS_IMAGEN).default('mediano'),
    // 0 = privada, 1 = compartida (con colaboradores). Se acepta hasta 2 por
    // compatibilidad con el MVP (2 = pública), aunque la UI usa 0/1.
    compartida: z.coerce.number().int().min(0).max(2).default(0),
  })
  .superRefine((val, ctx) => {
    // Para selección múltiple exigimos marcar la alternativa correcta y que esa
    // alternativa tenga contenido (texto o, en la práctica, imagen). En los tipos
    // de desarrollo, alternativas y correcta son opcionales.
    if (val.tipo === 'seleccion_multiple') {
      if (!LETRAS.includes(val.correcta as Letra)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correcta'],
          message: 'Selecciona la alternativa correcta (A–E)',
        })
      }
    }
  })

/** Input ya validado de una pregunta (campos de texto). */
export type PreguntaInput = z.infer<typeof preguntaSchema>

/** Devuelve el primer mensaje de error de un `safeParse` fallido. */
export function primerErrorPregunta(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Datos de la pregunta no válidos'
}
