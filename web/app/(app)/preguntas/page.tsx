import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import {
  listarPreguntasPropias,
  opcionesDeFiltros,
  type EstadoCompartida,
} from '@/lib/queries/preguntas'
import { buttonVariants } from '@/components/ui/button'
import { FiltrosPreguntas } from '@/components/preguntas/filtros-preguntas'
import { TarjetaPregunta } from '@/components/preguntas/tarjeta-pregunta'

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
    asignatura?: string
    materia?: string
    nivel?: string
    estado?: string
  }>
}) {
  const { asignatura, materia, nivel, estado } = await searchParams

  // Guard explícito (además del layout) para no ejecutar queries con un userId
  // inválido si la página se renderiza junto al redirect del layout.
  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  const filtros = {
    materia,
    nivel,
    estado: normalizarEstado(estado),
  }

  const [lista, opciones] = await Promise.all([
    listarPreguntasPropias(userId, asignatura, filtros),
    opcionesDeFiltros(userId, asignatura),
  ])

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
            {lista.length === 1
              ? '1 pregunta'
              : `${lista.length} preguntas`}{' '}
            · filtra por materia, nivel o estado
          </p>
        </div>
        <Link
          href={conAsignatura('/preguntas/nueva', asignatura)}
          className={buttonVariants({ className: 'w-full sm:w-auto' })}
        >
          ➕ Nueva pregunta
        </Link>
      </div>

      <FiltrosPreguntas
        materias={opciones.materias}
        niveles={opciones.niveles}
      />

      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-medium text-foreground">
            Aún no tienes preguntas aquí
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {materia || nivel || (estado && estado !== 'todas')
              ? 'Ninguna pregunta coincide con los filtros. Prueba a quitarlos.'
              : 'Crea tu primera pregunta para empezar tu banco.'}
          </p>
          <Link
            href={conAsignatura('/preguntas/nueva', asignatura)}
            className={buttonVariants({ className: 'mt-4' })}
          >
            ➕ Agregar pregunta
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((p) => (
            <TarjetaPregunta key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  )
}
