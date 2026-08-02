// Usamos zod/v4 por la misma razón que lib/validation/import.ts: coherencia
// con los schemas que viajan al modelo (z.toJSONSchema vive en v4).
import { z } from 'zod/v4'

import { TIPOS_PREGUNTA } from '@/lib/validation/pregunta'
import type { PreguntaAnalizada } from '@/lib/validation/import'

// ---------------------------------------------------------------------------
// Validación de "Crear preguntas con IA" (/generar).
//
// `PreguntasGeneradasSchema` es la forma que le pedimos al modelo como
// `input_schema` de la herramienta (ver lib/ai/generar.ts). REGLA CRÍTICA
// heredada de /importar: el schema debe ser MÍNIMO — pocos campos planos, sin
// arrays de objetos extra ni restricciones — o la API rechaza la petición
// ("Schema is too complex" / "Grammar compilation timed out"). Por eso NO
// lleva tipo/materia/nivel por pregunta: esos vienen del formulario y los
// estampa el servidor al normalizar.
// ---------------------------------------------------------------------------

/** Niveles/cursos ofrecidos por el generador ("Otro" habilita campo libre). */
export const NIVELES_GENERADOR = [
  '1° Básico',
  '2° Básico',
  '3° Básico',
  '4° Básico',
  '5° Básico',
  '6° Básico',
  '7° Básico',
  '8° Básico',
  '1° Medio',
  '2° Medio',
  '3° Medio',
  '4° Medio',
  'PAES',
  'Otro',
] as const

export const MIN_PREGUNTAS_GENERAR = 1
export const MAX_PREGUNTAS_GENERAR = 5
export const CANTIDAD_GENERAR_DEFAULT = 3

/** Topes de los campos libres (viajan dentro del prompt). */
export const MAX_LARGO_TEMA = 200
export const MAX_LARGO_QUE_EVALUAR = 1000

/** Parámetros del formulario (cliente → POST /api/generar, body JSON). */
export const generarParamsSchema = z.object({
  asignatura: z.string().trim().min(1, 'Selecciona una asignatura'),
  nivel: z.string().trim().min(1, 'Indica el nivel o curso').max(80),
  tema: z.string().trim().min(1, 'Describe el tema').max(MAX_LARGO_TEMA),
  queEvaluar: z
    .string()
    .trim()
    .min(1, 'Describe qué quieres evaluar')
    .max(MAX_LARGO_QUE_EVALUAR),
  tipo: z.enum(TIPOS_PREGUNTA),
  cantidad: z
    .number()
    .int()
    .min(MIN_PREGUNTAS_GENERAR)
    .max(MAX_PREGUNTAS_GENERAR),
})

export type GenerarParams = z.infer<typeof generarParamsSchema>

/** Acepta string, null o ausente (lo que devuelva el modelo). */
const textoOpcional = z.string().nullish()

/** Una pregunta tal cual la entrega el modelo (forma laxa, pre-criba). */
export const preguntaGeneradaSchema = z.object({
  pregunta: z.string(),
  A: textoOpcional,
  B: textoOpcional,
  C: textoOpcional,
  D: textoOpcional,
  E: textoOpcional,
  correcta: textoOpcional,
  explicacion: textoOpcional,
})

/** Forma estructurada que pedimos al modelo (raíz del input de la tool). */
export const PreguntasGeneradasSchema = z.object({
  preguntas: z.array(preguntaGeneradaSchema),
})

/** Criba: una pregunta generada es válida sólo con enunciado no vacío. */
export const preguntaGeneradaValidaSchema = preguntaGeneradaSchema.extend({
  pregunta: z.string().trim().min(1),
})

export type PreguntaGenerada = z.infer<typeof preguntaGeneradaSchema>

/**
 * Respuesta del route handler /api/generar (línea final del stream ndjson).
 * Las preguntas van YA normalizadas a `PreguntaAnalizada` (tipo/materia/nivel
 * estampados desde los parámetros, campos de imagen en null) para que la
 * revisión y el borrador reutilicen las formas de /importar tal cual.
 */
export type ResultadoGeneracion =
  | { ok: true; preguntas: PreguntaAnalizada[]; borradorId?: number }
  | { ok: false; error: string; sinCupo?: boolean }
