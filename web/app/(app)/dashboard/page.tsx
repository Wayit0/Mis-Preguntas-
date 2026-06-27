import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/get-session'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { buttonVariants } from '@/components/ui/button'

// Placeholder mínimo del landing autenticado. La Fase 4 lo reemplaza por el
// shell real (sidebar + topbar). Sólo verifica sesión y saluda al usuario.
export default async function DashboardPage() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
          Hola, {session.user.name}
        </h1>
        <p className="text-muted-foreground">
          Bienvenido a Mis Preguntas. Aquí irá tu panel.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/cuenta" className={buttonVariants({ variant: 'outline' })}>
          Cambiar contraseña
        </Link>
        <SignOutButton />
      </div>
    </main>
  )
}
