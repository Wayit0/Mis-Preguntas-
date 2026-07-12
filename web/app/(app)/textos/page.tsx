import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { resolverAsignatura } from '@/lib/asignatura'
import {
  cargarTextosPropios,
  contarPreguntasPorTexto,
  POR_PAGINA_TEXTOS,
} from '@/lib/queries/textos'
import {
  listarCarpetas,
  rutaCarpeta,
  subcarpetas,
  contarItemsEnCarpetas,
} from '@/lib/queries/carpetas'
import { buttonVariants } from '@/components/ui/button'
import { TarjetaTexto } from '@/components/textos/tarjeta-texto'
import { NavegadorCarpetas } from '@/components/carpetas/navegador-carpetas'
import { Paginador } from '@/components/carpetas/paginador'
import { BuscadorLista } from '@/components/carpetas/buscador-lista'

function conAsignatura(base: string, asignatura?: string): string {
  return asignatura
    ? `${base}?asignatura=${encodeURIComponent(asignatura)}`
    : base
}

export default async function TextosPage({
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

  const filtros = {
    busqueda,
    carpetaId: buscando ? undefined : carpetaActual,
  }

  const [pag, ruta, subs, carpetas] = await Promise.all([
    cargarTextosPropios(userId, asignatura, filtros, pagina),
    buscando ? Promise.resolve([]) : rutaCarpeta(userId, carpetaActual),
    buscando ? Promise.resolve([]) : subcarpetas(userId, carpetaActual),
    listarCarpetas(userId),
  ])

  if (!buscando && carpetaActual != null && ruta.length === 0) {
    redirect('/textos')
  }

  const [conteoPreguntas, conteoCarpetas] = await Promise.all([
    contarPreguntasPorTexto(pag.items.map((t) => t.id)),
    contarItemsEnCarpetas(userId, 'textos', subs.map((s) => s.id)),
  ])
  const subConConteo = subs.map((s) => ({ ...s, n: conteoCarpetas.get(s.id) ?? 0 }))

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            📰 Mis Textos
            {asignatura ? (
              <span className="font-semibold text-muted-foreground">
                {' — '}
                {asignatura}
              </span>
            ) : null}
          </h1>
          <p className="text-sm text-muted-foreground">
            {pag.total === 1 ? '1 texto' : `${pag.total} textos`}
            {buscando ? ' · resultados en todas las carpetas' : ''}
          </p>
        </div>
        <Link
          href={conAsignatura('/textos/nueva', asignatura)}
          className={buttonVariants({ className: 'w-full sm:w-auto' })}
        >
          ➕ Agregar texto
        </Link>
      </div>

      {buscando ? null : (
        <NavegadorCarpetas
          basePath="/textos"
          carpetaActual={carpetaActual}
          ruta={ruta}
          subcarpetas={subConConteo}
        />
      )}

      <BuscadorLista basePath="/textos" valorInicial={busqueda ?? ''} />

      {pag.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-medium text-foreground">
            {buscando
              ? 'Sin resultados'
              : carpetaActual != null
                ? 'Esta carpeta está vacía'
                : 'Aún no tienes textos aquí'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {buscando
              ? 'Ningún texto coincide con tu búsqueda.'
              : 'Crea un texto o mueve textos existentes a esta carpeta.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pag.items.map((t) => (
            <TarjetaTexto
              key={t.id}
              texto={t}
              nPreguntas={conteoPreguntas.get(t.id) ?? 0}
              carpetas={carpetas}
            />
          ))}
        </div>
      )}

      <Paginador
        total={pag.total}
        pagina={pagina}
        porPagina={POR_PAGINA_TEXTOS}
        basePath="/textos"
        params={{ busqueda, carpeta }}
      />
    </div>
  )
}
