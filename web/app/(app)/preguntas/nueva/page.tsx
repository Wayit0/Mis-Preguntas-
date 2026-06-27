import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { FormularioPregunta } from '@/components/preguntas/formulario-pregunta'

export default async function NuevaPreguntaPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string }>
}) {
  const { asignatura } = await searchParams
  const session = await getSession()
  if (!session) redirect('/login')

  return <FormularioPregunta asignaturaInicial={asignatura} />
}
