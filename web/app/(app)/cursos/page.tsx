import Link from 'next/link'
import { requireActor } from '@/lib/authz'
import { listarCursosPropios } from '@/lib/queries/cursos'
import { Card, CardContent } from '@/components/ui/card'
import { NuevoCurso } from '@/components/cursos/nuevo-curso'

export default async function CursosPage() {
  const actor = await requireActor()
  const cursos = await listarCursosPropios(actor.userId)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          🎓 Mis Cursos
        </h1>
        <p className="text-sm text-muted-foreground">
          {cursos.length === 0
            ? 'Aún no tienes cursos'
            : cursos.length === 1
              ? '1 curso'
              : `${cursos.length} cursos`}
        </p>
      </div>

      <NuevoCurso />

      {cursos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-medium text-foreground">
            Aún no tienes cursos
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea un curso para inscribir alumnos y asignarles pruebas.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cursos.map((c) => (
            <Link key={c.id} href={`/cursos/${c.id}`} className="block">
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardContent className="flex flex-col gap-1">
                  <h2 className="font-heading text-lg font-semibold text-foreground">
                    🎓 {c.nombre}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {c.nAlumnos === 1 ? '1 alumno' : `${c.nAlumnos} alumnos`}
                    {' · '}
                    {c.nTareas === 1 ? '1 tarea' : `${c.nTareas} tareas`}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
