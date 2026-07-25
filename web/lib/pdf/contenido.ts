import sharp from 'sharp'
import { latexToPngConDims } from '@/lib/latex/render'
import { getImageStream } from '@/lib/storage/blob'

/**
 * Preparación de contenido de una prueba (imágenes descargadas/rasterizadas y
 * fórmulas LaTeX renderizadas), compartida entre los dos generadores de
 * documento: `lib/pdf/prueba.tsx` (react-pdf) y `lib/docx/prueba.ts` (Word).
 * Cada generador define sus propias unidades y anchos objetivo (un
 * `PerfilAnchos`); esta capa sólo descarga/escala imágenes y divide texto con
 * fórmulas — nunca construye el árbol de nodos del documento final.
 */

// ── Tipos de configuración ───────────────────────────────────────────────────

/** Letras de alternativa, en orden. */
export const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const
export type Letra = (typeof LETRAS)[number]

/** Una pregunta tal como la consume el generador de PDF/DOCX. */
export interface PreguntaPdf {
  enunciado: string
  tipo?: string | null
  A?: string | null
  B?: string | null
  C?: string | null
  D?: string | null
  E?: string | null
  correcta?: string | null
  explicacion?: string | null
  imagen_pregunta?: string | null
  imagen_A?: string | null
  imagen_B?: string | null
  imagen_C?: string | null
  imagen_D?: string | null
  imagen_E?: string | null
  /** Tamaño de las imágenes en el documento: 'chico' | 'mediano' | 'grande'. */
  imagen_tamano?: string | null
  /** Si pertenece a un texto de comprensión, su id (para agruparla). */
  texto_id?: number | null
}

/** Un texto de comprensión a incluir, seguido de sus preguntas. */
export interface TextoPdf {
  id?: number | null
  titulo: string
  contenido: string
}

// ── Preparación de imágenes (async, antes del render) ────────────────────────

export interface ImagenPreparada {
  data: Buffer
  width: number
  height: number
}

/**
 * Convierte un Buffer de imagen a PNG y calcula sus dimensiones, limitando el
 * ancho a `maxWidth` y el alto a `maxHeight` (preservando proporción). Las
 * unidades (pt para el PDF, px para el DOCX) las decide el llamador — esta
 * función sólo escala numéricamente. Devuelve `null` si la imagen no se puede
 * leer.
 */
export async function prepararImagen(
  buffer: Buffer,
  maxWidth: number,
  maxHeight?: number,
): Promise<ImagenPreparada | null> {
  try {
    const meta = await sharp(buffer).metadata()
    const iw = meta.width ?? 0
    const ih = meta.height ?? 0
    if (!iw || !ih) return null
    // Normalizamos todo a PNG (cubre webp/gif; react-pdf y docx sólo soportan
    // PNG/JPG de forma confiable).
    const data = meta.format === 'png' ? buffer : await sharp(buffer).png().toBuffer()
    // Siempre escala al ancho objetivo (ignora el tamaño guardado del archivo)
    // para que la imagen cubra el ancho completo del texto en el documento.
    let width = maxWidth
    let height = width * (ih / iw)
    // Si hay límite de alto (imagen muy alta), escalar por alto manteniendo proporción.
    if (maxHeight && height > maxHeight) {
      height = maxHeight
      width = height * (iw / ih)
    }
    return { data, width, height }
  } catch {
    return null
  }
}

/** Descarga un blob por su clave y lo prepara como imagen, o `null`. */
export async function prepararImagenBlob(
  clave: string | null | undefined,
  maxWidth: number,
  maxHeight?: number,
): Promise<ImagenPreparada | null> {
  if (!clave || !clave.trim()) return null
  try {
    const img = await getImageStream(clave)
    if (!img) return null
    const chunks: Buffer[] = []
    for await (const chunk of img.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return prepararImagen(Buffer.concat(chunks), maxWidth, maxHeight)
  } catch {
    return null
  }
}

/**
 * Un tramo de una línea de texto: texto plano o una fórmula LaTeX ya
 * rasterizada a PNG con dimensiones a escala del texto circundante.
 */
export type SegmentoLinea =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'formula'; img: ImagenPreparada }

/** Mismo patrón que `LatexText` en pantalla: `$...$` inline y `$$...$$` bloque. */
const REGEX_LATEX = /(\$\$[^$]+\$\$|\$[^$]+\$)/g

/**
 * Divide un texto con fórmulas `$...$` en segmentos renderizables. Devuelve
 * `null` si el texto no contiene ninguna fórmula válida (el llamador usa
 * entonces el texto plano, el camino común). Una fórmula que no rasteriza se
 * deja como texto crudo, igual que el resto de la prueba: nunca rompe la
 * generación. `fontSize` y `maxWidth` van en la misma unidad que use el
 * llamador (pt en el PDF, px en el DOCX).
 */
export async function prepararSegmentos(
  texto: string,
  fontSize: number,
  maxWidth: number,
): Promise<SegmentoLinea[] | null> {
  if (!texto.includes('$')) return null
  const partes = texto.split(REGEX_LATEX)
  if (partes.length <= 1) return null

  const segmentos: SegmentoLinea[] = []
  let hayFormula = false
  for (const parte of partes) {
    if (!parte) continue
    const esBloque = parte.startsWith('$$') && parte.endsWith('$$') && parte.length > 4
    const esInline =
      !esBloque && parte.startsWith('$') && parte.endsWith('$') && parte.length > 2
    if (esBloque || esInline) {
      const expr = parte.slice(esBloque ? 2 : 1, esBloque ? -2 : -1)
      try {
        const png = await latexToPngConDims(expr)
        // A escala del texto: 1em = tamaño de fuente. Cap al ancho útil.
        let width = png.emWidth * fontSize
        let height = png.emHeight * fontSize
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
        segmentos.push({ tipo: 'formula', img: { data: png.data, width, height } })
        hayFormula = true
        continue
      } catch {
        // Cae al texto crudo de abajo.
      }
    }
    segmentos.push({ tipo: 'texto', valor: parte })
  }
  return hayFormula ? segmentos : null
}

/** Una pregunta con sus imágenes ya preparadas y su número correlativo. */
export interface PreguntaPreparada {
  numero: number
  enunciado: string
  /** Segmentos texto/fórmula del enunciado, o null si no hay LaTeX. */
  enunciadoSegmentos: SegmentoLinea[] | null
  tipo: string
  alternativas: {
    letra: Letra
    texto: string
    /** Segmentos texto/fórmula de la alternativa, o null si no hay LaTeX. */
    segmentos: SegmentoLinea[] | null
    imagen: ImagenPreparada | null
  }[]
  imagenEnunciado: ImagenPreparada | null
}

/**
 * Anchos/altos objetivo para las imágenes y fórmulas de una pregunta, en la
 * unidad que use el generador (pt en el PDF, px en el DOCX). Cada generador
 * define el suyo — así el layout de uno no condiciona el del otro.
 */
export interface PerfilAnchos {
  /** Ancho de la imagen del enunciado según `imagen_tamano` (chico/mediano/grande). */
  anchoImgEnunciado: Record<string, number>
  /** Ancho de la imagen de una alternativa según `imagen_tamano`. */
  anchoImgAlternativa: Record<string, number>
  /** Ancho útil disponible (para acotar el ancho de imagen al área real). */
  areaUtil: number
  /** Sangría de las alternativas (se descuenta del ancho útil). */
  indentAlt: number
  maxHEnunciado: number
  maxHAlternativa: number
  fontEnunciado: number
  fontAlternativa: number
}

/** Normaliza el tamaño guardado (default 'mediano' si falta o es desconocido). */
function anchoImagen(tabla: Record<string, number>, tamano?: string | null): number {
  return tabla[tamano ?? ''] ?? tabla.mediano
}

function alternativaTieneContenido(texto: string, img: ImagenPreparada | null): boolean {
  return Boolean((texto && texto.trim()) || img)
}

/** Agrupa un array en sub-arrays de tamaño `n`. */
export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export async function prepararPregunta(
  p: PreguntaPdf,
  numero: number,
  perfil: PerfilAnchos,
): Promise<PreguntaPreparada> {
  const tipo = p.tipo || 'seleccion_multiple'
  const { areaUtil, indentAlt } = perfil
  const imagenEnunciado = await prepararImagenBlob(
    p.imagen_pregunta,
    Math.min(anchoImagen(perfil.anchoImgEnunciado, p.imagen_tamano), areaUtil),
    perfil.maxHEnunciado,
  )

  const alternativas: PreguntaPreparada['alternativas'] = []
  if (tipo === 'seleccion_multiple') {
    for (const letra of LETRAS) {
      const texto = (p[letra] ?? '').toString()
      const claveImg = p[`imagen_${letra}` as keyof PreguntaPdf] as
        | string
        | null
        | undefined
      const imagen = await prepararImagenBlob(
        claveImg,
        Math.min(anchoImagen(perfil.anchoImgAlternativa, p.imagen_tamano), areaUtil - indentAlt),
        perfil.maxHAlternativa,
      )
      if (alternativaTieneContenido(texto, imagen)) {
        const segmentos = await prepararSegmentos(
          texto,
          perfil.fontAlternativa,
          areaUtil - indentAlt,
        )
        alternativas.push({ letra, texto, segmentos, imagen })
      }
    }
  }

  return {
    numero,
    enunciado: p.enunciado,
    enunciadoSegmentos: await prepararSegmentos(p.enunciado, perfil.fontEnunciado, areaUtil),
    tipo,
    alternativas,
    imagenEnunciado,
  }
}

/** Número de líneas en blanco para una pregunta de desarrollo. */
export function lineasDesarrollo(tipo: string): number {
  if (tipo === 'desarrollo_corto') return 2
  if (tipo === 'desarrollo_largo') return 6
  return 0
}
