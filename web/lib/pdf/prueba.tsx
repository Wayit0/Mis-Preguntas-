import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import sharp from 'sharp'
import { latexToPng } from '@/lib/latex/render'
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
    const naturalPt = iw * PT_POR_PX
    let width = Math.min(maxWidthPt, naturalPt)
    let height = width * (ih / iw)
    // Si hay límite de alto y la imagen es demasiado alta, escalar por alto.
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

/** Una pregunta con sus imágenes ya preparadas y su número correlativo. */
interface PreguntaPreparada {
  numero: number
  enunciado: string
  tipo: string
  alternativas: { letra: Letra; texto: string; imagen: ImagenPreparada | null }[]
  imagenEnunciado: ImagenPreparada | null
}

// Página LETTER con padding 50pt c/lado → área útil = 512pt.
const MAX_W_ENUNCIADO   = 15 * 28.3465  // 15 cm ≈ 425pt — casi todo el ancho útil
const MAX_W_ALTERNATIVA =  8 * 28.3465  // 8 cm ≈ 227pt
const MAX_W_FORMULA     = 10 * 28.3465
const MAX_W_LOGO        = 38            // alto objetivo; ancho se deriva de la proporción
const MAX_H_ENUNCIADO   = 200           // pt — evita imágenes enormes en el enunciado
const MAX_H_ALTERNATIVA = 160           // pt

function alternativaTieneContenido(texto: string, img: ImagenPreparada | null): boolean {
  return Boolean((texto && texto.trim()) || img)
}

async function prepararPregunta(
  p: PreguntaPdf,
  numero: number,
): Promise<PreguntaPreparada> {
  const tipo = p.tipo || 'seleccion_multiple'
  const imagenEnunciado = await prepararImagenBlob(p.imagen_pregunta, MAX_W_ENUNCIADO, MAX_H_ENUNCIADO)

  const alternativas: PreguntaPreparada['alternativas'] = []
  if (tipo === 'seleccion_multiple') {
    for (const letra of LETRAS) {
      const texto = (p[letra] ?? '').toString()
      const claveImg = p[`imagen_${letra}` as keyof PreguntaPdf] as
        | string
        | null
        | undefined
      const imagen = await prepararImagenBlob(claveImg, MAX_W_ALTERNATIVA, MAX_H_ALTERNATIVA)
      if (alternativaTieneContenido(texto, imagen)) {
        alternativas.push({ letra, texto, imagen })
      }
    }
  }

  return {
    numero,
    enunciado: p.enunciado,
    tipo,
    alternativas,
    imagenEnunciado,
  }
}

// ── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    paddingTop: 96,
    paddingBottom: 52,
    paddingHorizontal: 50,
    fontFamily: 'Times-Roman',
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
  headerColegio: { fontFamily: 'Times-Bold', fontSize: 10 },
  headerLinea: { fontSize: 10 },
  titulo: {
    fontFamily: 'Times-Bold',
    fontSize: 15,
    marginBottom: 10,
  },
  identif: { fontSize: 11, marginBottom: 12 },
  seccion: {
    fontFamily: 'Times-Bold',
    fontSize: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  instruc: { fontSize: 10, marginBottom: 8 },
  formulaImg: { marginBottom: 6 },
  textoTitulo: {
    fontFamily: 'Times-Bold',
    fontSize: 11,
    marginTop: 12,
    marginBottom: 4,
  },
  textoBody: { fontSize: 10, marginBottom: 8 },
  preguntaBloque: { marginBottom: 8 },
  preguntaNum: {
    fontFamily: 'Times-Bold',
    fontSize: 11,
    marginTop: 12,
    marginBottom: 3,
  },
  imagenPregunta: { marginTop: 6, marginBottom: 8, alignSelf: 'flex-start' },
  alternativa: { fontSize: 10, marginLeft: 18, marginBottom: 3 },
  imagenAlternativa: { marginLeft: 18, marginTop: 2, marginBottom: 6, alignSelf: 'flex-start' },
  lineaRespuesta: {
    borderBottomWidth: 1,
    borderBottomColor: '#999999',
    marginTop: 14,
  },
})

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

function BloquePregunta({ p }: { p: PreguntaPreparada }) {
  const lineas = lineasDesarrollo(p.tipo)
  return (
    <View style={styles.preguntaBloque}>
      {/* Número + enunciado + imagen del enunciado: se mantienen juntos */}
      <View wrap={false}>
        <Text style={styles.preguntaNum}>
          {p.numero}. {p.enunciado}
        </Text>
        {p.imagenEnunciado ? (
          <ImagenPdf img={p.imagenEnunciado} style={styles.imagenPregunta} />
        ) : null}
      </View>

      {/* Alternativas o líneas de desarrollo */}
      {lineas > 0 ? (
        Array.from({ length: lineas }).map((_, i) => (
          <View key={i} style={styles.lineaRespuesta} wrap={false} />
        ))
      ) : (
        p.alternativas.map((alt) => (
          <View key={alt.letra} wrap={false}>
            <Text style={styles.alternativa}>
              <Text style={{ fontFamily: 'Times-Bold' }}>{alt.letra})</Text>{' '}
              {alt.texto}
            </Text>
            {alt.imagen ? (
              <ImagenPdf img={alt.imagen} style={styles.imagenAlternativa} />
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
    logo,
    formulas,
    grupos,
    sueltas,
  } = props

  return (
    <Document title={titulo || 'Prueba'}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header} fixed>
          {logo ? <ImagenPdf img={logo} style={styles.headerLogo} /> : null}
          <View>
            <Text style={styles.headerColegio}>{colegio}</Text>
            <Text style={styles.headerLinea}>Profesor/a: {profesor}</Text>
            <Text style={styles.headerLinea}>
              {asignatura} | {titulo || 'Prueba'}
            </Text>
          </View>
        </View>

        <Text style={styles.titulo}>{titulo || 'Prueba'}</Text>
        <Text style={styles.identif}>
          Nombre: _______________________ Curso: _________ Fecha: _________
        </Text>

        {instrucciones.trim() ? (
          <>
            <Text style={styles.seccion}>Instrucciones</Text>
            {instrucciones.split('\n').map((linea, i) => (
              <Text key={i} style={styles.instruc}>
                {linea}
              </Text>
            ))}
          </>
        ) : null}

        {formulas.length > 0 ? (
          <>
            <Text style={styles.seccion}>Formulario</Text>
            {formulas.map((f, i) => (
              <ImagenPdf key={i} img={f} style={styles.formulaImg} />
            ))}
          </>
        ) : null}

        {grupos.map((g, gi) => (
          <View key={gi}>
            <Text style={styles.textoTitulo}>{g.texto.titulo}</Text>
            {g.texto.contenido.split('\n').map((linea, i) => (
              <Text key={i} style={styles.textoBody}>
                {linea}
              </Text>
            ))}
            {g.preguntas.map((p) => (
              <BloquePregunta key={p.numero} p={p} />
            ))}
          </View>
        ))}

        {sueltas.map((p) => (
          <BloquePregunta key={p.numero} p={p} />
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
      const prep = await prepararImagen(png, MAX_W_FORMULA)
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
    if (delTexto.length === 0) continue
    const preparadas: PreguntaPreparada[] = []
    for (const p of delTexto) {
      preparadas.push(await prepararPregunta(p, contador++))
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
    sueltas.push(await prepararPregunta(preguntas[i], contador++))
  }

  return renderToBuffer(
    <PruebaDocument
      titulo={titulo}
      asignatura={asignatura}
      colegio={colegio}
      profesor={profesor}
      instrucciones={instrucciones}
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
