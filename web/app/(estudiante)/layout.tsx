import Link from 'next/link'
import { requireEstudiante } from '@/lib/authz'
import { CerrarSesion } from '@/components/estudiante/cerrar-sesion'

// El shell del estudiante depende de la sesión (cookies/headers), por lo que
// todas las rutas hijas se renderizan por petición.
export const dynamic = 'force-dynamic'

export default async function EstudianteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const actor = await requireEstudiante()
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <Link href="/tareas" className="font-heading text-lg font-bold text-foreground">
          📚 EduBox
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{actor.nombre}</span>
          <CerrarSesion />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}
