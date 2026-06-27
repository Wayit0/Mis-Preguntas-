import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { cargarPreguntaPorId } from '@/lib/queries/preguntas'
import { FormularioPregunta } from '@/components/preguntas/formulario-pregunta'

export default async function EditarPreguntaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  // Guard de propiedad: cargarPreguntaPorId sólo devuelve la pregunta si es del
  // usuario. 404 si no existe o no le pertenece.
  const pregunta = await cargarPreguntaPorId(Number(id), userId)
  if (!pregunta) notFound()

  return (
    <FormularioPregunta
      pregunta={pregunta}
      asignaturaInicial={pregunta.asignatura}
    />
  )
}
