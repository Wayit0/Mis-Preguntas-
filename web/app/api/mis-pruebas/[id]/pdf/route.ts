import { Readable } from 'node:stream'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pruebas } from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'
import {
  deleteBlob,
  getImageStream,
  uploadPdf,
} from '@/lib/storage/blob'
import { cargarPruebaPorId } from '@/lib/queries/pruebas'
import { resolverLogoPrueba } from '@/lib/pdf/logo'
import {
  construirPruebaPdf,
  nombreArchivo,
  PruebaSinPreguntasError,
} from '@/lib/pdf/construir'

export const runtime = 'nodejs'

/** Cabeceras de descarga de un PDF de prueba. */
function cabecerasPdf(asignatura: string): Record<string, string> {
  return {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${nombreArchivo(asignatura)}"`,
    'Cache-Control': 'no-store',
  }
}

/**
 * Descarga el PDF cacheado de una prueba desde el storage (sin regenerar).
 * Requiere sesión y propiedad. 409 si la prueba aún no tiene PDF generado.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return new Response('No autorizado', { status: 401 })
  const userId = Number(session.user.id)

  const { id } = await context.params
  const prueba = await cargarPruebaPorId(Number(id), userId)
  if (!prueba) return new Response('No encontrado', { status: 404 })

  if (!prueba.pdfKey) {
    return new Response('La prueba aún no tiene un PDF generado.', {
      status: 409,
    })
  }

  const blob = await getImageStream(prueba.pdfKey)
  if (!blob) {
    // La clave apunta a un blob inexistente (borrado externo): trátalo como
    // "sin PDF" para que el usuario lo regenere.
    return new Response('El PDF no está disponible. Vuelve a generarlo.', {
      status: 409,
    })
  }

  const body = Readable.toWeb(
    blob.stream as unknown as Readable,
  ) as unknown as ReadableStream<Uint8Array>

  return new Response(body, { headers: cabecerasPdf(prueba.asignatura) })
}

/**
 * Genera (o regenera) el PDF de una prueba: lo construye a partir de la
 * selección guardada, borra el PDF anterior del storage, sube el nuevo, guarda
 * la clave y lo devuelve como descarga inmediata. Requiere sesión y propiedad.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return new Response('No autorizado', { status: 401 })
  const userId = Number(session.user.id)

  const { id } = await context.params
  const prueba = await cargarPruebaPorId(Number(id), userId)
  if (!prueba) return new Response('No encontrado', { status: 404 })

  // Logo: propio de la prueba → si no, el del colegio (si usar_logo_colegio) →
  // si no, sin logo.
  const logo = await resolverLogoPrueba({
    userId,
    customKey: prueba.logo,
    usarLogoColegio: prueba.usarLogoColegio,
  })

  let pdf: Buffer
  try {
    pdf = await construirPruebaPdf(userId, {
      asignatura: prueba.asignatura,
      titulo: prueba.titulo ?? '',
      colegio: prueba.colegio ?? '',
      profesor: prueba.profesor ?? '',
      instrucciones: prueba.instrucciones ?? '',
      formato: prueba.formato,
      formulas: prueba.formulas ?? [],
      preguntasIds: prueba.preguntasIds ?? [],
      textosIds: prueba.textosIds ?? [],
      logo,
    })
  } catch (err) {
    if (err instanceof PruebaSinPreguntasError) {
      return new Response(err.message, { status: 400 })
    }
    console.error('Error al generar la prueba PDF:', err)
    return new Response(
      'No se pudo generar la prueba. Inténtalo de nuevo en unos minutos.',
      { status: 500 },
    )
  }

  // Borrar el PDF anterior (si lo había) y subir el nuevo.
  if (prueba.pdfKey) await deleteBlob(prueba.pdfKey)
  const pdfKey = await uploadPdf(pdf)

  await db
    .update(pruebas)
    .set({ pdfKey, pdfGeneradoEn: new Date() })
    .where(and(eq(pruebas.id, prueba.id), eq(pruebas.userId, userId)))

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: cabecerasPdf(prueba.asignatura),
  })
}
