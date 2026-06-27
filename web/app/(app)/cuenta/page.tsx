import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/get-session'
import { ChangePasswordForm } from '@/components/auth/change-password-form'

// Página temporal de cuenta. En la Fase 4 el cambio de contraseña se moverá al
// topbar del shell autenticado.
export default async function CuentaPage() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
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
