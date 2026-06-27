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
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-4 px-4 py-10">
      <ChangePasswordForm />
      <Link
        href="/dashboard"
        className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Volver al panel
      </Link>
    </main>
  )
}
