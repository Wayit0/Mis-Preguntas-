import { getSession } from '@/lib/get-session'
import { cargarPruebaPorId } from '@/lib/queries/pruebas'
import { resolverLogoPrueba } from '@/lib/pdf/logo'
import {
  construirPruebaDocx,
  nombreArchivoDocx,
  PruebaSinPreguntasError,
} from '@/lib/pdf/construir'

export const runtime = 'nodejs'

/**
 * Genera el .docx de una prueba guardada a partir de su selección actual y lo
 * devuelve como descarga inmediata. A diferencia del PDF, no se cachea en el
 * storage (se regenera en cada descarga) — el docx es pensado para editar en
 * Word, no para reimprimir tal cual, así que no vale la pena la complejidad
 * de invalidar una copia cacheada cada vez que cambia la prueba.
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

  const logo = await resolverLogoPrueba({
    userId,
    customKey: prueba.logo,
    usarLogoColegio: prueba.usarLogoColegio,
  })

  let docx: Buffer
  try {
    docx = await construirPruebaDocx(userId, {
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
      'Content-Disposition': `attachment; filename="${nombreArchivoDocx(prueba.asignatura)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
