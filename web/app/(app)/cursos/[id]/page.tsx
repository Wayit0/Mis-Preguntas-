import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireActor } from '@/lib/authz'
import { cargarCursoPorId } from '@/lib/queries/cursos'
import { listarAsignacionesDeCurso } from '@/lib/queries/resultados'
import { Card, CardContent } from '@/components/ui/card'
import { CopiarCodigo } from '@/components/cursos/copiar-codigo'
import { QuitarAlumno } from '@/components/cursos/quitar-alumno'
import { EliminarAsignacion } from '@/components/cursos/eliminar-asignacion'

// El detalle depende de inscripciones/tareas que cambian con frecuencia
// (nuevo alumno, nueva entrega): siempre fresco.
export const dynamic = 'force-dynamic'

export default async function CursoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const actor = await requireActor()

  const curso = await cargarCursoPorId(Number(id), actor.userId)
  if (!curso) notFound()

  const asignaciones = await listarAsignacionesDeCurso(curso.id, actor.userId)
  const linkInscripcion = `${process.env.BETTER_AUTH_URL ?? ''}/unirse/${curso.joinCode}`

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          🎓 {curso.nombre}
        </h1>
        <p className="text-sm text-muted-foreground">
          {curso.alumnos.length === 1
            ? '1 alumno'
            : `${curso.alumnos.length} alumnos`}
          {' · '}
          {asignaciones.length === 1
            ? '1 tarea'
            : `${asignaciones.length} tareas`}
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Código de inscripción
        </h2>
        <p className="text-sm text-muted-foreground">
          Comparte este link con tus alumnos para que se unan al curso.
        </p>
        <CopiarCodigo codigo={curso.joinCode} texto={linkInscripcion} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Alumnos
        </h2>
        {curso.alumnos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Aún no hay alumnos inscritos. Comparte el link de arriba.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {curso.alumnos.map((a) => (
              <Card key={a.id} size="sm">
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">
                      👤 {a.nombre}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {a.email}
                    </span>
                  </div>
                  <QuitarAlumno
                    cursoId={curso.id}
                    estudianteId={a.id}
                    nombre={a.nombre}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Tareas
        </h2>
        {asignaciones.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Aún no has asignado ninguna prueba a este curso. Ve a{' '}
              <Link href="/mis-pruebas" className="underline">
                Mis Pruebas
              </Link>{' '}
              y asígnala.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {asignaciones.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/cursos/${curso.id}/tareas/${a.id}`}
                      className="truncate font-medium text-foreground hover:underline"
                    >
                      {a.titulo}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {a.nEntregas}/{a.nAlumnos} entregadas
                      {a.fechaLimite
                        ? ` · hasta el ${a.fechaLimite.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}`
                        : ''}
                    </p>
                  </div>
                  <EliminarAsignacion id={a.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
