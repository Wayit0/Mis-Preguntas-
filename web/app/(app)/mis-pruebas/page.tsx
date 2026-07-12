import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { resolverAsignatura } from '@/lib/asignatura'
import { listarPruebasPropias, POR_PAGINA_PRUEBAS } from '@/lib/queries/pruebas'
import {
  listarCarpetas,
  rutaCarpeta,
  subcarpetas,
  contarItemsEnCarpetas,
} from '@/lib/queries/carpetas'
import { buttonVariants } from '@/components/ui/button'
import { TarjetaPrueba } from '@/components/pruebas/tarjeta-prueba'
import { NavegadorCarpetas } from '@/components/carpetas/navegador-carpetas'
import { Paginador } from '@/components/carpetas/paginador'
import { BuscadorLista } from '@/components/carpetas/buscador-lista'

export default async function MisPruebasPage({
  searchParams,
}: {
  searchParams: Promise<{ busqueda?: string; carpeta?: string; pagina?: string }>
}) {
  const { busqueda, carpeta, pagina: paginaParam } = await searchParams

  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  const asignatura = await resolverAsignatura(userId)

  const buscando = Boolean(busqueda?.trim())
  const carpetaActual =
    carpeta && Number.isFinite(Number(carpeta)) ? Number(carpeta) : null
  const pagina = Math.max(1, Number(paginaParam) || 1)

  const filtros = { busqueda, carpetaId: buscando ? undefined : carpetaActual }

  const [pag, ruta, subs, carpetas] = await Promise.all([
    listarPruebasPropias(userId, asignatura, filtros, pagina),
    buscando ? Promise.resolve([]) : rutaCarpeta(userId, carpetaActual),
    buscando ? Promise.resolve([]) : subcarpetas(userId, carpetaActual),
    listarCarpetas(userId),
  ])

  if (!buscando && carpetaActual != null && ruta.length === 0) {
    redirect('/mis-pruebas')
  }

  const conteoCarpetas = await contarItemsEnCarpetas(
    userId,
    'pruebas',
    subs.map((s) => s.id),
  )
  const subConConteo = subs.map((s) => ({ ...s, n: conteoCarpetas.get(s.id) ?? 0 }))

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            🗂️ Mis Pruebas
            {asignatura ? (
              <span className="font-semibold text-muted-foreground">
                {' — '}
                {asignatura}
              </span>
            ) : null}
          </h1>
          <p className="text-sm text-muted-foreground">
            {pag.total === 1 ? '1 prueba' : `${pag.total} pruebas`}
            {buscando ? ' · resultados en todas las carpetas' : ''}
          </p>
        </div>
        <Link href="/prueba" className={buttonVariants()}>
          ➕ Nueva prueba
        </Link>
      </div>

      {buscando ? null : (
        <NavegadorCarpetas
          basePath="/mis-pruebas"
          carpetaActual={carpetaActual}
          ruta={ruta}
          subcarpetas={subConConteo}
        />
      )}

      <BuscadorLista basePath="/mis-pruebas" valorInicial={busqueda ?? ''} />

      {pag.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-medium text-foreground">
            {buscando
              ? 'Sin resultados'
              : carpetaActual != null
                ? 'Esta carpeta está vacía'
                : 'Aún no tienes pruebas guardadas'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {buscando
              ? 'Ninguna prueba coincide con tu búsqueda.'
              : 'Crea una prueba o mueve pruebas existentes a esta carpeta.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pag.items.map((p) => (
            <TarjetaPrueba key={p.id} prueba={p} carpetas={carpetas} />
          ))}
        </div>
      )}

      <Paginador
        total={pag.total}
        pagina={pagina}
        porPagina={POR_PAGINA_PRUEBAS}
        basePath="/mis-pruebas"
        params={{ busqueda, carpeta }}
      />
    </div>
  )
}
