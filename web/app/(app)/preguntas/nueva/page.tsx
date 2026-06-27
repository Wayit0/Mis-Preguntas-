import { SectionPlaceholder } from '@/components/shell/section-placeholder'

// TODO Fase 5: reemplazar stub (formulario de creación de pregunta).
export default async function NuevaPreguntaPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string }>
}) {
  const { asignatura } = await searchParams
  return <SectionPlaceholder titulo="Agregar Pregunta" asignatura={asignatura} />
}
