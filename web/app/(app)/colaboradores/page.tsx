import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import {
  cargarColaboradores,
  cargarQuienesMeInvitaron,
  type Colega,
} from '@/lib/queries/colaboradores'
import { eliminarColaborador } from '@/lib/actions/colaboradores'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { AgregarColaborador } from '@/components/colaboradores/agregar-colaborador'

type Tab = 'puedo-ver' | 'me-pueden-ver'

function normalizarTab(valor?: string): Tab {
  return valor === 'me-pueden-ver' ? 'me-pueden-ver' : 'puedo-ver'
}

/** href a esta página preservando la asignatura y fijando la tab. */
function hrefTab(tab: Tab, asignatura?: string): string {
  const params = new URLSearchParams()
  if (asignatura) params.set('asignatura', asignatura)
  params.set('tab', tab)
  return `/colaboradores?${params.toString()}`
}

/** Tarjeta de un colega; opcionalmente muestra el botón «Quitar». */
function TarjetaColega({
  colega,
  conQuitar,
}: {
  colega: Colega
  conQuitar?: boolean
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">
            👤 {colega.nombre}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {colega.email}
          </span>
        </div>
        {conQuitar ? (
          <form action={eliminarColaborador.bind(null, colega.id)}>
            <button
              type="submit"
              className={buttonVariants({
                variant: 'destructive',
                size: 'sm',
                className: 'h-9 px-3 sm:h-7 sm:px-2.5',
              })}
            >
              Quitar
            </button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}

function EstadoVacio({ mensaje }: { mensaje: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <p className="text-sm text-muted-foreground">{mensaje}</p>
    </div>
  )
}

export default async function ColaboradoresPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string; tab?: string }>
}) {
  const { asignatura, tab } = await searchParams
  const tabActual = normalizarTab(tab)

  // Guard explícito (además del layout) para no consultar con un userId inválido.
  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  // «Colegas que puedo ver» = quienes me invitaron (puedo ver sus compartidas).
  // «Quién me puede ver a mí» = colegas que agregué (ven mis compartidas).
  // Misma semántica que el MVP (app.py) y que el Banco Compartido.
  const [puedoVer, mePuedenVer] = await Promise.all([
    cargarQuienesMeInvitaron(userId),
    cargarColaboradores(userId),
  ])

  const tabs: { id: Tab; etiqueta: string }[] = [
    { id: 'puedo-ver', etiqueta: 'Colegas que puedo ver' },
    { id: 'me-pueden-ver', etiqueta: 'Quién me puede ver a mí' },
  ]

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          🤝 Mis Colaboradores
        </h1>
        <p className="text-sm text-muted-foreground">
          Comparte tus preguntas con colegas y accede a las que ellos comparten
          contigo.
        </p>
      </div>

      {/* Tabs (navegación por URL, server-rendered). */}
      <div
        role="tablist"
        className="flex items-center gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((t) => {
          const activo = tabActual === t.id
          return (
            <Link
              key={t.id}
              role="tab"
              aria-selected={activo}
              href={hrefTab(t.id, asignatura)}
              className={cn(
                '-mb-px shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition-colors',
                activo
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.etiqueta}
            </Link>
          )
        })}
      </div>

      {tabActual === 'puedo-ver' ? (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Estos colegas te dieron acceso a sus preguntas compartidas; las verás
            en el Banco Compartido.
          </p>
          {puedoVer.length === 0 ? (
            <EstadoVacio mensaje="Aún ningún colega te ha dado acceso a sus preguntas." />
          ) : (
            <div className="flex flex-col gap-2">
              {puedoVer.map((c) => (
                <TarjetaColega key={c.id} colega={c} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Los colegas de tu lista pueden ver las preguntas que marques como
            compartidas.
          </p>

          <AgregarColaborador />

          {mePuedenVer.length === 0 ? (
            <EstadoVacio mensaje="Aún no has agregado a ningún colega." />
          ) : (
            <div className="flex flex-col gap-2">
              {mePuedenVer.map((c) => (
                <TarjetaColega key={c.id} colega={c} conQuitar />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
