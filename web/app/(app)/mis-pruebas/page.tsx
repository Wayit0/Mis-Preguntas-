import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { listarPruebasPropias } from '@/lib/queries/pruebas'
import { buttonVariants } from '@/components/ui/button'
import { TarjetaPrueba } from '@/components/pruebas/tarjeta-prueba'

/** Construye un href preservando la asignatura actual (?asignatura=). */
function conAsignatura(base: string, asignatura?: string): string {
  return asignatura
    ? `${base}?asignatura=${encodeURIComponent(asignatura)}`
    : base
}

export default async function MisPruebasPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string }>
}) {
  const { asignatura } = await searchParams

  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  const pruebas = await listarPruebasPropias(userId, asignatura)

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
            Guarda tus pruebas, edítalas y descarga su PDF cuando quieras.
          </p>
        </div>
        <Link
          href={conAsignatura('/prueba', asignatura)}
          className={buttonVariants()}
        >
          ➕ Nueva prueba
        </Link>
      </div>

      {pruebas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-medium text-foreground">
            Aún no tienes pruebas guardadas
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea una prueba, guárdala y aparecerá aquí para editarla o descargar
            su PDF.
          </p>
          <Link
            href={conAsignatura('/prueba', asignatura)}
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            ➕ Crear una prueba
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pruebas.map((p) => (
            <TarjetaPrueba key={p.id} prueba={p} />
          ))}
        </div>
      )}
    </div>
  )
}
