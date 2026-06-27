import { SectionPlaceholder } from '@/components/shell/section-placeholder'

// TODO Fase 6: reemplazar stub (selección de preguntas y generación de PDF).
export default async function PruebaPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string }>
}) {
  const { asignatura } = await searchParams
  return <SectionPlaceholder titulo="Crear Prueba" asignatura={asignatura} />
}
