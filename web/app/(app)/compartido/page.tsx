import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { resolverAsignatura } from '@/lib/asignatura'
import { cargarBancoCompartido } from '@/lib/queries/compartido'
import { TarjetaPregunta } from '@/components/preguntas/tarjeta-pregunta'

export default async function CompartidoPage() {
  // Guard explícito (además del layout) para no consultar con un userId inválido.
  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  // La asignatura es contexto global (cookie), no viene de la URL.
  const asignatura = await resolverAsignatura(userId)

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
          · tus preguntas compartidas y las que tus colegas comparten contigo
        </p>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-medium text-foreground">
            El banco compartido está vacío
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {asignatura
              ? `No hay preguntas compartidas de ${asignatura} todavía.`
              : 'Marca una pregunta como “Compartida” en EduBox y aparecerá aquí; también verás las que un colega de tu colegio (o que te haya invitado) comparta contigo.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((p) => {
            // Las tuyas: editables y marcadas "Tuya". Las de otros: solo lectura
            // con el nombre del autor.
            const propia = p.userId === userId
            return (
              <TarjetaPregunta
                key={p.id}
                p={p}
                autor={propia ? undefined : p.autor}
                soloLectura={!propia}
                propia={propia}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
