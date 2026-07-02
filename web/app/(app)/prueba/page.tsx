import { redirect } from 'next/navigation'
import { getActor } from '@/lib/authz'
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

  const actor = await getActor()
  if (!actor) redirect('/login')
  const userId = actor.userId

  const [{ preguntas, materias, textos }, colegio] = await Promise.all([
    cargarDatosGenerador(userId, asignatura),
    obtenerColegioPorUsuario(userId),
  ])

  const esAdmin = actor.role === 'school_admin' || actor.role === 'global_admin'

  return (
    <GeneradorPrueba
      asignatura={asignatura ?? ''}
      profesorInicial={actor.nombre}
      preguntas={preguntas}
      materias={materias}
      textos={textos}
      colegioInicial={colegio?.nombre ?? ''}
      logoColegioUrl={colegio?.logo ? imageUrl(colegio.logo) : null}
      esAdmin={esAdmin}
    />
  )
}
