'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMobileNav } from './mobile-nav'

interface NavItem {
  href: string
  etiqueta: string
  emoji: string
}

interface NavGrupo {
  titulo: string
  items: NavItem[]
}

// Dos grupos de navegación, según el mockup north star: "Trabajo" y "Red".
const GRUPOS: NavGrupo[] = [
  {
    titulo: 'Trabajo',
    items: [
      { href: '/preguntas', etiqueta: 'Mis Preguntas', emoji: '📖' },
      { href: '/compartido', etiqueta: 'Banco Compartido', emoji: '🌐' },
      { href: '/preguntas/nueva', etiqueta: 'Agregar Pregunta', emoji: '➕' },
      { href: '/textos', etiqueta: 'Mis Textos', emoji: '📰' },
      { href: '/prueba', etiqueta: 'Crear Prueba', emoji: '📝' },
    ],
  },
  {
    titulo: 'Red',
    items: [
      { href: '/colaboradores', etiqueta: 'Colaboradores', emoji: '🤝' },
      { href: '/importar', etiqueta: 'Importar Documento', emoji: '📄' },
    ],
  },
]

// Grupo de administración. La visibilidad es cosmética; el acceso real a cada
// ruta lo protege su propio guard de servidor:
//  - "Administración" (/admin): SOLO admin global.
//  - "Mi Colegio" (/colegio): school_admin o global_admin.
function gruposPara(
  puedeAdminColegio: boolean,
  esGlobalAdmin: boolean,
): NavGrupo[] {
  const items: NavItem[] = []
  if (esGlobalAdmin) {
    items.push({ href: '/admin', etiqueta: 'Administración', emoji: '🛡️' })
  }
  if (puedeAdminColegio) {
    items.push({ href: '/colegio', etiqueta: 'Mi Colegio', emoji: '🏫' })
  }
  if (items.length === 0) return GRUPOS
  return [...GRUPOS, { titulo: 'Administración', items }]
}

// Marca activo el ítem cuyo href coincide con la ruta. /preguntas resalta también
// sus sub-rutas de detalle (p. ej. /preguntas/123/editar) pero NO /preguntas/nueva,
// que es un ítem propio. /colegio resalta también sus sub-rutas.
function esActivo(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/preguntas') {
    return pathname.startsWith('/preguntas/') && pathname !== '/preguntas/nueva'
  }
  if (href === '/colegio') {
    return pathname.startsWith('/colegio/')
  }
  if (href === '/admin') {
    return pathname.startsWith('/admin/')
  }
  return false
}

function SidebarNav({
  pathname,
  asignatura,
  grupos,
  onNavegar,
}: {
  pathname: string
  asignatura: string | null
  grupos: NavGrupo[]
  onNavegar?: () => void
}) {
  // Cada link preserva el contexto de asignatura actual (?asignatura=).
  function hrefCon(base: string): string {
    return asignatura
      ? `${base}?asignatura=${encodeURIComponent(asignatura)}`
      : base
  }

  return (
    <nav aria-label="Secciones" className="flex flex-col gap-5 px-2 py-4">
      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="flex flex-col gap-1">
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
            {grupo.titulo}
          </div>
          {grupo.items.map((item) => {
            const activo = esActivo(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={hrefCon(item.href)}
                onClick={onNavegar}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  activo
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <span aria-hidden className="text-base leading-none">
                  {item.emoji}
                </span>
                <span>{item.etiqueta}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

export function Sidebar({
  puedeAdminColegio = false,
  esGlobalAdmin = false,
}: {
  /** Muestra "Mi Colegio" (/colegio) a school_admin/global_admin. */
  puedeAdminColegio?: boolean
  /** Muestra "Administración" (/admin) SOLO al admin global. */
  esGlobalAdmin?: boolean
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { abierto, cerrar } = useMobileNav()

  const asignatura = searchParams.get('asignatura')
  const grupos = gruposPara(puedeAdminColegio, esGlobalAdmin)

  return (
    <>
      {/* Sidebar fijo en escritorio */}
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <SidebarNav pathname={pathname} asignatura={asignatura} grupos={grupos} />
      </aside>

      {/* Menú colapsable en móvil (se abre con el botón ☰ del topbar) */}
      {abierto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={cerrar}
            className="absolute inset-0 bg-black/50"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
              <span className="font-bold text-sidebar-foreground">
                📚 EduBox
              </span>
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={cerrar}
                className="rounded-md p-1 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <SidebarNav
              pathname={pathname}
              asignatura={asignatura}
              grupos={grupos}
              onNavegar={cerrar}
            />
          </aside>
        </div>
      )}
    </>
  )
}
