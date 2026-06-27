import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { MobileNavProvider } from '@/components/shell/mobile-nav'
import { Sidebar } from '@/components/shell/sidebar'
import { Topbar } from '@/components/shell/topbar'

// El shell autenticado depende de la sesión (cookies/headers), por lo que todas
// las rutas hijas se renderizan por petición.
export const dynamic = 'force-dynamic'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }

  const user = {
    name: session.user.name ?? 'Profesor',
    email: session.user.email ?? '',
  }

  return (
    <MobileNavProvider>
      <div className="flex min-h-svh w-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  )
}
