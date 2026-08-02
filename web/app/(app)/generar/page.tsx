import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { resolverAsignatura } from '@/lib/asignatura'
import { cuotaGeneraciones } from '@/lib/suscripciones/entitlements'
import { listarBorradores } from '@/lib/import/borradores'
import { GenerarPreguntas } from '@/components/generar/generar-preguntas'

export default async function GenerarPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  const asignatura = await resolverAsignatura(userId)
  const cuota = await cuotaGeneraciones(userId)
  const borradores = await listarBorradores(userId, 'generar')

  return (
    <GenerarPreguntas
      asignaturaInicial={asignatura || undefined}
      cuota={{ limite: cuota.limite, restantes: cuota.restantes }}
      borradores={borradores}
    />
  )
}
