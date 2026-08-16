import { FormularioUnirse } from '@/components/estudiante/formulario-unirse'
import { rutaSegura } from '@/lib/safe-redirect'

export default async function UnirsePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return <FormularioUnirse next={rutaSegura(next)} />
}
