import { SectionPlaceholder } from '@/components/shell/section-placeholder'

// TODO Fase 5: reemplazar stub (lista de preguntas propias con filtros y CRUD).
export default async function PreguntasPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string }>
}) {
  const { asignatura } = await searchParams
  return <SectionPlaceholder titulo="Mis Preguntas" asignatura={asignatura} />
}
