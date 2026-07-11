import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
  type TextProps,
} from '@react-pdf/renderer'
import sharp from 'sharp'
import { latexToPng, latexToPngConDims } from '@/lib/latex/render'
import { getImageStream } from '@/lib/storage/blob'

/**
 * Generación del PDF de una prueba con react-pdf, réplica del MVP
 * (`generar_pdf` / `dibujar_header` / `pdf_imagen` / `agregar_pregunta_pdf` en
 * app.py). El documento incluye:
 *
 *  - Encabezado fijo en cada página: logo + colegio + profesor + asignatura/título.
 *  - Línea de identificación (Nombre / Curso / Fecha).
 *  - Instrucciones (opcional).
 *  - Formulario: fórmulas LaTeX renderizadas a PNG (vía `latexToPng`).
 *  - Textos de comprensión (opcional) seguidos de sus preguntas asociadas.
 *  - Preguntas numeradas correlativamente, con imágenes (descargadas de Blob),
 *    alternativas A–E etiquetadas, o líneas en blanco para los tipos de
 *    desarrollo (corto = 2 líneas, largo = 6 líneas).
 *
 * Las imágenes (logo, fórmulas, enunciados y alternativas) se preparan de forma
 * asíncrona ANTES de construir el árbol de react-pdf: se descargan/rasterizan a
 * PNG con `sharp` y se calculan sus dimensiones en puntos. Así el render del
 * documento es síncrono y `renderToBuffer` produce un Buffer PDF.
 */

// ── Tipos de configuración ───────────────────────────────────────────────────

/** Letras de alternativa, en orden. */
const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const
type Letra = (typeof LETRAS)[number]

/** Una pregunta tal como la consume el generador de PDF. */
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
  /** Tamaño de las imágenes en el PDF: 'chico' | 'mediano' | 'grande'. */
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

/** Configuración completa de la prueba a generar. */
export interface PruebaConfig {
  titulo?: string | null
  asignatura: string
  colegio?: string | null
  profesor?: string | null
  /** Bytes del logo (PNG/JPG/etc.); opcional. */
  logo?: Buffer | Uint8Array | null
  instrucciones?: string | null
  /** Formato del documento: 'estandar' (default) | 'ib'. */
  formato?: string | null
  /** Expresiones LaTeX (sin los `$` delimitadores). */
  formulas?: string[] | null
  /** Textos de comprensión a incluir (cada uno con sus preguntas). */
  textos?: TextoPdf[] | null
  /** Preguntas seleccionadas. */
  preguntas: PreguntaPdf[]
}

// ── Preparación de imágenes (async, antes del render) ────────────────────────

interface ImagenPreparada {
  data: Buffer
  width: number
  height: number
}

/** Puntos por píxel asumiendo 96 px/pulgada (px → pt = px * 72/96). */
const PT_POR_PX = 72 / 96

/**
 * Convierte un Buffer de imagen a PNG y calcula sus dimensiones en puntos,
 * limitando el ancho a `maxWidthPt` y el alto a `maxHeightPt` (preservando
 * proporción). Devuelve `null` si la imagen no se puede leer.
 */
async function prepararImagen(
  buffer: Buffer,
  maxWidthPt: number,
  maxHeightPt?: number,
): Promise<ImagenPreparada | null> {
  try {
    const meta = await sharp(buffer).metadata()
    const iw = meta.width ?? 0
    const ih = meta.height ?? 0
    if (!iw || !ih) return null
    // react-pdf solo soporta PNG/JPG; normalizamos todo a PNG (cubre webp/gif).
    const data = meta.format === 'png' ? buffer : await sharp(buffer).png().toBuffer()
    // Siempre escala al ancho objetivo (ignora el tamaño guardado del archivo)
    // para que la imagen cubra el ancho completo del texto en el PDF.
    let width = maxWidthPt
    let height = width * (ih / iw)
    // Si hay límite de alto (imagen muy alta), escalar por alto manteniendo proporción.
    if (maxHeightPt && height > maxHeightPt) {
      height = maxHeightPt
      width = height * (iw / ih)
    }
    return { data, width, height }
  } catch {
    return null
  }
}

/** Descarga un blob por su clave y lo prepara como imagen, o `null`. */
async function prepararImagenBlob(
  clave: string | null | undefined,
  maxWidthPt: number,
  maxHeightPt?: number,
): Promise<ImagenPreparada | null> {
  if (!clave || !clave.trim()) return null
  try {
    const img = await getImageStream(clave)
    if (!img) return null
    const chunks: Buffer[] = []
    for await (const chunk of img.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return prepararImagen(Buffer.concat(chunks), maxWidthPt, maxHeightPt)
  } catch {
    return null
  }
}

/**
 * Un tramo de una línea de texto: texto plano o una fórmula LaTeX ya
 * rasterizada a PNG con dimensiones a escala del texto circundante.
 */
type SegmentoLinea =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'formula'; img: ImagenPreparada }

/** Mismo patrón que `LatexText` en pantalla: `$...$` inline y `$$...$$` bloque. */
const REGEX_LATEX = /(\$\$[^$]+\$\$|\$[^$]+\$)/g

/**
 * Divide un texto con fórmulas `$...$` en segmentos renderizables en el PDF.
 * Devuelve `null` si el texto no contiene ninguna fórmula válida (el llamador
 * usa entonces un `<Text>` plano, el camino común). Una fórmula que no
 * rasteriza se deja como texto crudo, igual que el resto de la prueba: nunca
 * rompe la generación.
 */
async function prepararSegmentos(
  texto: string,
  fontSizePt: number,
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
        let width = png.emWidth * fontSizePt
        let height = png.emHeight * fontSizePt
        if (width > MAX_W_ALTERNATIVA) {
          height = (height * MAX_W_ALTERNATIVA) / width
          width = MAX_W_ALTERNATIVA
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
interface PreguntaPreparada {
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

// Página LETTER (612pt) con paddingHorizontal 50pt → área útil = 512pt.
const AREA_UTIL         = 512           // pt — ancho del contenido
const INDENT_ALT        = 18           // pt — marginLeft de las alternativas
const MAX_W_ENUNCIADO   = AREA_UTIL                  // imagen ocupa todo el ancho
const MAX_W_ALTERNATIVA = AREA_UTIL - INDENT_ALT     // igual pero descontando sangría
const MAX_W_FORMULA     = 160          // pt — ancho de cada fórmula (3 caben por fila)
const MAX_H_FORMULA     = 24           // pt — alto máximo (fuente 24)
const MAX_W_LOGO        = 38            // alto objetivo; ancho se deriva de la proporción
const MAX_H_ENUNCIADO   = 300           // pt — proporcional al ancho completo (16:9 ≈ 288pt)
const MAX_H_ALTERNATIVA = 240           // pt

// Ancho objetivo de las imágenes según el tamaño elegido en la pregunta
// (`preguntas.imagen_tamano`). 'mediano' es el estándar: legible sin ocupar la
// página entera; 'grande' conserva el comportamiento histórico (ancho completo).
const ANCHO_IMG_ENUNCIADO: Record<string, number> = {
  chico: 180,
  mediano: 320,
  grande: MAX_W_ENUNCIADO,
}
const ANCHO_IMG_ALTERNATIVA: Record<string, number> = {
  chico: 130,
  mediano: 240,
  grande: MAX_W_ALTERNATIVA,
}

/** Normaliza el tamaño guardado (default 'mediano' si falta o es desconocido). */
function anchoImagen(tabla: Record<string, number>, tamano?: string | null): number {
  return tabla[tamano ?? ''] ?? tabla.mediano
}

// Tamaños de fuente (pt) del enunciado y las alternativas; también dimensionan
// las fórmulas LaTeX inline (1em de fórmula = tamaño de fuente del texto).
const FONT_ENUNCIADO   = 11
const FONT_ALTERNATIVA = 10

/** Agrupa un array en sub-arrays de tamaño `n`. */
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function alternativaTieneContenido(texto: string, img: ImagenPreparada | null): boolean {
  return Boolean((texto && texto.trim()) || img)
}

async function prepararPregunta(
  p: PreguntaPdf,
  numero: number,
  areaUtil: number,
): Promise<PreguntaPreparada> {
  const tipo = p.tipo || 'seleccion_multiple'
  // El área útil depende del formato (A4 es más angosto que LETTER): las
  // tablas de anchos están pensadas para LETTER, así que se recortan al área.
  const imagenEnunciado = await prepararImagenBlob(
    p.imagen_pregunta,
    Math.min(anchoImagen(ANCHO_IMG_ENUNCIADO, p.imagen_tamano), areaUtil),
    MAX_H_ENUNCIADO,
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
        Math.min(
          anchoImagen(ANCHO_IMG_ALTERNATIVA, p.imagen_tamano),
          areaUtil - INDENT_ALT,
        ),
        MAX_H_ALTERNATIVA,
      )
      if (alternativaTieneContenido(texto, imagen)) {
        const segmentos = await prepararSegmentos(texto, FONT_ALTERNATIVA)
        alternativas.push({ letra, texto, segmentos, imagen })
      }
    }
  }

  return {
    numero,
    enunciado: p.enunciado,
    enunciadoSegmentos: await prepararSegmentos(p.enunciado, FONT_ENUNCIADO),
    tipo,
    alternativas,
    imagenEnunciado,
  }
}

// ── Formatos y estilos ───────────────────────────────────────────────────────

/**
 * Parámetros visuales de un formato de prueba. El 'estandar' replica el layout
 * histórico (LETTER, Helvetica); el 'ib' imita el estilo de un examen de
 * Bachillerato Internacional: A4, tipografía serif (Times), título centrado,
 * instrucciones en una caja con borde y líneas de respuesta punteadas.
 */
interface OpcionesFormato {
  pageSize: 'LETTER' | 'A4'
  fuente: string
  fuenteNegrita: string
  /** Ancho útil del contenido (ancho de página − 2×50pt de margen). */
  areaUtil: number
  /** Rótulo de alternativa: "A)" en estándar, "A." en IB. */
  etiquetaAlternativa: (letra: string) => string
  tituloCentrado: boolean
  instruccionesEnCaja: boolean
  tituloInstrucciones: string
  lineaPunteada: boolean
}

const FORMATO_ESTANDAR: OpcionesFormato = {
  pageSize: 'LETTER',
  fuente: 'Helvetica',
  fuenteNegrita: 'Helvetica-Bold',
  areaUtil: AREA_UTIL,
  etiquetaAlternativa: (l) => `${l})`,
  tituloCentrado: false,
  instruccionesEnCaja: false,
  tituloInstrucciones: 'Instrucciones',
  lineaPunteada: false,
}

// A4 = 595.28pt de ancho; con márgenes de 50pt el área útil queda en ~495pt.
const FORMATO_IB: OpcionesFormato = {
  pageSize: 'A4',
  fuente: 'Times-Roman',
  fuenteNegrita: 'Times-Bold',
  areaUtil: 495,
  etiquetaAlternativa: (l) => `${l}.`,
  tituloCentrado: true,
  instruccionesEnCaja: true,
  tituloInstrucciones: 'INSTRUCCIONES PARA LOS ALUMNOS',
  lineaPunteada: true,
}

function resolverFormato(formato?: string | null): OpcionesFormato {
  return formato === 'ib' ? FORMATO_IB : FORMATO_ESTANDAR
}

function crearEstilos(fmt: OpcionesFormato) {
  return StyleSheet.create({
    page: {
      paddingTop: 96,
      paddingBottom: 52,
      paddingHorizontal: 50,
      fontFamily: fmt.fuente,
      fontSize: 11,
      lineHeight: 1.4,
      color: '#1a1a1a',
    },
    header: {
      position: 'absolute',
      top: 28,
      left: 50,
      right: 50,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: '#cccccc',
      paddingBottom: 6,
    },
    headerLogo: { marginRight: 10 },
    headerColegio: { fontFamily: fmt.fuenteNegrita, fontSize: 10 },
    headerLinea: { fontSize: 10 },
    titulo: {
      fontFamily: fmt.fuenteNegrita,
      fontSize: 18,
      marginBottom: 10,
      textAlign: fmt.tituloCentrado ? 'center' : 'left',
    },
    identif: { fontSize: 11, marginBottom: 12 },
    seccion: {
      fontFamily: fmt.fuenteNegrita,
      fontSize: 10,
      marginTop: 8,
      marginBottom: 4,
    },
    // La caja de instrucciones estilo IB envuelve título y líneas.
    instruccionesCaja: fmt.instruccionesEnCaja
      ? {
          borderWidth: 1,
          borderColor: '#333333',
          paddingHorizontal: 12,
          paddingVertical: 8,
          marginBottom: 12,
        }
      : {},
    instruc: { fontSize: 10, marginBottom: 8, flexShrink: 1 },
    formulaFila: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 6,
    },
    formulaImg: { marginLeft: 4, marginRight: 4 },
    textoTitulo: {
      fontFamily: fmt.fuenteNegrita,
      fontSize: 11,
      marginTop: 12,
      marginBottom: 4,
      flexShrink: 1,
    },
    textoBody: { fontSize: 10, marginBottom: 8, flexShrink: 1 },
    preguntaBloque: { marginBottom: 8 },
    // Fila número + enunciado: flex:1 en el texto garantiza ancho completo en react-pdf
    preguntaFila: { flexDirection: 'row', marginTop: 12, marginBottom: 3 },
    preguntaNumero: { fontFamily: fmt.fuenteNegrita, fontSize: 11, marginRight: 3 },
    preguntaEnunciado: { fontFamily: fmt.fuenteNegrita, fontSize: 11, flex: 1 },
    // Estilos de palabra suelta dentro de TextoConFormulas (sin flex: cada
    // palabra es un <Text> propio dentro del View row+wrap).
    palabraEnunciado: { fontFamily: fmt.fuenteNegrita, fontSize: 11 },
    palabraAlternativa: { fontSize: 10 },
    imagenPregunta: { marginTop: 4, marginBottom: 6 },
    // Fila letra + texto de alternativa
    alternativaFila: { flexDirection: 'row', marginLeft: 18, marginBottom: 3 },
    alternativaLetra: { fontFamily: fmt.fuenteNegrita, fontSize: 10, marginRight: 3 },
    alternativaTexto: { fontSize: 10, flex: 1 },
    imagenAlternativa: { marginLeft: 18, marginTop: 2, marginBottom: 6 },
    lineaRespuesta: {
      borderBottomWidth: 1,
      borderBottomColor: fmt.lineaPunteada ? '#555555' : '#999999',
      borderStyle: fmt.lineaPunteada ? 'dotted' : 'solid',
      marginTop: fmt.lineaPunteada ? 18 : 14,
    },
  })
}

type EstilosPrueba = ReturnType<typeof crearEstilos>

const ESTILOS: Record<'estandar' | 'ib', EstilosPrueba> = {
  estandar: crearEstilos(FORMATO_ESTANDAR),
  ib: crearEstilos(FORMATO_IB),
}

// ── Componentes ──────────────────────────────────────────────────────────────

function ImagenPdf({
  img,
  style,
}: {
  img: ImagenPreparada
  style?: object
}) {
  return (
    <Image
      src={{ data: img.data, format: 'png' }}
      style={{ width: img.width, height: img.height, ...style }}
    />
  )
}

function lineasDesarrollo(tipo: string): number {
  if (tipo === 'desarrollo_corto') return 2
  if (tipo === 'desarrollo_largo') return 6
  return 0
}

/**
 * Línea de texto con fórmulas intercaladas. react-pdf no soporta imágenes
 * inline dentro de <Text>, así que se emula el flujo con un View row+wrap:
 * cada palabra va en su propio <Text> (para que el conjunto haga wrap) y cada
 * fórmula como <Image> centrada verticalmente respecto de la línea.
 */
function TextoConFormulas({
  segmentos,
  estilo,
}: {
  segmentos: SegmentoLinea[]
  estilo: TextProps['style']
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        flex: 1,
      }}
    >
      {segmentos.flatMap((seg, i) => {
        if (seg.tipo === 'formula') {
          return [
            <ImagenPdf
              key={`f-${i}`}
              img={seg.img}
              style={{ marginHorizontal: 1 }}
            />,
          ]
        }
        // Conservar los espacios como separadores: cada palabra lleva su
        // espacio siguiente, así el wrap se produce entre palabras.
        return seg.valor
          .split(/\s+/)
          .filter((w) => w.length > 0)
          .map((w, j) => (
            <Text key={`t-${i}-${j}`} style={estilo}>
              {w}{' '}
            </Text>
          ))
      })}
    </View>
  )
}

function BloquePregunta({
  p,
  est,
  fmt,
}: {
  p: PreguntaPreparada
  est: EstilosPrueba
  fmt: OpcionesFormato
}) {
  const lineas = lineasDesarrollo(p.tipo)
  return (
    <View style={est.preguntaBloque}>
      {/* Ancla el ancho del contenedor antes de cualquier texto. Sin esto,
          yoga-layout calcula el ancho por contenido intrínseco (~350pt) en
          vez de estirarse al ancho de la página. Un hijo con ancho
          explícito como primer elemento fuerza el ancho correcto. */}
      <View style={{ width: fmt.areaUtil, height: 0 }} />
      <View style={est.preguntaFila}>
        <Text style={est.preguntaNumero}>{p.numero}.</Text>
        {p.enunciadoSegmentos ? (
          <TextoConFormulas
            segmentos={p.enunciadoSegmentos}
            estilo={est.palabraEnunciado}
          />
        ) : (
          <Text style={est.preguntaEnunciado}>{p.enunciado}</Text>
        )}
      </View>
      {p.imagenEnunciado ? (
        <ImagenPdf img={p.imagenEnunciado} style={est.imagenPregunta} />
      ) : null}
      {lineas > 0 ? (
        Array.from({ length: lineas }).map((_, i) => (
          <View key={i} style={est.lineaRespuesta} />
        ))
      ) : (
        p.alternativas.map((alt) => (
          <View key={alt.letra}>
            <View style={est.alternativaFila}>
              <Text style={est.alternativaLetra}>
                {fmt.etiquetaAlternativa(alt.letra)}
              </Text>
              {alt.segmentos ? (
                <TextoConFormulas
                  segmentos={alt.segmentos}
                  estilo={est.palabraAlternativa}
                />
              ) : (
                <Text style={est.alternativaTexto}>{alt.texto}</Text>
              )}
            </View>
            {alt.imagen ? (
              <ImagenPdf img={alt.imagen} style={est.imagenAlternativa} />
            ) : null}
          </View>
        ))
      )}
    </View>
  )
}

interface DocumentoProps {
  titulo: string
  asignatura: string
  colegio: string
  profesor: string
  instrucciones: string
  /** Formato visual del documento ('estandar' | 'ib'). */
  fmt: OpcionesFormato
  est: EstilosPrueba
  logo: ImagenPreparada | null
  formulas: ImagenPreparada[]
  /** Grupos de texto con sus preguntas ya preparadas. */
  grupos: { texto: TextoPdf; preguntas: PreguntaPreparada[] }[]
  sueltas: PreguntaPreparada[]
}

function PruebaDocument(props: DocumentoProps) {
  const {
    titulo,
    asignatura,
    colegio,
    profesor,
    instrucciones,
    fmt,
    est,
    logo,
    formulas,
    grupos,
    sueltas,
  } = props

  const bloqueInstrucciones = instrucciones.trim() ? (
    <View style={est.instruccionesCaja}>
      <Text style={est.seccion}>{fmt.tituloInstrucciones}</Text>
      {instrucciones.split('\n').map((linea, i) => (
        <Text key={i} style={est.instruc}>
          {linea}
        </Text>
      ))}
    </View>
  ) : null

  return (
    <Document title={titulo || 'Prueba'}>
      <Page size={fmt.pageSize} style={est.page}>
        <View style={est.header} fixed>
          {logo ? <ImagenPdf img={logo} style={est.headerLogo} /> : null}
          <View>
            <Text style={est.headerColegio}>{colegio}</Text>
            <Text style={est.headerLinea}>Profesor/a: {profesor}</Text>
            <Text style={est.headerLinea}>
              {asignatura} | {titulo || 'Prueba'}
            </Text>
          </View>
        </View>

        <Text style={est.titulo}>{titulo || 'Prueba'}</Text>
        <Text style={est.identif}>
          Nombre: _______________________ Curso: _________ Fecha: _________
        </Text>

        {bloqueInstrucciones}

        {formulas.length > 0 ? (
          <>
            <Text style={est.seccion}>Formulario</Text>
            {chunk(formulas, 3).map((fila, ri) => (
              <View key={ri} style={est.formulaFila}>
                {fila.map((f, fi) => (
                  <ImagenPdf key={fi} img={f} style={est.formulaImg} />
                ))}
              </View>
            ))}
          </>
        ) : null}

        {grupos.map((g, gi) => (
          // Sin View envolvente: todos los elementos son hijos directos de la
          // página para que hereden su ancho igual que las preguntas
          // sueltas. Un View intermedio puede perder el contexto de ancho en
          // react-pdf v4 y truncar el texto de las preguntas.
          <React.Fragment key={gi}>
            <Text style={est.textoTitulo}>{g.texto.titulo}</Text>
            {g.texto.contenido.split('\n').map((linea, i) => (
              <Text key={i} style={est.textoBody}>
                {linea}
              </Text>
            ))}
            {g.preguntas.map((p) => (
              <BloquePregunta key={p.numero} p={p} est={est} fmt={fmt} />
            ))}
          </React.Fragment>
        ))}

        {sueltas.map((p) => (
          <BloquePregunta key={p.numero} p={p} est={est} fmt={fmt} />
        ))}
      </Page>
    </Document>
  )
}

// ── Entrada pública ──────────────────────────────────────────────────────────

/**
 * Genera el PDF de la prueba a partir de la configuración. Prepara todas las
 * imágenes (logo, fórmulas LaTeX, enunciados y alternativas) de forma asíncrona
 * y luego rasteriza el documento react-pdf a un Buffer.
 */
export async function generarPruebaPdf(config: PruebaConfig): Promise<Buffer> {
  const titulo = (config.titulo ?? '').toString()
  const asignatura = config.asignatura
  const colegio = (config.colegio ?? '').toString()
  const profesor = (config.profesor ?? '').toString()
  const instrucciones = (config.instrucciones ?? '').toString()
  const fmt = resolverFormato(config.formato)
  const est = fmt === FORMATO_IB ? ESTILOS.ib : ESTILOS.estandar

  // Logo (opcional).
  const logo = config.logo
    ? await prepararImagen(Buffer.from(config.logo), MAX_W_LOGO * 3)
    : null
  // El logo se limita por alto en el header; recortamos el ancho a una caja
  // razonable manteniendo proporción.
  const logoAjustado = logo ? ajustarLogo(logo) : null

  // Fórmulas: LaTeX → PNG.
  const formulasInput = (config.formulas ?? []).filter((f) => f && f.trim())
  const formulas: ImagenPreparada[] = []
  for (const expr of formulasInput) {
    try {
      const png = await latexToPng(expr)
      const prep = await prepararImagen(png, MAX_W_FORMULA, MAX_H_FORMULA)
      if (prep) formulas.push(prep)
    } catch {
      // Una fórmula que falla no debe romper la prueba completa.
    }
  }

  // Numeración correlativa: primero las preguntas de cada texto, luego sueltas.
  const textos = config.textos ?? []
  const preguntas = config.preguntas ?? []

  let contador = 1
  const grupos: { texto: TextoPdf; preguntas: PreguntaPreparada[] }[] = []
  const idsAgrupadas = new Set<number>()

  for (const texto of textos) {
    if (texto.id == null) continue
    const delTexto = preguntas.filter((p) => p.texto_id === texto.id)
    // Se incluye el texto aunque no tenga preguntas (se muestra el texto solo).
    const preparadas: PreguntaPreparada[] = []
    for (const p of delTexto) {
      preparadas.push(await prepararPregunta(p, contador++, fmt.areaUtil))
    }
    grupos.push({ texto, preguntas: preparadas })
    // Marcar por índice para excluir de "sueltas".
    delTexto.forEach((p) => {
      const idx = preguntas.indexOf(p)
      idsAgrupadas.add(idx)
    })
  }

  const sueltas: PreguntaPreparada[] = []
  for (let i = 0; i < preguntas.length; i++) {
    if (idsAgrupadas.has(i)) continue
    sueltas.push(await prepararPregunta(preguntas[i], contador++, fmt.areaUtil))
  }

  return renderToBuffer(
    <PruebaDocument
      titulo={titulo}
      asignatura={asignatura}
      colegio={colegio}
      profesor={profesor}
      instrucciones={instrucciones}
      fmt={fmt}
      est={est}
      logo={logoAjustado}
      formulas={formulas}
      grupos={grupos}
      sueltas={sueltas}
    />,
  )
}

/** Recorta el logo a una altura fija (~38pt) conservando proporción. */
function ajustarLogo(img: ImagenPreparada): ImagenPreparada {
  const alturaObjetivo = MAX_W_LOGO
  const ratio = img.width / img.height
  return {
    data: img.data,
    height: alturaObjetivo,
    width: alturaObjetivo * ratio,
  }
}
