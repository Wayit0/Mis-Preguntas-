import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { resolverAsignatura } from '@/lib/asignatura'
import { ImportarDocumento } from '@/components/import/importar-documento'

export default async function ImportarPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  // Toma la asignatura activa (cookie / más usada); '' deja elegir en el form.
  const asignatura = await resolverAsignatura(userId)

  return <ImportarDocumento asignaturaInicial={asignatura || undefined} />
}
