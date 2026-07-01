import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { cargarPruebaPorId, cargarDatosGenerador } from '@/lib/queries/pruebas'
import { GeneradorPrueba } from '@/components/prueba/generador-prueba'

export default async function EditarPruebaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  // Guard de propiedad: cargarPruebaPorId sólo devuelve la prueba si es del
  // usuario. 404 si no existe o no le pertenece.
  const prueba = await cargarPruebaPorId(Number(id), userId)
  if (!prueba) notFound()

  const { preguntas, materias, textos } = await cargarDatosGenerador(
    userId,
    prueba.asignatura,
  )

  return (
    <GeneradorPrueba
      asignatura={prueba.asignatura}
      profesorInicial={session.user.name ?? ''}
      preguntas={preguntas}
      materias={materias}
      textos={textos}
      pruebaInicial={{
        id: prueba.id,
        titulo: prueba.titulo ?? '',
        colegio: prueba.colegio ?? '',
        profesor: prueba.profesor ?? '',
        instrucciones: prueba.instrucciones ?? '',
        formulas: prueba.formulas ?? [],
        preguntasIds: prueba.preguntasIds ?? [],
        textosIds: prueba.textosIds ?? [],
        logo: prueba.logo ?? null,
      }}
    />
  )
}
