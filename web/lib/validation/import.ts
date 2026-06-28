// Usamos zod v4 (incluido en zod 3.25 vía el subpath `zod/v4`) porque el helper
// `zodOutputFormat` del SDK de Anthropic espera esquemas de zod v4. El resto del
// proyecto usa zod v3; aquí convive sin problema (ambas APIs vienen del mismo
// paquete).
import { z } from 'zod/v4'

import { TIPOS_PREGUNTA } from '@/lib/validation/pregunta'

// ---------------------------------------------------------------------------
// Validación de la importación de documentos con IA (Fase 7.2).
//
// `PreguntasDetectadasSchema` es la forma estructurada que le pedimos al modelo
// (vía `zodOutputFormat`): un objeto con un arreglo `preguntas`. Cada pregunta
// reproduce los campos del MVP (pregunta, A–E, correcta, explicación, materia,
// nivel) más un `tipo` para distinguir selección múltiple de desarrollo.
//
// Las alternativas y metadatos son opcionales/nullables porque no todas las
// preguntas los traen (las de desarrollo no tienen alternativas; un documento
// puede omitir materia/nivel). El esquema enviado al modelo NO usa restricciones
// de longitud (no soportadas por structured outputs); la criba de calidad
// (descartar preguntas sin enunciado) se hace después con un esquema más
// estricto, en el cliente.
// ---------------------------------------------------------------------------

/** Tipos de pregunta soportados (idénticos al MVP / a `pregunta.ts`). */
export const TIPOS_PREGUNTA_IMPORT = TIPOS_PREGUNTA

/** Acepta string, null o ausente (lo que devuelva el modelo). */
const textoOpcional = z.string().nullish()

/** Una pregunta tal cual la entrega el modelo (forma laxa, pre-criba). */
export const preguntaDetectadaSchema = z.object({
  pregunta: z.string(),
  A: textoOpcional,
  B: textoOpcional,
  C: textoOpcional,
  D: textoOpcional,
  E: textoOpcional,
  correcta: textoOpcional,
  explicacion: textoOpcional,
  materia: textoOpcional,
  nivel: textoOpcional,
  tipo: z.enum(TIPOS_PREGUNTA_IMPORT),
})

/** Forma estructurada que pedimos al modelo (raíz del structured output). */
export const PreguntasDetectadasSchema = z.object({
  preguntas: z.array(preguntaDetectadaSchema),
})

/**
 * Esquema estricto para la criba: una pregunta es válida sólo si trae un
 * enunciado no vacío. El `tipo` se normaliza a `seleccion_multiple` si viniera
 * fuera del conjunto permitido. Se usa para descartar preguntas inválidas tras
 * la detección (no se envía al modelo).
 */
export const preguntaDetectadaValidaSchema = preguntaDetectadaSchema.extend({
  pregunta: z.string().trim().min(1),
  tipo: z.enum(TIPOS_PREGUNTA_IMPORT).catch('seleccion_multiple'),
})

/** Una pregunta detectada (forma laxa inferida del esquema). */
export type PreguntaDetectada = z.infer<typeof preguntaDetectadaSchema>

/** El objeto completo devuelto por el modelo. */
export type PreguntasDetectadas = z.infer<typeof PreguntasDetectadasSchema>

// ---------------------------------------------------------------------------
// Guardado en lote (server action de confirmación).
// ---------------------------------------------------------------------------

const textoGuardar = z
  .string()
  .trim()
  .optional()
  .transform((v) => v ?? '')

/** Una pregunta lista para guardar (ya revisada/editada por el usuario). */
export const preguntaImportInputSchema = z.object({
  pregunta: z.string().trim().min(1, 'El enunciado no puede estar vacío'),
  A: textoGuardar,
  B: textoGuardar,
  C: textoGuardar,
  D: textoGuardar,
  E: textoGuardar,
  correcta: textoGuardar,
  explicacion: textoGuardar,
  materia: textoGuardar,
  nivel: textoGuardar,
  tipo: z.enum(TIPOS_PREGUNTA_IMPORT).default('seleccion_multiple'),
})

/** Payload de la confirmación: asignatura + preguntas seleccionadas. */
export const guardarImportSchema = z.object({
  asignatura: z.string().trim().min(1, 'Falta la asignatura'),
  preguntas: z
    .array(preguntaImportInputSchema)
    .min(1, 'Selecciona al menos una pregunta'),
})

export type PreguntaImportInput = z.infer<typeof preguntaImportInputSchema>
export type GuardarImportInput = z.infer<typeof guardarImportSchema>
