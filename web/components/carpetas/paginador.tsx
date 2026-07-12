import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

/**
 * Paginador de listas: "Anterior / Página X de Y / Siguiente". Server component;
 * cada botón es un Link que preserva los parámetros actuales y cambia `pagina`.
 * No renderiza nada si todo cabe en una página.
 */
export function Paginador({
  total,
  pagina,
  porPagina,
  basePath,
  params = {},
}: {
  total: number
  pagina: number
  porPagina: number
  basePath: string
  params?: Record<string, string | undefined>
}) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  if (totalPaginas <= 1) return null

  const href = (p: number) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') sp.set(k, v)
    }
    if (p > 1) sp.set('pagina', String(p))
    else sp.delete('pagina')
    const qs = sp.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  const anterior = Math.max(1, pagina - 1)
  const siguiente = Math.min(totalPaginas, pagina + 1)
  const btn = buttonVariants({ variant: 'outline', size: 'sm' })
  const btnOff = `${btn} pointer-events-none opacity-50`

  return (
    <nav
      aria-label="Paginación"
      className="flex items-center justify-between gap-3 pt-1"
    >
      <Link
        href={href(anterior)}
        aria-disabled={pagina <= 1}
        className={pagina <= 1 ? btnOff : btn}
      >
        ← Anterior
      </Link>
      <span className="text-sm text-muted-foreground">
        Página {pagina} de {totalPaginas}
      </span>
      <Link
        href={href(siguiente)}
        aria-disabled={pagina >= totalPaginas}
        className={pagina >= totalPaginas ? btnOff : btn}
      >
        Siguiente →
      </Link>
    </nav>
  )
}
