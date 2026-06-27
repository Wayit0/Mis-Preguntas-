import { SectionPlaceholder } from '@/components/shell/section-placeholder'

// TODO Fase 5: reemplazar stub (gestión de colaboradores por email).
export default async function ColaboradoresPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string }>
}) {
  const { asignatura } = await searchParams
  return <SectionPlaceholder titulo="Colaboradores" asignatura={asignatura} />
}
