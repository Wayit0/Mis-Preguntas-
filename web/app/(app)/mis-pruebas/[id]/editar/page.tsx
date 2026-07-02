import { notFound, redirect } from 'next/navigation'
import { getActor } from '@/lib/authz'
import { cargarPruebaPorId, cargarDatosGenerador } from '@/lib/queries/pruebas'
import { obtenerColegioPorUsuario } from '@/lib/queries/colegio'
import { imageUrl } from '@/lib/storage/blob'
import { GeneradorPrueba } from '@/components/prueba/generador-prueba'

export default async function EditarPruebaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const actor = await getActor()
  if (!actor) redirect('/login')
  const userId = actor.userId

  const prueba = await cargarPruebaPorId(Number(id), userId)
  if (!prueba) notFound()

  const [{ preguntas, materias, textos }, colegio] = await Promise.all([
    cargarDatosGenerador(userId, prueba.asignatura),
    obtenerColegioPorUsuario(userId),
  ])

  return (
    <GeneradorPrueba
      asignatura={prueba.asignatura}
      profesorInicial={actor.nombre}
      preguntas={preguntas}
      materias={materias}
      textos={textos}
      colegioInicial={colegio?.nombre ?? prueba.colegio ?? ''}
      logoColegioUrl={colegio?.logo ? imageUrl(colegio.logo) : null}
      pruebaInicial={{
        id: prueba.id,
        titulo: prueba.titulo ?? '',
        colegio: prueba.colegio ?? '',
        profesor: prueba.profesor ?? '',
        instrucciones: prueba.instrucciones ?? '',
        formulas: prueba.formulas ?? [],
        preguntasIds: prueba.preguntasIds ?? [],
        textosIds: prueba.textosIds ?? [],
      }}
    />
  )
}
