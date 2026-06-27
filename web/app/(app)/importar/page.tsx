import { SectionPlaceholder } from '@/components/shell/section-placeholder'

// TODO Fase 7: reemplazar stub (importación de documentos con detección por IA).
export default async function ImportarPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string }>
}) {
  const { asignatura } = await searchParams
  return <SectionPlaceholder titulo="Importar Documento" asignatura={asignatura} />
}
