import { cookies } from 'next/headers'
import { requireActor } from '@/lib/authz'
import { resolverAsignatura } from '@/lib/asignatura'
import { MobileNavProvider } from '@/components/shell/mobile-nav'
import { FeedbackWidget } from '@/components/shell/feedback-widget'
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
  const esGlobalAdmin = actor.role === 'global_admin'
  const puedeAdminColegio = actor.role === 'school_admin' || esGlobalAdmin
  const asignaturaActual = await resolverAsignatura(actor.userId)
  // Estado contraído del sidebar (cookie escrita por el propio Sidebar al
  // alternar): leerlo aquí evita el parpadeo expandido→contraído al hidratar.
  const sidebarColapsado =
    (await cookies()).get('sidebar_colapsado')?.value === '1'

  return (
    <MobileNavProvider>
      <div className="flex min-h-svh w-full">
        <Sidebar
          puedeAdminColegio={puedeAdminColegio}
          esGlobalAdmin={esGlobalAdmin}
          asignaturaActual={asignaturaActual}
          colapsadoInicial={sidebarColapsado}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} />
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
        <FeedbackWidget />
      </div>
    </MobileNavProvider>
  )
}
