import Link from 'next/link'
import { requireActor } from '@/lib/authz'
import { invitacionesPendientesPorEmail } from '@/lib/queries/colegio'
import { ChangePasswordForm } from '@/components/auth/change-password-form'
import { UnirseColegio } from '@/components/colegio/unirse-colegio'

// Página de cuenta. Además del cambio de contraseña, ofrece a los profesores
// SIN colegio el punto de entrada para unirse (por código o invitación).
export default async function CuentaPage() {
  const actor = await requireActor()

  // Solo los profesores sin colegio ven el bloque de unión (un global_admin no
  // pertenece a un colegio por diseño, así que se excluye).
  const mostrarUnirse =
    actor.colegioId === null && actor.role !== 'global_admin'
  const invitaciones = mostrarUnirse
    ? await invitacionesPendientesPorEmail(actor.email)
    : []

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      {mostrarUnirse ? <UnirseColegio invitaciones={invitaciones} /> : null}

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
