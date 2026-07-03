import { getSession } from '@/lib/get-session'
import {
  construirPruebaPdf,
  idsDesde,
  nombreArchivo,
  PruebaSinPreguntasError,
} from '@/lib/pdf/construir'

export const runtime = 'nodejs'

/**
 * Genera el PDF de una prueba a partir de una selección de preguntas (y,
 * opcionalmente, textos) del usuario autenticado, más las opciones de
 * encabezado. Responde con `application/pdf` y `Content-Disposition: attachment`
 * para una descarga limpia. Generación puntual (sin persistir); las pruebas
 * guardadas se generan desde `/api/mis-pruebas/[id]/pdf`.
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

  // Logo opcional: sólo se usa el que el usuario suba, y sólo para este PDF (no
  // se guarda ni se toma automáticamente el del colegio).
  const logoEntry = form.get('logo')
  const logo =
    logoEntry instanceof File && logoEntry.size > 0
      ? Buffer.from(await logoEntry.arrayBuffer())
      : null

  let pdf: Buffer
  try {
    pdf = await construirPruebaPdf(userId, {
      asignatura,
      titulo: (form.get('titulo') ?? '').toString(),
      colegio: (form.get('colegio') ?? '').toString(),
      profesor: (form.get('profesor') ?? '').toString(),
      instrucciones: (form.get('instrucciones') ?? '').toString(),
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
