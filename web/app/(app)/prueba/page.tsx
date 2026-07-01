import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { cargarDatosGenerador } from '@/lib/queries/pruebas'
import { obtenerColegioPorUsuario } from '@/lib/queries/colegio'
import { imageUrl } from '@/lib/storage/blob'
import { GeneradorPrueba } from '@/components/prueba/generador-prueba'

export default async function PruebaPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string; materia?: string }>
}) {
  const { asignatura } = await searchParams

  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  const [{ preguntas, materias, textos }, colegio] = await Promise.all([
    cargarDatosGenerador(userId, asignatura),
    obtenerColegioPorUsuario(userId),
  ])

  return (
    <GeneradorPrueba
      asignatura={asignatura ?? ''}
      profesorInicial={session.user.name ?? ''}
      preguntas={preguntas}
      materias={materias}
      textos={textos}
      colegioInicial={colegio?.nombre ?? ''}
      logoColegioUrl={colegio?.logo ? imageUrl(colegio.logo) : null}
    />
  )
}
