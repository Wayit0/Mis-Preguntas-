import Link from 'next/link'
import { requireActor } from '@/lib/authz'
import { invitacionesPendientesPorEmail } from '@/lib/queries/colegio'
import { ChangePasswordForm } from '@/components/auth/change-password-form'
import { UnirseColegio } from '@/components/colegio/unirse-colegio'
import { CrearColegio } from '@/components/colegio/crear-colegio'
import { planEfectivo, cuotaImportaciones } from '@/lib/suscripciones/entitlements'
import { reconciliarMiSuscripcion } from '@/lib/actions/suscripciones'
import { mpHabilitado } from '@/lib/suscripciones/mercadopago'
import { PlanCuenta } from '@/components/cuenta/plan-cuenta'

// Página de cuenta. Además del cambio de contraseña, ofrece a los profesores
// SIN colegio el punto de entrada para unirse (por código o invitación), y
// muestra el estado del plan/suscripción de EduBox Pro.
export default async function CuentaPage({
  searchParams,
}: {
  searchParams: Promise<{ suscripcion?: string }>
}) {
  const actor = await requireActor()
  const { suscripcion: retorno } = await searchParams

  // Solo los profesores sin colegio ven el bloque de unión (un global_admin no
  // pertenece a un colegio por diseño, así que se excluye).
  const mostrarUnirse =
    actor.colegioId === null && actor.role !== 'global_admin'
  const invitaciones = mostrarUnirse
    ? await invitacionesPendientesPorEmail(actor.email)
    : []

  // Red de seguridad: al volver del checkout de MP (?suscripcion=retorno) o si
  // quedó una fila 'pendiente', re-consultar MP antes de renderizar.
  const previo = await planEfectivo(actor.userId)
  if (retorno === 'retorno' || previo.suscripcion?.estado === 'pendiente') {
    await reconciliarMiSuscripcion()
  }
  const plan = await planEfectivo(actor.userId)
  const cuota = await cuotaImportaciones(actor.userId)
  const s = plan.suscripcion
  const datosPlan = {
    plan: plan.plan,
    origen: plan.origen,
    estado: s?.estado ?? null,
    periodicidad: s?.periodicidad ?? null,
    periodoHasta: s?.periodoHasta?.toISOString() ?? null,
    trialTerminaEl: s?.trialTerminaEl?.toISOString() ?? null,
    cuota: { limite: cuota.limite, usadas: cuota.usadas, restantes: cuota.restantes },
    pagosHabilitados: mpHabilitado(),
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <PlanCuenta datos={datosPlan} />

      {mostrarUnirse ? (
        <>
          <UnirseColegio invitaciones={invitaciones} />
          <CrearColegio />
        </>
      ) : null}

      <ChangePasswordForm />
      <Link
        href="/dashboard"
        className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Volver al panel
      </Link>
    </div>
  )
}
