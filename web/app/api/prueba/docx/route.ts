import { getSession } from '@/lib/get-session'
import { resolverLogoPrueba } from '@/lib/pdf/logo'
import {
  construirPruebaDocx,
  idsDesde,
  nombreArchivoDocx,
  PruebaSinPreguntasError,
} from '@/lib/pdf/construir'

export const runtime = 'nodejs'

/**
 * Genera el .docx de una prueba a partir de una selección de preguntas (y,
 * opcionalmente, textos) del usuario autenticado, más las opciones de
 * encabezado. Mismo payload que `/api/prueba` (PDF); generación puntual sin
 * persistir.
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

  const logoEntry = form.get('logo')
  const customBuffer =
    logoEntry instanceof File && logoEntry.size > 0
      ? Buffer.from(await logoEntry.arrayBuffer())
      : null
  const usarLogoColegio = form.get('usarLogoColegio') !== '0'
  const logo = await resolverLogoPrueba({ userId, customBuffer, usarLogoColegio })

  let docx: Buffer
  try {
    docx = await construirPruebaDocx(userId, {
      asignatura,
      titulo: (form.get('titulo') ?? '').toString(),
      colegio: (form.get('colegio') ?? '').toString(),
      profesor: (form.get('profesor') ?? '').toString(),
      instrucciones: (form.get('instrucciones') ?? '').toString(),
      formato: (form.get('formato') ?? '').toString(),
      formulas: form
        .getAll('formula')
        .map((f) => f.toString())
        .filter((f) => f.trim()),
      preguntasIds: idsDesde(form.getAll('pregunta')),
      textosIds: idsDesde(form.getAll('texto')),
      logo,
    })
  } catch (err) {
    if (err instanceof PruebaSinPreguntasError) {
      return new Response(err.message, { status: 400 })
    }
    console.error('Error al generar la prueba DOCX:', err)
    return new Response(
      'No se pudo generar la prueba. Inténtalo de nuevo en unos minutos.',
      { status: 500 },
    )
  }

  return new Response(new Uint8Array(docx), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${nombreArchivoDocx(asignatura)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
