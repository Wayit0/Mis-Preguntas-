import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { ImportarDocumento } from '@/components/import/importar-documento'

export default async function ImportarPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string }>
}) {
  const { asignatura } = await searchParams
  const session = await getSession()
  if (!session) redirect('/login')

  return <ImportarDocumento asignaturaInicial={asignatura} />
}
