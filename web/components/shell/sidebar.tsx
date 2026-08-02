'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/brand/logo'
import { useMobileNav } from './mobile-nav'
import { SubjectSwitcher } from './subject-switcher'

interface NavItem {
  href: string
  etiqueta: string
  emoji: string
}

interface NavGrupo {
  titulo: string
  items: NavItem[]
}

// Cookie que persiste el estado contraído del sidebar de escritorio. La lee el
// layout del servidor (para renderizar ya contraído, sin parpadeo al hidratar)
// y la escribe este componente al alternar.
const COOKIE_SIDEBAR = 'sidebar_colapsado'

// Grupos de navegación: "Acciones" (crear/importar contenido), "Trabajo"
// (bancos propios + compartido) y "Red" (colaboración).
const GRUPOS: NavGrupo[] = [
  {
    titulo: 'Acciones',
    items: [
      { href: '/preguntas/nueva', etiqueta: 'Agregar Pregunta', emoji: '➕' },
      { href: '/textos/nueva', etiqueta: 'Agregar Texto', emoji: '✏️' },
      { href: '/prueba', etiqueta: 'Crear Prueba', emoji: '📝' },
      { href: '/importar', etiqueta: 'Importar Documento', emoji: '📄' },
      { href: '/generar', etiqueta: 'Crear preguntas con IA', emoji: '✨' },
    ],
  },
  {
    titulo: 'Trabajo',
    items: [
      { href: '/preguntas', etiqueta: 'Mis Preguntas', emoji: '📖' },
      { href: '/textos', etiqueta: 'Mis Textos', emoji: '📰' },
      { href: '/mis-pruebas', etiqueta: 'Mis Pruebas', emoji: '🗂️' },
      { href: '/compartido', etiqueta: 'Banco Compartido', emoji: '🌐' },
    ],
  },
  {
    titulo: 'Red',
    items: [
      { href: '/colaboradores', etiqueta: 'Colaboradores', emoji: '🤝' },
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

// Marca activo el ítem cuyo href coincide con la ruta. /preguntas y /textos
// resaltan también sus sub-rutas de detalle (p. ej. /preguntas/123/editar) pero
// NO /preguntas/nueva ni /textos/nueva, que son ítems propios. /colegio resalta
// también sus sub-rutas.
function esActivo(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/preguntas') {
    return pathname.startsWith('/preguntas/') && pathname !== '/preguntas/nueva'
  }
  if (href === '/textos') {
    return pathname.startsWith('/textos/') && pathname !== '/textos/nueva'
  }
  if (href === '/mis-pruebas') {
    return pathname.startsWith('/mis-pruebas/')
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
  asignaturaActual,
  grupos,
  onNavegar,
  colapsado = false,
}: {
  pathname: string
  asignaturaActual: string
  grupos: NavGrupo[]
  onNavegar?: () => void
  /** Modo contraído (solo iconos): oculta selector, títulos y etiquetas. */
  colapsado?: boolean
}) {
  return (
    <nav
      aria-label="Secciones"
      className={cn('flex flex-col gap-5 py-4', colapsado ? 'px-1.5' : 'px-2')}
    >
      {/* Selector global de asignatura (contexto persistente en cookie). En el
          modo contraído se oculta: no cabe, y la asignatura activa sigue
          visible en el encabezado de cada página. */}
      {!colapsado ? (
        <div className="px-1">
          <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
            Asignatura
          </div>
          <SubjectSwitcher asignaturaActual={asignaturaActual} />
        </div>
      ) : null}

      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="flex flex-col gap-1">
          {!colapsado ? (
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
              {grupo.titulo}
            </div>
          ) : null}
          {grupo.items.map((item) => {
            const activo = esActivo(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavegar}
                aria-current={activo ? 'page' : undefined}
                title={colapsado ? item.etiqueta : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium transition-colors',
                  colapsado ? 'justify-center px-0' : 'px-3',
                  activo
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <span aria-hidden className="text-base leading-none">
                  {item.emoji}
                </span>
                {/* En modo contraído la etiqueta queda solo para lectores de
                    pantalla (sr-only); el tooltip nativo la muestra al hover. */}
                <span className={colapsado ? 'sr-only' : undefined}>
                  {item.etiqueta}
                </span>
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
  asignaturaActual = '',
  colapsadoInicial = false,
}: {
  /** Muestra "Mi Colegio" (/colegio) a school_admin/global_admin. */
  puedeAdminColegio?: boolean
  /** Muestra "Administración" (/admin) SOLO al admin global. */
  esGlobalAdmin?: boolean
  /** Asignatura activa (cookie o más usada), resuelta en el servidor. */
  asignaturaActual?: string
  /** Estado contraído persistido (cookie, leída por el layout del servidor). */
  colapsadoInicial?: boolean
}) {
  const pathname = usePathname()
  const { abierto, cerrar } = useMobileNav()
  // Sólo afecta al sidebar fijo de escritorio; el menú móvil siempre va
  // completo (es un overlay, no compite por espacio con el contenido).
  const [colapsado, setColapsado] = useState(colapsadoInicial)

  const grupos = gruposPara(puedeAdminColegio, esGlobalAdmin)

  function alternar() {
    setColapsado((previo) => {
      const siguiente = !previo
      document.cookie = `${COOKIE_SIDEBAR}=${siguiente ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
      return siguiente
    })
  }

  return (
    <>
      {/* Sidebar fijo en escritorio (contraíble a iconos) */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex',
          colapsado ? 'w-14' : 'w-60',
        )}
      >
        <div
          className={cn(
            'flex px-2 pt-3',
            colapsado ? 'justify-center' : 'justify-end',
          )}
        >
          <button
            type="button"
            onClick={alternar}
            aria-expanded={!colapsado}
            aria-label={colapsado ? 'Expandir menú' : 'Contraer menú'}
            title={colapsado ? 'Expandir menú' : 'Contraer menú'}
            className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {colapsado ? (
              <ChevronsRight className="size-4" aria-hidden />
            ) : (
              <ChevronsLeft className="size-4" aria-hidden />
            )}
          </button>
        </div>
        <SidebarNav
          pathname={pathname}
          asignaturaActual={asignaturaActual}
          grupos={grupos}
          colapsado={colapsado}
        />
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
              <Logo enOscuro />
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
              asignaturaActual={asignaturaActual}
              grupos={grupos}
              onNavegar={cerrar}
            />
          </aside>
        </div>
      )}
    </>
  )
}
