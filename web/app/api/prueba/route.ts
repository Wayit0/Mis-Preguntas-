import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  colegios,
  preguntas as tablaPreguntas,
  textos as tablaTextos,
  usuarios,
} from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'
import { getImageStream, uploadImage } from '@/lib/storage/blob'
import {
  generarPruebaPdf,
  type PreguntaPdf,
  type TextoPdf,
} from '@/lib/pdf/prueba'

export const runtime = 'nodejs'

/** Convierte una lista de valores de FormData a ids numéricos válidos y únicos. */
function idsDesde(values: FormDataEntryValue[]): number[] {
  const out = new Set<number>()
  for (const v of values) {
    const n = Number(v)
    if (Number.isInteger(n) && n > 0) out.add(n)
  }
  return [...out]
}

/** Mapea una fila de la tabla `preguntas` a la forma que consume el generador. */
function aPreguntaPdf(fila: typeof tablaPreguntas.$inferSelect): PreguntaPdf {
  return {
    enunciado: fila.pregunta,
    tipo: fila.tipo,
    A: fila.A,
    B: fila.B,
    C: fila.C,
    D: fila.D,
    E: fila.E,
    correcta: fila.correcta,
    explicacion: fila.explicacion,
    imagen_pregunta: fila.imagenPregunta,
    imagen_A: fila.imagenA,
    imagen_B: fila.imagenB,
    imagen_C: fila.imagenC,
    imagen_D: fila.imagenD,
    imagen_E: fila.imagenE,
    texto_id: fila.textoId,
  }
}

/** Nombre de archivo seguro para la descarga (sin acentos ni caracteres raros). */
function nombreArchivo(asignatura: string): string {
  const base = asignatura
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `prueba_${base || 'general'}.pdf`
}

/**
 * Genera el PDF de una prueba a partir de una selección de preguntas (y,
 * opcionalmente, textos) del usuario autenticado, más las opciones de
 * encabezado. Responde con `application/pdf` y `Content-Disposition: attachment`
 * para una descarga limpia.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return new Response('No autorizado', { status: 401 })
  }
  const userId = Number(session.user.id)

  const form = await request.formData()

  const asignatura = (form.get('asignatura') ?? '').toString().trim()
  if (!asignatura) {
    return new Response('Falta la asignatura', { status: 400 })
  }

  const titulo = (form.get('titulo') ?? '').toString()
  const colegio = (form.get('colegio') ?? '').toString()
  const profesor = (form.get('profesor') ?? '').toString()
  const instrucciones = (form.get('instrucciones') ?? '').toString()
  const formulas = form
    .getAll('formula')
    .map((f) => f.toString())
    .filter((f) => f.trim())

  const idsPreguntas = idsDesde(form.getAll('pregunta'))
  const idsTextos = idsDesde(form.getAll('texto'))

  // Datos del colegio del usuario (para logo automático y auto-guardado).
  const [filaUsuario] = await db
    .select({ colegioId: usuarios.colegioId, role: usuarios.role })
    .from(usuarios)
    .where(eq(usuarios.id, userId))
    .limit(1)
  const userColegioId = filaUsuario?.colegioId ?? null
  const userRole = filaUsuario?.role ?? 'teacher'

  // Logo: si el usuario sube uno, se usa ese; si no, se carga el del colegio.
  const logoEntry = form.get('logo')
  let logo: Buffer | null = null
  if (logoEntry instanceof File && logoEntry.size > 0) {
    logo = Buffer.from(await logoEntry.arrayBuffer())
    // Auto-guardar el logo al colegio si el usuario es school_admin.
    if (userColegioId && (userRole === 'school_admin' || userRole === 'global_admin')) {
      try {
        const key = await uploadImage(logoEntry)
        await db.update(colegios).set({ logo: key }).where(eq(colegios.id, userColegioId))
      } catch {
        // El guardado falla silenciosamente; el PDF igual se genera.
      }
    }
  } else if (userColegioId) {
    // Sin logo subido: intentar usar el logo guardado del colegio.
    const [filaColegio] = await db
      .select({ logo: colegios.logo })
      .from(colegios)
      .where(eq(colegios.id, userColegioId))
      .limit(1)
    if (filaColegio?.logo) {
      const img = await getImageStream(filaColegio.logo)
      if (img) {
        const chunks: Buffer[] = []
        for await (const chunk of img.stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        logo = Buffer.concat(chunks)
      }
    }
  }

  // Textos seleccionados (propios) y sus preguntas asociadas (propias).
  const textosPdf: TextoPdf[] = []
  const preguntasDeTextos: PreguntaPdf[] = []
  const idsEnTextos = new Set<number>()

  if (idsTextos.length > 0) {
    const filasTextos = await db
      .select()
      .from(tablaTextos)
      .where(and(eq(tablaTextos.userId, userId), inArray(tablaTextos.id, idsTextos)))

    // Respetar el orden de selección recibido.
    const porId = new Map(filasTextos.map((t) => [t.id, t]))
    for (const tid of idsTextos) {
      const t = porId.get(tid)
      if (!t) continue
      const filasPreg = await db
        .select()
        .from(tablaPreguntas)
        .where(
          and(eq(tablaPreguntas.userId, userId), eq(tablaPreguntas.textoId, t.id)),
        )
        .orderBy(tablaPreguntas.id)
      if (filasPreg.length === 0) continue
      textosPdf.push({ id: t.id, titulo: t.titulo, contenido: t.contenido })
      for (const fp of filasPreg) {
        preguntasDeTextos.push(aPreguntaPdf(fp))
        idsEnTextos.add(fp.id)
      }
    }
  }

  // Preguntas sueltas seleccionadas (propias), excluyendo las ya incluidas vía
  // un texto seleccionado.
  const preguntasSueltas: PreguntaPdf[] = []
  if (idsPreguntas.length > 0) {
    const filas = await db
      .select()
      .from(tablaPreguntas)
      .where(
        and(eq(tablaPreguntas.userId, userId), inArray(tablaPreguntas.id, idsPreguntas)),
      )
      .orderBy(tablaPreguntas.id)
    // Respetar el orden de selección recibido.
    const porId = new Map(filas.map((p) => [p.id, p]))
    for (const pid of idsPreguntas) {
      const p = porId.get(pid)
      if (!p || idsEnTextos.has(p.id)) continue
      preguntasSueltas.push(aPreguntaPdf(p))
    }
  }

  if (preguntasDeTextos.length === 0 && preguntasSueltas.length === 0) {
    return new Response('Selecciona al menos una pregunta o un texto.', {
      status: 400,
    })
  }

  let pdf: Buffer
  try {
    pdf = await generarPruebaPdf({
      titulo,
      asignatura,
      colegio,
      profesor,
      logo,
      instrucciones,
      formulas,
      textos: textosPdf,
      // Orden: primero las de textos (agrupadas), luego las sueltas.
      preguntas: [...preguntasDeTextos, ...preguntasSueltas],
    })
  } catch (err) {
    console.error('Error al generar la prueba PDF:', err)
    return new Response(
      'No se pudo generar la prueba. Inténtalo de nuevo en unos minutos.',
      { status: 500 },
    )
  }

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombreArchivo(asignatura)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
