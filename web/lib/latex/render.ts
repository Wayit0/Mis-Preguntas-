import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js'
import sharp from 'sharp'

/**
 * Render de expresiones LaTeX a imágenes PNG, equivalente JS de `latex_a_imagen`
 * del MVP en Python (que usaba matplotlib). Aquí el pipeline es:
 *
 *   MathJax (TeX → SVG, paquete TeX completo) → SVG string → sharp → PNG.
 *
 * El texto se renderiza en negro sobre fondo transparente (el PNG no lleva
 * relleno de fondo), pensado para incrustarse luego en el PDF de la prueba.
 *
 * Decisión sobre expresiones inválidas: NO se lanza un error. MathJax, ante
 * TeX malformado, produce un nodo de error (`merror`) con el mensaje en lugar
 * de fallar; ese nodo se rasteriza igual a PNG. Así `latexToPng` SIEMPRE
 * devuelve un Buffer PNG válido (nunca rompe la generación del PDF), replicando
 * el espíritu del MVP, que ante una excepción mostraba el texto crudo en vez de
 * caerse. El único caso en que se lanza es un fallo real de rasterización.
 */

// ── Inicialización única de MathJax (patrón recomendado por la doc) ──────────
// El adaptador "lite" no requiere DOM del navegador, ideal en el servidor.
const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)

const texInput = new TeX({ packages: AllPackages })
// fontCache: 'none' inlina todos los glifos como <path>, de modo que cada SVG
// es autónomo (sin <use>/ids compartidos) y rasteriza bien de forma aislada.
const svgOutput = new SVG({ fontCache: 'none' })
const mathDocument = mathjax.document('', {
  InputJax: texInput,
  OutputJax: svgOutput,
})

/** Tamaño de fuente base en píxeles (1em). El alto del PNG escala con esto. */
const BASE_EM_PX = 16
/** Unidades internas de MathJax por em (el viewBox viene en estas unidades). */
const MATHJAX_UNITS_PER_EM = 1000

export interface LatexToPngOptions {
  /** Multiplicador de resolución (nitidez). Por defecto 2 (apto para impresión). */
  scale?: number
  /** Color del texto (cualquier color CSS). Por defecto negro. */
  color?: string
}

/** PNG de una fórmula junto con sus dimensiones tipográficas (en em). */
export interface LatexPng {
  data: Buffer
  /** Ancho de la fórmula en em (multiplicar por el tamaño de fuente en pt). */
  emWidth: number
  /** Alto de la fórmula en em. */
  emHeight: number
}

/**
 * Convierte una expresión LaTeX en un PNG (texto negro, fondo transparente).
 *
 * @param expr Expresión TeX en modo matemático (sin los `$` delimitadores).
 * @param opts `scale` (resolución) y `color` (color del texto).
 * @returns Buffer con los bytes del PNG (firma `\x89PNG`).
 */
export async function latexToPng(
  expr: string,
  opts: LatexToPngOptions = {},
): Promise<Buffer> {
  return (await latexToPngConDims(expr, opts)).data
}

/**
 * Igual que `latexToPng`, pero devuelve además las dimensiones de la fórmula en
 * em (derivadas del viewBox de MathJax). Con ellas el PDF puede incrustar la
 * fórmula A ESCALA del texto circundante: `widthPt = emWidth * fontSizePt`.
 */
export async function latexToPngConDims(
  expr: string,
  opts: LatexToPngOptions = {},
): Promise<LatexPng> {
  const scale = opts.scale && opts.scale > 0 ? opts.scale : 2
  const color = opts.color ?? '#000000'

  // TeX → SVG (en modo display, como una fórmula centrada).
  const node = mathDocument.convert(expr ?? '', {
    display: true,
    em: BASE_EM_PX,
    ex: BASE_EM_PX / 2,
  })
  let svg = adaptor.innerHTML(node)

  // MathJax usa `currentColor` para trazo/relleno; librsvg (vía sharp) no
  // resuelve `currentColor`, así que lo sustituimos por el color deseado.
  svg = svg.replaceAll('currentColor', color)

  // El SVG trae width/height en unidades `ex`, que librsvg no rasteriza de
  // forma fiable. Calculamos dimensiones en píxeles a partir del viewBox
  // (en unidades MathJax) y fijamos width/height explícitos en px.
  const viewBox = svg.match(/viewBox="([^"]+)"/)
  let pngBufferSvg = svg
  let emWidth = 1
  let emHeight = 1
  if (viewBox) {
    const parts = viewBox[1].split(/\s+/).map(Number)
    const vbWidth = parts[2]
    const vbHeight = parts[3]
    if (Number.isFinite(vbWidth) && Number.isFinite(vbHeight)) {
      emWidth = vbWidth / MATHJAX_UNITS_PER_EM
      emHeight = vbHeight / MATHJAX_UNITS_PER_EM
      const pxPerUnit = (BASE_EM_PX / MATHJAX_UNITS_PER_EM) * scale
      const widthPx = Math.max(1, Math.round(vbWidth * pxPerUnit))
      const heightPx = Math.max(1, Math.round(vbHeight * pxPerUnit))
      pngBufferSvg = svg.replace(
        /width="[^"]*ex"\s+height="[^"]*ex"/,
        `width="${widthPx}" height="${heightPx}"`,
      )
    }
  }

  try {
    const data = await sharp(Buffer.from(pngBufferSvg, 'utf8'), { density: 300 })
      .png()
      .toBuffer()
    return { data, emWidth, emHeight }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `No se pudo rasterizar la fórmula LaTeX a PNG: ${detail}`,
    )
  }
}
