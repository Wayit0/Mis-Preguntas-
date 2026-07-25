import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { resolverAsignatura } from '@/lib/asignatura'
import { preguntasDuplicadas } from '@/lib/queries/preguntas'
import { eliminarPreguntasEnLote } from '@/lib/actions/preguntas'
import { buttonVariants } from '@/components/ui/button'
import { FilaPreguntaDuplicada } from '@/components/preguntas/fila-pregunta-duplicada'

function conAsignatura(base: string, asignatura?: string): string {
  return asignatura
    ? `${base}?asignatura=${encodeURIComponent(asignatura)}`
    : base
}

/**
 * Agrupa las preguntas propias (de la asignatura activa) por enunciado
 * normalizado y deja marcar cuáles copias eliminar. Sólo detecta duplicados
 * EXACTOS (mismas palabras, sin importar tildes/mayúsculas/espacios) — una
 * pregunta reformulada con otra redacción no se agrupa.
 */
export default async function PreguntasDuplicadasPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  const asignatura = await resolverAsignatura(userId)
  const grupos = await preguntasDuplicadas(userId, asignatura)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link
          href={conAsignatura('/preguntas', asignatura)}
          className="w-fit text-sm text-muted-foreground hover:underline"
        >
          ← Volver a Mis Preguntas
        </Link>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Preguntas duplicadas
          {asignatura ? (
            <span className="font-semibold text-muted-foreground">
              {' — '}
              {asignatura}
            </span>
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">
          {grupos.length === 0
            ? 'No encontramos preguntas repetidas.'
            : `${grupos.length} ${grupos.length === 1 ? 'grupo' : 'grupos'} de preguntas con el mismo enunciado.`}
        </p>
      </div>

      {grupos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-medium text-foreground">Sin duplicadas</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Comparamos el enunciado exacto (sin tildes, mayúsculas ni espacios
            de más). Una pregunta reformulada con otras palabras no se detecta.
          </p>
        </div>
      ) : (
        <form action={eliminarPreguntasEnLote} className="flex flex-col gap-6">
          <p className="text-sm text-muted-foreground">
            Marca las copias que quieres eliminar y deja sin marcar la que
            quieres conservar.
          </p>

          {grupos.map((g, i) => (
            <div key={g.clave} className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">
                Grupo {i + 1} · {g.preguntas.length} preguntas iguales
              </p>
              <div className="flex flex-col gap-2">
                {g.preguntas.map((p) => (
                  <FilaPreguntaDuplicada key={p.id} p={p} />
                ))}
              </div>
            </div>
          ))}

          <div>
            <button
              type="submit"
              className={buttonVariants({ variant: 'destructive' })}
            >
              🗑 Eliminar seleccionadas
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
