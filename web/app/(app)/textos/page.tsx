import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { resolverAsignatura } from '@/lib/asignatura'
import {
  cargarTextosPropios,
  contarPreguntasPorTexto,
} from '@/lib/queries/textos'
import { buttonVariants } from '@/components/ui/button'
import { TarjetaTexto } from '@/components/textos/tarjeta-texto'

function conAsignatura(base: string, asignatura?: string): string {
  return asignatura
    ? `${base}?asignatura=${encodeURIComponent(asignatura)}`
    : base
}

export default async function TextosPage() {
  // Guard explícito (además del layout) para no ejecutar queries con un userId
  // inválido si la página se renderiza junto al redirect del layout.
  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  // La asignatura es contexto global (cookie), no viene de la URL.
  const asignatura = await resolverAsignatura(userId)

  const textosPropios = await cargarTextosPropios(userId, asignatura)
  const conteos = await contarPreguntasPorTexto(textosPropios.map((t) => t.id))

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
            Textos de comprensión lectora a los que puedes asociar preguntas.
          </p>
        </div>
        <Link
          href={conAsignatura('/textos/nueva', asignatura)}
          className={buttonVariants({ className: 'w-full sm:w-auto' })}
        >
          ➕ Agregar texto
        </Link>
      </div>

      {textosPropios.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-medium text-foreground">
            Aún no tienes textos aquí
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea tu primer texto de comprensión para empezar.
          </p>
          <Link
            href={conAsignatura('/textos/nueva', asignatura)}
            className={buttonVariants({ className: 'mt-4' })}
          >
            ➕ Agregar texto
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
