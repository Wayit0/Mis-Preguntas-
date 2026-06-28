import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import {
  cargarTextosPropios,
  contarPreguntasPorTexto,
} from '@/lib/queries/textos'
import { cn } from '@/lib/utils'
import { FormularioTexto } from '@/components/textos/formulario-texto'
import { TarjetaTexto } from '@/components/textos/tarjeta-texto'

type Tab = 'ver' | 'crear'

function normalizarTab(valor?: string): Tab {
  return valor === 'crear' ? 'crear' : 'ver'
}

/** Construye un href a esta página preservando la asignatura y fijando la tab. */
function hrefTab(tab: Tab, asignatura?: string): string {
  const params = new URLSearchParams()
  if (asignatura) params.set('asignatura', asignatura)
  params.set('tab', tab)
  return `/textos?${params.toString()}`
}

export default async function TextosPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string; tab?: string }>
}) {
  const { asignatura, tab } = await searchParams
  const tabActual = normalizarTab(tab)

  // Guard explícito (además del layout) para no ejecutar queries con un userId
  // inválido si la página se renderiza junto al redirect del layout.
  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  const textosPropios = await cargarTextosPropios(userId, asignatura)
  const conteos = await contarPreguntasPorTexto(textosPropios.map((t) => t.id))

  const tabs: { id: Tab; etiqueta: string }[] = [
    { id: 'ver', etiqueta: 'Ver mis textos' },
    { id: 'crear', etiqueta: 'Agregar nuevo texto' },
  ]

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
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
          Textos de comprensión lectora a los que puedes asociar preguntas.
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

      {tabActual === 'crear' ? (
        <FormularioTexto asignaturaInicial={asignatura} />
      ) : textosPropios.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-medium text-foreground">
            Aún no tienes textos aquí
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea uno en la pestaña «Agregar nuevo texto» para empezar.
          </p>
          <Link
            href={hrefTab('crear', asignatura)}
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            ➕ Agregar nuevo texto
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {textosPropios.map((t) => (
            <TarjetaTexto
              key={t.id}
              texto={t}
              nPreguntas={conteos.get(t.id) ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}
