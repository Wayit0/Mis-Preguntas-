import Link from 'next/link'
import { requireEstudiante } from '@/lib/authz'
import { listarTareasDeEstudiante } from '@/lib/queries/tareas'
import { cursosDeEstudiante } from '@/lib/queries/cursos'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { UnirseACurso } from '@/components/estudiante/unirse-a-curso'

// La lista depende de la sesión y del estado de las entregas: siempre fresca.
export const dynamic = 'force-dynamic'

const ETIQUETA_ESTADO = {
  pendiente: { texto: 'Pendiente', clase: 'text-primary' },
  entregada: { texto: 'Entregada', clase: 'text-muted-foreground' },
  vencida: { texto: 'Vencida', clase: 'text-destructive' },
} as const

export default async function TareasPage({
  searchParams,
}: {
  searchParams: Promise<{ curso?: string }>
}) {
  const actor = await requireEstudiante()
  const { curso: cursoParam } = await searchParams
  const cursoIdRaw = cursoParam ? Number(cursoParam) : NaN
  const cursoIdActivo = Number.isInteger(cursoIdRaw) ? cursoIdRaw : null

  const [tareasTodas, cursos] = await Promise.all([
    listarTareasDeEstudiante(actor.userId),
    cursosDeEstudiante(actor.userId),
  ])
  // Si el filtro apunta a un curso del que ya no eres parte (o inexistente),
  // se ignora y se muestran todas — evita una lista vacía confusa.
  const filtroValido = cursoIdActivo != null && cursos.some((c) => c.id === cursoIdActivo)
  const tareas = filtroValido
    ? tareasTodas.filter((t) => t.cursoId === cursoIdActivo)
    : tareasTodas

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Mis tareas</h1>
        <UnirseACurso />
      </div>
      {cursos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no estás en ningún curso. Pídele el código a tu profesor.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {cursos.map((c) => {
            const activo = filtroValido && c.id === cursoIdActivo
            return (
              <Link key={c.id} href={activo ? '/tareas' : `/tareas?curso=${c.id}`}>
                <Badge variant={activo ? 'default' : 'secondary'}>
                  🎓 {c.nombre}
                </Badge>
              </Link>
            )
          })}
        </div>
      )}
      {tareas.length === 0 && cursos.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {filtroValido
            ? 'Este curso no tiene tareas asignadas todavía.'
            : 'Todavía no tienes tareas asignadas.'}
        </p>
      ) : null}
      {tareas.map((t) => {
        const e = ETIQUETA_ESTADO[t.estado]
        return (
          <Link key={t.id} href={`/tareas/${t.id}`}>
            <Card>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{t.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.curso}
                    {t.asignatura ? ` · ${t.asignatura}` : ''}
                    {t.fechaLimite
                      ? ` · hasta el ${t.fechaLimite.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}`
                      : ''}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-medium ${e.clase}`}>
                  {t.estado === 'entregada' && t.total ? `${t.puntaje}/${t.total}` : e.texto}
                </span>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
