import { requireActor } from '@/lib/authz'
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
  // requireActor lee la fila de usuarios (rol/colegio actualizado) o redirige a
  // /login si no hay sesión. El enlace "Mi Colegio" del sidebar sólo se muestra
  // a quien administra un colegio; el guard real vive igualmente en /colegio.
  const actor = await requireActor()
  const user = { name: actor.nombre, email: actor.email }
  const puedeAdminColegio =
    actor.role === 'school_admin' || actor.role === 'global_admin'

  return (
    <MobileNavProvider>
      <div className="flex min-h-svh w-full">
        <Sidebar puedeAdminColegio={puedeAdminColegio} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} />
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </MobileNavProvider>
  )
}
