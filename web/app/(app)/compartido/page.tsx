import { SectionPlaceholder } from '@/components/shell/section-placeholder'

// TODO Fase 5: reemplazar stub (banco compartido por colaboradores).
export default async function CompartidoPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string }>
}) {
  const { asignatura } = await searchParams
  return <SectionPlaceholder titulo="Banco Compartido" asignatura={asignatura} />
}
