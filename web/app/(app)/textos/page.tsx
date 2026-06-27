import { SectionPlaceholder } from '@/components/shell/section-placeholder'

// TODO Fase 5: reemplazar stub (textos de comprensión lectora + preguntas asociadas).
export default async function TextosPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string }>
}) {
  const { asignatura } = await searchParams
  return <SectionPlaceholder titulo="Mis Textos" asignatura={asignatura} />
}
