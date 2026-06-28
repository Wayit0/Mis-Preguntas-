import { notFound } from 'next/navigation'
import { requireRole, esAdminDeColegio } from '@/lib/authz'
import { cargarPreguntaDeColegio } from '@/lib/queries/colegio'
import { editarPreguntaColegio } from '@/lib/actions/banco-colegio'
import { FormularioPregunta } from '@/components/preguntas/formulario-pregunta'

/**
 * Edición de una pregunta del banco del colegio por un school_admin (o
 * global_admin). El guard se aplica en dos niveles: el rol (requireRole), que el
 * actor administre el colegio (esAdminDeColegio) y que la pregunta pertenezca a
 * un profe de SU colegio (cargarPreguntaDeColegio). La action de guardado
 * (editarPreguntaColegio) reverifica el mismo guard en el servidor.
 */
export default async function EditarPreguntaColegioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ colegio?: string }>
}) {
  const { id } = await params
  const { colegio: colegioParam } = await searchParams

  const actor = await requireRole(['school_admin', 'global_admin'])
  const colegioIdParam = colegioParam ? Number(colegioParam) : NaN
  const colegioId =
    Number.isFinite(colegioIdParam) && actor.role === 'global_admin'
      ? colegioIdParam
      : actor.colegioId

  if (colegioId === null || !esAdminDeColegio(actor, colegioId)) {
    notFound()
  }

  const pregunta = await cargarPreguntaDeColegio(Number(id), colegioId)
  if (!pregunta) notFound()

  return (
    <FormularioPregunta
      pregunta={pregunta}
      asignaturaInicial={pregunta.asignatura}
      accionActualizar={editarPreguntaColegio}
      hrefVolver="/colegio?tab=banco"
    />
  )
}
