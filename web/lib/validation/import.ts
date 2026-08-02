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
// (como `input_schema` de la herramienta `entregar_preguntas`, ver
// `lib/ai/import.ts`): un objeto con un arreglo `preguntas`. Cada pregunta
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

/**
 * Máximo de páginas aceptado para un PDF en la importación con IA. La API de
 * Anthropic corta en 100 páginas, pero mucho antes de eso el análisis se hace
 * lento y caro sin que una prueba escolar real lo necesite. Vive aquí (módulo
 * sin dependencias de servidor) para que la UI muestre el mismo número que la
 * action valida.
 */
export const MAX_PAGINAS_PDF = 10

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

/**
 * Recorte propuesto por la IA para la imagen del enunciado, como STRING
 * compacto "x,y,ancho,alto" en PORCENTAJES ENTEROS (0-100) del ancho/alto de
 * la imagen, con origen arriba a la izquierda. Null si la imagen ya muestra
 * sólo la figura relevante. String plano por la misma razón que
 * `imagenesAlternativas`: mantener mínima la complejidad del schema que viaja
 * al modelo. El parseo/validación real lo hace {@link parsearRecorte}; una
 * caja malformada simplemente se ignora (queda la imagen completa).
 */
const recortePropuestoSchema = z.string().nullish()

/** Lado mínimo del recorte, en % de la imagen: filtra cajas degeneradas. */
const LADO_MINIMO_RECORTE_PCT = 5

/** Una caja de recorte ya parseada y validada (porcentajes enteros 0-100). */
export interface CajaRecorte {
  x: number
  y: number
  ancho: number
  alto: number
}

/**
 * Parsea el string compacto "x,y,ancho,alto" a una caja válida, o null si está
 * malformado o es degenerado. Clampea ancho/alto para que la caja quede dentro
 * de la imagen; exige al menos 5% por lado tras el clamp. Nunca lanza: un
 * recorte inválido se ignora en silencio (la imagen queda completa).
 */
export function parsearRecorte(
  valor: string | null | undefined,
): CajaRecorte | null {
  if (!valor) return null
  const partes = valor.split(',').map((p) => p.trim())
  if (partes.length !== 4) return null
  if (!partes.every((p) => /^\d+$/.test(p))) return null
  const [x, y, ancho, alto] = partes.map(Number)
  if (x >= 100 || y >= 100) return null
  const anchoClamp = Math.min(ancho, 100 - x)
  const altoClamp = Math.min(alto, 100 - y)
  if (anchoClamp < LADO_MINIMO_RECORTE_PCT || altoClamp < LADO_MINIMO_RECORTE_PCT) {
    return null
  }
  return { x, y, ancho: anchoClamp, alto: altoClamp }
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
  // Recorte propuesto para la imagen del enunciado ("x,y,ancho,alto" en % de
  // la imagen), cuando ésta contiene más contenido que la figura relevante.
  imagenPreguntaRecorte: recortePropuestoSchema,
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

/**
 * Una pregunta ya post-procesada por `aplicarRecortesIA` (lib/import/recorte):
 * si el recorte propuesto se aplicó, `imagenPreguntaIndice` apunta a la imagen
 * recortada (agregada al final del arreglo) e `imagenPreguntaOriginalIndice`
 * conserva el índice de la original, para que el cliente pueda restaurar o
 * re-recortar sin degradación.
 */
export type PreguntaAnalizada = PreguntaDetectada & {
  imagenPreguntaOriginalIndice?: number | null
}

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
export const imagenObjetoSchema = z.object({
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
  // Clasificación aplicada en la revisión (barra de selección múltiple):
  // carpeta destino (null = sin carpeta) y si queda compartida al guardar.
  carpetaId: z.number().int().nullish(),
  compartida: z.number().int().min(0).max(1).default(0),
})

/** Payload de la confirmación: asignatura + preguntas seleccionadas. */
export const guardarImportSchema = z.object({
  asignatura: z.string().trim().min(1, 'Falta la asignatura'),
  // Quién genera el guardado: /importar o /generar. Estampa `preguntas.origen`.
  origen: z.enum(['importada', 'ia']).default('importada'),
  preguntas: z
    .array(preguntaImportInputSchema)
    .min(1, 'Selecciona al menos una pregunta'),
})

export type PreguntaImportInput = z.infer<typeof preguntaImportInputSchema>
// `z.input` (no `z.infer`): así `origen` queda OPCIONAL para los llamadores
// (el default 'importada' lo aplica el parse dentro de
// `guardarPreguntasImportadas`), y el llamador existente de
// `importar-documento.tsx` (que no envía `origen`) sigue compilando sin cambios.
export type GuardarImportInput = z.input<typeof guardarImportSchema>
/** Forma ya parseada (post-defaults) del payload de guardado. */
export type GuardarImportParsed = z.infer<typeof guardarImportSchema>

// ---------------------------------------------------------------------------
// Borradores de importación: estado editable de la revisión.
// ---------------------------------------------------------------------------

const imagenEditableSchema = imagenObjetoSchema.nullable()

/**
 * Una pregunta tal como vive en el estado editable de la revisión (la forma
 * `PreguntaEditable` del cliente). Es lo que el auto-guardado persiste en
 * `borradores_importacion.edicion` y lo que retomar restaura. Los campos
 * `…Original` guardan la imagen pre-recorte (para re-recortar sin degradar).
 */
export const preguntaEditableBorradorSchema = z.object({
  id: z.string(),
  incluir: z.boolean(),
  pregunta: z.string(),
  A: z.string(),
  B: z.string(),
  C: z.string(),
  D: z.string(),
  E: z.string(),
  correcta: z.string(),
  explicacion: z.string(),
  materia: z.string(),
  nivel: z.string(),
  tipo: z.enum(TIPOS_PREGUNTA_IMPORT),
  imagenPregunta: imagenEditableSchema,
  imagenPreguntaOriginal: imagenEditableSchema,
  imagenA: imagenEditableSchema,
  imagenAOriginal: imagenEditableSchema,
  imagenB: imagenEditableSchema,
  imagenBOriginal: imagenEditableSchema,
  imagenC: imagenEditableSchema,
  imagenCOriginal: imagenEditableSchema,
  imagenD: imagenEditableSchema,
  imagenDOriginal: imagenEditableSchema,
  imagenE: imagenEditableSchema,
  imagenEOriginal: imagenEditableSchema,
  // Clasificación aplicada en la revisión (barra de selección múltiple):
  // carpeta destino (null = sin carpeta) y si queda compartida al guardar.
  carpetaId: z.number().int().nullable().default(null),
  compartida: z.number().int().min(0).max(1).default(0),
})

/** El payload completo del auto-guardado: el arreglo de preguntas editables. */
export const edicionBorradorSchema = z.array(preguntaEditableBorradorSchema)

export type PreguntaEditableBorrador = z.infer<typeof preguntaEditableBorradorSchema>
