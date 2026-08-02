import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { resolverAsignatura } from '@/lib/asignatura'
import { cuotaImportaciones } from '@/lib/suscripciones/entitlements'
import { listarBorradores } from '@/lib/import/borradores'
import { listarCarpetas } from '@/lib/queries/carpetas'
import { ImportarDocumento } from '@/components/import/importar-documento'

export default async function ImportarPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  // Toma la asignatura activa (cookie / más usada); '' deja elegir en el form.
  const asignatura = await resolverAsignatura(userId)
  const cuota = await cuotaImportaciones(userId)
  const borradores = await listarBorradores(userId)
  const carpetas = await listarCarpetas(userId)

  return (
    <ImportarDocumento
      asignaturaInicial={asignatura || undefined}
      cuota={{ limite: cuota.limite, restantes: cuota.restantes }}
      borradores={borradores}
      carpetas={carpetas}
    />
  )
}
