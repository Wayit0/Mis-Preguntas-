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

/**
 * Índice (0-based) de una imagen incrustada en el documento (ver
 * `ImagenExtraida` en `docparse/extract`), o null si el enunciado no depende
 * de ninguna imagen. Sin `.nonnegative()`/rango: las restricciones numéricas
 * (`minimum`/`maximum`) no están soportadas en structured outputs; un índice
 * negativo o fuera de rango simplemente no resuelve a ninguna imagen (ver
 * `resolverImagen` en el cliente), no hace falta que el schema lo valide.
 *
 * Sólo se pide para el enunciado (no por alternativa): un campo por
 * alternativa (5 más) hacía que la API rechazara la petición con
 * `400 "Schema is too complex."`. El caso más común —un diagrama o gráfico en
 * el enunciado del que dependen las alternativas— sigue cubierto.
 */
const indiceImagenOpcional = z.number().int().nullish()

/**
 * Imágenes asociadas a alternativas, como STRING compacto "LETRA:INDICE"
 * separado por comas (ej: "A:0,B:1"), o null si ninguna alternativa lleva
 * imagen. Historia de este formato: 5 campos `imagenAIndice`…`imagenEIndice`
 * daban `400 "Schema is too complex."`; un arreglo de objetos {letra, indice}
 * daba `400 "Grammar compilation timed out."` (visto en producción). Un string
 * plano añade complejidad mínima a la gramática del structured output; el
 * parseo/validación real lo hace {@link parsearImagenesAlternativas}.
 */
const imagenesAlternativasSchema = z.string().nullish()

/** Un par letra→índice ya parseado y validado. */
export interface ImagenAlternativa {
  letra: 'A' | 'B' | 'C' | 'D' | 'E'
  indice: number
}

/**
 * Parsea el string compacto "A:0,B:1" a pares {letra, indice} válidos. Entradas
 * malformadas (letras fuera de A–E, índices no numéricos, basura) se descartan
 * en silencio: una referencia inválida simplemente no resuelve a ninguna
 * imagen, igual que un índice fuera de rango.
 */
export function parsearImagenesAlternativas(
  valor: string | null | undefined,
): ImagenAlternativa[] {
  if (!valor) return []
  const pares: ImagenAlternativa[] = []
  for (const tramo of valor.split(',')) {
    const m = tramo.trim().match(/^([A-E])\s*:\s*(\d+)$/)
    if (!m) continue
    pares.push({ letra: m[1] as ImagenAlternativa['letra'], indice: Number(m[2]) })
  }
  return pares
}

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
  // Referencia a la imagen incrustada del documento (marcador `[IMAGEN_n]`) de
  // la que depende el enunciado, si aplica (ver comentario de
  // `indiceImagenOpcional`).
  imagenPreguntaIndice: indiceImagenOpcional,
  // Imágenes de las alternativas (si alguna alternativa ES una imagen o
  // depende de una), como string compacto "A:0,B:1". Null si no aplica.
  imagenesAlternativas: imagenesAlternativasSchema,
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

/** Tipos MIME de imagen que se pueden re-subir a Blob Storage al guardar. */
const MEDIA_TYPES_IMAGEN_GUARDAR = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

/**
 * Una imagen ya extraída del documento (base64 + su mime), lista para re-subir
 * a Blob Storage como `imagenPregunta` al confirmar el guardado. El cliente la
 * arma a partir de `ImagenExtraida` (la resuelve desde el índice que puso la
 * IA) y la reenvía tal cual: `analizarDocumento` y `guardarPreguntasImportadas`
 * son actions independientes, sin estado compartido en el servidor.
 */
const imagenObjetoSchema = z.object({
  base64: z.string().min(1),
  mediaType: z.enum(MEDIA_TYPES_IMAGEN_GUARDAR),
})
const imagenParaGuardarSchema = imagenObjetoSchema.nullish()

/** Imagen ya resuelta (no nula): base64 + mime, lista para re-subir. */
export type ImagenParaGuardar = z.infer<typeof imagenObjetoSchema>

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
  imagenPregunta: imagenParaGuardarSchema,
  // Imágenes por alternativa, ya resueltas por el cliente desde los índices de
  // `imagenesAlternativas`. Este schema NO viaja al modelo (es cliente→server
  // action), así que los 5 campos no chocan con el límite de structured outputs.
  imagenA: imagenParaGuardarSchema,
  imagenB: imagenParaGuardarSchema,
  imagenC: imagenParaGuardarSchema,
  imagenD: imagenParaGuardarSchema,
  imagenE: imagenParaGuardarSchema,
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
