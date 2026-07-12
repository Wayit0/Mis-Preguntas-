import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { resolverAsignatura } from '@/lib/asignatura'
import {
  listarPreguntasPropias,
  opcionesDeFiltros,
  POR_PAGINA_PREGUNTAS,
  type EstadoCompartida,
} from '@/lib/queries/preguntas'
import {
  listarCarpetas,
  rutaCarpeta,
  subcarpetas,
  contarItemsEnCarpetas,
} from '@/lib/queries/carpetas'
import { buttonVariants } from '@/components/ui/button'
import { FiltrosPreguntas } from '@/components/preguntas/filtros-preguntas'
import { TarjetaPregunta } from '@/components/preguntas/tarjeta-pregunta'
import { NavegadorCarpetas } from '@/components/carpetas/navegador-carpetas'
import { Paginador } from '@/components/carpetas/paginador'

const ESTADOS_VALIDOS: EstadoCompartida[] = ['todas', 'compartida', 'privada']

function normalizarEstado(valor?: string): EstadoCompartida {
  return ESTADOS_VALIDOS.includes(valor as EstadoCompartida)
    ? (valor as EstadoCompartida)
    : 'todas'
}

function conAsignatura(base: string, asignatura?: string): string {
  return asignatura
    ? `${base}?asignatura=${encodeURIComponent(asignatura)}`
    : base
}

export default async function PreguntasPage({
  searchParams,
}: {
  searchParams: Promise<{
    materia?: string
    nivel?: string
    estado?: string
    busqueda?: string
    carpeta?: string
    pagina?: string
  }>
}) {
  const { materia, nivel, estado, busqueda, carpeta, pagina: paginaParam } =
    await searchParams

  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  const asignatura = await resolverAsignatura(userId)

  const buscando = Boolean(busqueda?.trim())
  const carpetaActual =
    carpeta && Number.isFinite(Number(carpeta)) ? Number(carpeta) : null
  const pagina = Math.max(1, Number(paginaParam) || 1)

  // En modo búsqueda ignoramos la carpeta (resultados globales); en navegación,
  // acotamos a la carpeta actual (`null` = raíz / sin carpeta).
  const filtros = {
    materia,
    nivel,
    estado: normalizarEstado(estado),
    busqueda,
    carpetaId: buscando ? undefined : carpetaActual,
  }

  const [pag, opciones, ruta, subs, carpetas] = await Promise.all([
    listarPreguntasPropias(userId, asignatura, filtros, pagina),
    opcionesDeFiltros(userId, asignatura),
    buscando ? Promise.resolve([]) : rutaCarpeta(userId, carpetaActual),
    buscando ? Promise.resolve([]) : subcarpetas(userId, carpetaActual),
    listarCarpetas(userId),
  ])

  // Carpeta inexistente o ajena → volvemos a la raíz.
  if (!buscando && carpetaActual != null && ruta.length === 0) {
    redirect('/preguntas')
  }

  const conteos = await contarItemsEnCarpetas(
    userId,
    'preguntas',
    subs.map((s) => s.id),
  )
  const subConConteo = subs.map((s) => ({ ...s, n: conteos.get(s.id) ?? 0 }))

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Mis Preguntas
            {asignatura ? (
              <span className="font-semibold text-muted-foreground">
                {' — '}
                {asignatura}
              </span>
            ) : null}
          </h1>
          <p className="text-sm text-muted-foreground">
            {pag.total === 1 ? '1 pregunta' : `${pag.total} preguntas`}
            {buscando ? ' · resultados en todas las carpetas' : ''}
          </p>
        </div>
        <Link
          href={conAsignatura('/preguntas/nueva', asignatura)}
          className={buttonVariants({ className: 'w-full sm:w-auto' })}
        >
          ➕ Nueva pregunta
        </Link>
      </div>

      {buscando ? null : (
        <NavegadorCarpetas
          basePath="/preguntas"
          carpetaActual={carpetaActual}
          ruta={ruta}
          subcarpetas={subConConteo}
        />
      )}

      <FiltrosPreguntas materias={opciones.materias} niveles={opciones.niveles} />

      {pag.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-medium text-foreground">
            {buscando
              ? 'Sin resultados'
              : carpetaActual != null
                ? 'Esta carpeta está vacía'
                : 'Aún no tienes preguntas aquí'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {busqueda || materia || nivel || (estado && estado !== 'todas')
              ? 'Ninguna pregunta coincide. Prueba a quitar filtros o búsqueda.'
              : 'Crea una pregunta o mueve preguntas existentes a esta carpeta.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pag.items.map((p) => (
            <TarjetaPregunta key={p.id} p={p} carpetas={carpetas} />
          ))}
        </div>
      )}

      <Paginador
        total={pag.total}
        pagina={pagina}
        porPagina={POR_PAGINA_PREGUNTAS}
        basePath="/preguntas"
        params={{ materia, nivel, estado, busqueda, carpeta }}
      />
    </div>
  )
}
