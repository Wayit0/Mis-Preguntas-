import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlignTable,
  WidthType,
  type ISectionOptions,
} from 'docx'
import { latexToPng } from '@/lib/latex/render'
import {
  chunk,
  lineasDesarrollo,
  prepararImagen,
  prepararPregunta,
  type ImagenPreparada,
  type PerfilAnchos,
  type PreguntaPreparada,
  type SegmentoLinea,
} from '@/lib/pdf/contenido'
import type { PruebaConfig } from '@/lib/pdf/prueba'

/**
 * Generación del .docx de una prueba, alternativa editable al PDF
 * (`lib/pdf/prueba.tsx`). Reusa la preparación de imágenes/fórmulas de
 * `lib/pdf/contenido.ts` (mismo pipeline: descarga de Blob + sharp + MathJax),
 * pero construye un árbol de nodos `docx` en vez de react-pdf.
 *
 * Simplificaciones respecto del PDF (por alcance, no por limitación técnica):
 *  - Un solo estilo visual (no distingue 'estandar' / 'ib').
 *  - El logo del colegio no se incrusta en el encabezado de página.
 *  - No evita que una pregunta se parta entre páginas (Word regenera el
 *    layout de todas formas al editar, a diferencia del PDF que es fijo).
 */

// ── Página y unidades ────────────────────────────────────────────────────────

// Carta (Letter) con márgenes de 1" (1440 twips) por lado.
const PAGE_WIDTH_TWIPS = 12240
const PAGE_HEIGHT_TWIPS = 15840
const MARGIN_TWIPS = 1440
const AREA_UTIL_TWIPS = PAGE_WIDTH_TWIPS - 2 * MARGIN_TWIPS // 9360

// Conversión pt → px asumiendo 96 px/pulgada (igual que el PDF).
const PX_POR_PT = 4 / 3
const AREA_UTIL_PX = AREA_UTIL_TWIPS / 20 / 72 * 96 // 624px (6.5")
const INDENT_ALT_PX = 24 // pt(18) → px

const ANCHO_IMG_ENUNCIADO_PX: Record<string, number> = {
  chico: 240,
  mediano: 427,
  grande: AREA_UTIL_PX,
}
const ANCHO_IMG_ALTERNATIVA_PX: Record<string, number> = {
  chico: 173,
  mediano: 320,
  grande: AREA_UTIL_PX - INDENT_ALT_PX,
}

const FONT_ENUNCIADO_PT = 11
const FONT_ALTERNATIVA_PT = 10
const FONT_ENUNCIADO_HALF = FONT_ENUNCIADO_PT * 2 // TextRun.size está en medios-puntos
const FONT_ALTERNATIVA_HALF = FONT_ALTERNATIVA_PT * 2

const PERFIL_DOCX: PerfilAnchos = {
  anchoImgEnunciado: ANCHO_IMG_ENUNCIADO_PX,
  anchoImgAlternativa: ANCHO_IMG_ALTERNATIVA_PX,
  areaUtil: AREA_UTIL_PX,
  indentAlt: INDENT_ALT_PX,
  maxHEnunciado: 400,
  maxHAlternativa: 320,
  fontEnunciado: FONT_ENUNCIADO_PT * PX_POR_PT,
  fontAlternativa: FONT_ALTERNATIVA_PT * PX_POR_PT,
}

const MAX_W_FORMULA_PX = 213
const MAX_H_FORMULA_PX = 32

const INDENT_ALT_TWIPS = 360 // ~0.25" de sangría para las alternativas

function imagenRun(img: ImagenPreparada): ImageRun {
  return new ImageRun({
    type: 'png',
    data: img.data,
    transformation: { width: img.width, height: img.height },
  })
}

/** Convierte los segmentos texto/fórmula (o el texto plano) en runs de Word. */
function segmentosARuns(
  segmentos: SegmentoLinea[] | null,
  textoPlano: string,
  opts: { bold?: boolean; sizeHalfPt: number },
): (TextRun | ImageRun)[] {
  if (!segmentos) {
    return [new TextRun({ text: textoPlano, bold: opts.bold, size: opts.sizeHalfPt })]
  }
  return segmentos.map((seg) =>
    seg.tipo === 'formula'
      ? imagenRun(seg.img)
      : new TextRun({ text: seg.valor, bold: opts.bold, size: opts.sizeHalfPt }),
  )
}

/** Párrafos de una pregunta (enunciado, imagen, alternativas o líneas de desarrollo). */
function preguntaParrafos(p: PreguntaPreparada): Paragraph[] {
  const parrafos: Paragraph[] = []

  // spacing.after mayor que el de cada alternativa (más abajo): el enunciado
  // se separa más de las alternativas que lo que se separan entre sí.
  parrafos.push(
    new Paragraph({
      spacing: { before: 240, after: 200 },
      children: [
        new TextRun({ text: `${p.numero}. `, bold: true, size: FONT_ENUNCIADO_HALF }),
        ...segmentosARuns(p.enunciadoSegmentos, p.enunciado, {
          sizeHalfPt: FONT_ENUNCIADO_HALF,
        }),
      ],
    }),
  )

  if (p.imagenEnunciado) {
    parrafos.push(
      new Paragraph({ spacing: { after: 200 }, children: [imagenRun(p.imagenEnunciado)] }),
    )
  }

  const lineas = lineasDesarrollo(p.tipo)
  if (lineas > 0) {
    for (let i = 0; i < lineas; i++) {
      parrafos.push(
        new Paragraph({
          spacing: { before: 280 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999' } },
          children: [],
        }),
      )
    }
    return parrafos
  }

  for (const alt of p.alternativas) {
    parrafos.push(
      new Paragraph({
        indent: { left: INDENT_ALT_TWIPS },
        spacing: { after: 60 },
        children: [
          new TextRun({ text: `${alt.letra}) `, bold: true, size: FONT_ALTERNATIVA_HALF }),
          ...segmentosARuns(alt.segmentos, alt.texto, { sizeHalfPt: FONT_ALTERNATIVA_HALF }),
        ],
      }),
    )
    if (alt.imagen) {
      parrafos.push(
        new Paragraph({
          indent: { left: INDENT_ALT_TWIPS },
          spacing: { after: 120 },
          children: [imagenRun(alt.imagen)],
        }),
      )
    }
  }

  return parrafos
}

/** Fila "Nombre: ___ Curso: ___ Fecha: ___" con rayas que llenan el ancho de la hoja. */
function filaIdentificacion(): Table {
  const SIN_BORDE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const
  const RAYA = { style: BorderStyle.SINGLE, size: 6, color: '000000' } as const

  function celdaLabel(texto: string, anchoTwips: number): TableCell {
    return new TableCell({
      width: { size: anchoTwips, type: WidthType.DXA },
      verticalAlign: VerticalAlignTable.BOTTOM,
      borders: { top: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE, bottom: SIN_BORDE },
      children: [
        new Paragraph({ children: [new TextRun({ text: texto, size: FONT_ENUNCIADO_HALF })] }),
      ],
    })
  }

  function celdaLinea(anchoTwips: number): TableCell {
    return new TableCell({
      width: { size: anchoTwips, type: WidthType.DXA },
      verticalAlign: VerticalAlignTable.BOTTOM,
      borders: { top: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE, bottom: RAYA },
      children: [new Paragraph({ children: [new TextRun({ text: '', size: FONT_ENUNCIADO_HALF })] })],
    })
  }

  const anchos = {
    nombreLabel: 950,
    nombreLinea: 2700,
    cursoLabel: 750,
    cursoLinea: 1700,
    fechaLabel: 750,
    fechaLinea: 2510,
  }

  return new Table({
    width: { size: AREA_UTIL_TWIPS, type: WidthType.DXA },
    columnWidths: Object.values(anchos),
    borders: {
      top: SIN_BORDE,
      bottom: SIN_BORDE,
      left: SIN_BORDE,
      right: SIN_BORDE,
      insideHorizontal: SIN_BORDE,
      insideVertical: SIN_BORDE,
    },
    rows: [
      new TableRow({
        children: [
          celdaLabel('Nombre:', anchos.nombreLabel),
          celdaLinea(anchos.nombreLinea),
          celdaLabel('Curso:', anchos.cursoLabel),
          celdaLinea(anchos.cursoLinea),
          celdaLabel('Fecha:', anchos.fechaLabel),
          celdaLinea(anchos.fechaLinea),
        ],
      }),
    ],
  })
}

/** Tabla del formulario: 3 celdas con borde por fila, fórmula centrada en cada una. */
function tablaFormulario(formulas: ImagenPreparada[]): Table {
  const BORDE = { style: BorderStyle.SINGLE, size: 6, color: '000000' } as const
  const anchoCelda = Math.floor(AREA_UTIL_TWIPS / 3)

  function celda(img: ImagenPreparada | undefined): TableCell {
    return new TableCell({
      width: { size: anchoCelda, type: WidthType.DXA },
      borders: { top: BORDE, left: BORDE, right: BORDE, bottom: BORDE },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: img ? [imagenRun(img)] : [],
        }),
      ],
    })
  }

  return new Table({
    width: { size: AREA_UTIL_TWIPS, type: WidthType.DXA },
    columnWidths: [anchoCelda, anchoCelda, anchoCelda],
    rows: chunk(formulas, 3).map(
      (fila) => new TableRow({ children: [celda(fila[0]), celda(fila[1]), celda(fila[2])] }),
    ),
  })
}

/** Encabezado repetido en cada página: colegio, profesor y asignatura/título. */
function encabezado(colegio: string, profesor: string, asignatura: string, titulo: string): Header {
  return new Header({
    children: [
      new Paragraph({ children: [new TextRun({ text: colegio, bold: true, size: 20 })] }),
      new Paragraph({
        children: [new TextRun({ text: `Profesor/a: ${profesor}`, size: 20 })],
      }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } },
        spacing: { after: 120 },
        children: [
          new TextRun({ text: `${asignatura} | ${titulo || 'Prueba'}`, size: 20 }),
        ],
      }),
    ],
  })
}

/**
 * Genera el .docx de la prueba a partir de la configuración (mismo
 * `PruebaConfig` que `generarPruebaPdf`). Prepara imágenes y fórmulas de forma
 * asíncrona y arma el documento con `Packer.toBuffer`.
 */
export async function generarPruebaDocx(config: PruebaConfig): Promise<Buffer> {
  const titulo = (config.titulo ?? '').toString()
  const asignatura = config.asignatura
  const colegio = (config.colegio ?? '').toString()
  const profesor = (config.profesor ?? '').toString()
  const instrucciones = (config.instrucciones ?? '').toString()

  // Fórmulas del formulario: LaTeX → PNG.
  const formulasInput = (config.formulas ?? []).filter((f) => f && f.trim())
  const formulas: ImagenPreparada[] = []
  for (const expr of formulasInput) {
    try {
      const png = await latexToPng(expr)
      const prep = await prepararImagen(png, MAX_W_FORMULA_PX, MAX_H_FORMULA_PX)
      if (prep) formulas.push(prep)
    } catch {
      // Una fórmula que falla no debe romper la prueba completa.
    }
  }

  // Numeración correlativa: primero las preguntas de cada texto, luego sueltas
  // (mismo criterio que `generarPruebaPdf`).
  const textos = config.textos ?? []
  const preguntas = config.preguntas ?? []

  let contador = 1
  const grupos: { titulo: string; contenido: string; preguntas: PreguntaPreparada[] }[] = []
  const idsAgrupadas = new Set<number>()

  for (const texto of textos) {
    if (texto.id == null) continue
    const delTexto = preguntas.filter((p) => p.texto_id === texto.id)
    const preparadas: PreguntaPreparada[] = []
    for (const p of delTexto) {
      preparadas.push(await prepararPregunta(p, contador++, PERFIL_DOCX))
    }
    grupos.push({ titulo: texto.titulo, contenido: texto.contenido, preguntas: preparadas })
    delTexto.forEach((p) => {
      const idx = preguntas.indexOf(p)
      idsAgrupadas.add(idx)
    })
  }

  const sueltas: PreguntaPreparada[] = []
  for (let i = 0; i < preguntas.length; i++) {
    if (idsAgrupadas.has(i)) continue
    sueltas.push(await prepararPregunta(preguntas[i], contador++, PERFIL_DOCX))
  }

  // ── Armado del documento ──
  const children: (Paragraph | Table)[] = []

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [new TextRun({ text: titulo || 'Prueba', bold: true, size: 36 })],
    }),
  )

  children.push(filaIdentificacion())
  children.push(new Paragraph({ spacing: { after: 240 }, children: [] }))

  if (instrucciones.trim()) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: 'Instrucciones', bold: true, size: 20 })],
      }),
    )
    // Sin spacing.after: mismo espaciado entre líneas que un texto corrido,
    // no un salto de párrafo.
    for (const linea of instrucciones.split('\n')) {
      children.push(new Paragraph({ children: [new TextRun({ text: linea, size: 20 })] }))
    }
  }

  if (formulas.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: 'Formulario', bold: true, size: 20 })],
      }),
    )
    children.push(tablaFormulario(formulas))
    children.push(new Paragraph({ spacing: { after: 120 }, children: [] }))
  }

  for (const g of grupos) {
    children.push(
      new Paragraph({
        spacing: { before: 240, after: 60 },
        children: [new TextRun({ text: g.titulo, bold: true, size: FONT_ENUNCIADO_HALF })],
      }),
    )
    for (const linea of g.contenido.split('\n')) {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: linea, size: FONT_ALTERNATIVA_HALF })],
        }),
      )
    }
    for (const p of g.preguntas) {
      children.push(...preguntaParrafos(p))
    }
  }

  for (const p of sueltas) {
    children.push(...preguntaParrafos(p))
  }

  const section: ISectionOptions = {
    properties: {
      page: {
        size: { width: PAGE_WIDTH_TWIPS, height: PAGE_HEIGHT_TWIPS },
        margin: { top: MARGIN_TWIPS, bottom: MARGIN_TWIPS, left: MARGIN_TWIPS, right: MARGIN_TWIPS },
      },
    },
    headers: { default: encabezado(colegio, profesor, asignatura, titulo) },
    children,
  }

  const doc = new Document({ title: titulo || 'Prueba', sections: [section] })
  return Packer.toBuffer(doc)
}
