import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { cargarBancoCompartido } from '@/lib/queries/compartido'
import { TarjetaPregunta } from '@/components/preguntas/tarjeta-pregunta'

export default async function CompartidoPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string }>
}) {
  const { asignatura } = await searchParams

  // Guard explícito (además del layout) para no consultar con un userId inválido.
  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  const lista = await cargarBancoCompartido(userId, asignatura)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Banco Compartido
          {asignatura ? (
            <span className="font-semibold text-muted-foreground">
              {' — '}
              {asignatura}
            </span>
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">
          {lista.length === 1
            ? '1 pregunta compartida'
            : `${lista.length} preguntas compartidas`}{' '}
          · preguntas que tus colegas decidieron compartir contigo
        </p>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-medium text-foreground">
            Aún no hay preguntas compartidas contigo
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {asignatura
              ? `Ningún colega ha compartido preguntas de ${asignatura} todavía.`
              : 'Cuando un colega que te dio acceso comparta una pregunta, aparecerá aquí.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((p) => (
            <TarjetaPregunta key={p.id} p={p} autor={p.autor} soloLectura />
          ))}
        </div>
      )}
    </div>
  )
}
