import { notFound } from 'next/navigation'
import { requireActor } from '@/lib/authz'
import { cargarResultados } from '@/lib/queries/resultados'
import { aplanarPreguntas } from '@/lib/tareas/contenido'
import { LETRAS } from '@/lib/validation/pregunta'
import { cn } from '@/lib/utils'

// Los resultados cambian con cada entrega nueva: siempre frescos.
export const dynamic = 'force-dynamic'

/**
 * Fecha + hora en español, o vacío si es null. Fija `timeZone` a
 * 'America/Santiago' — el server corre en UTC en Azure, así que sin esto una
 * hora de tarde/noche chilena podría mostrarse con el DÍA equivocado.
 */
function formatoFechaHora(d: Date | null): string {
  if (!d) return ''
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d))
}

export default async function ResultadosPage({
  params,
}: {
  params: Promise<{ id: string; asigId: string }>
}) {
  const { asigId } = await params
  const actor = await requireActor()

  const res = await cargarResultados(Number(asigId), actor.userId)
  if (!res) notFound()

  const preguntas = aplanarPreguntas(res.contenido)
  const entregadas = res.filas.filter((f) => f.entrega)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          {res.titulo}
        </h1>
        <p className="text-sm text-muted-foreground">
          {res.cursoNombre}
          {res.fechaLimite ? ` · hasta el ${formatoFechaHora(res.fechaLimite)}` : ''}
        </p>
        <p className="text-sm text-muted-foreground">
          {entregadas.length}/{res.filas.length} entregadas
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs font-medium uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Alumno</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {res.filas.map((f) => (
              <tr key={f.estudianteId} className="border-t border-border">
                <td className="px-3 py-2 text-foreground">{f.nombre}</td>
                <td className="px-3 py-2">
                  {f.entrega ? (
                    <span className="text-foreground">
                      {f.entrega.puntaje}/{f.entrega.total}
                      {' · '}
                      {formatoFechaHora(f.entrega.enviadoEl)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Pendiente</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {entregadas.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            Detalle por alumno
          </h2>
          {entregadas.map((f) => {
            const entrega = f.entrega!
            return (
              <details
                key={f.estudianteId}
                className="rounded-xl border border-border bg-card p-4"
              >
                <summary className="cursor-pointer font-medium text-foreground">
                  {f.nombre} — {entrega.puntaje}/{entrega.total}
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  {preguntas.map((p, i) => {
                    const respuesta = (entrega.respuestas[String(i)] ?? '').trim()
                    const esSeleccion = p.tipo === 'seleccion_multiple'
                    const tieneCorrecta = !!p.correcta?.trim()
                    return (
                      <div key={i} className="rounded-md border border-border p-3">
                        <p className="text-sm font-medium text-foreground">
                          {i + 1}. {p.enunciado}
                        </p>
                        {esSeleccion ? (
                          <div className="mt-2 flex flex-col gap-1 text-sm">
                            {LETRAS.filter((l) => p[l]).map((l) => {
                              const esCorrecta =
                                tieneCorrecta && p.correcta!.trim().toUpperCase() === l
                              const esElegida = respuesta.toUpperCase() === l
                              return (
                                <div
                                  key={l}
                                  className={cn(
                                    'flex items-center gap-1.5',
                                    esCorrecta && 'font-semibold text-primary',
                                    esElegida && !esCorrecta && 'text-destructive',
                                  )}
                                >
                                  <span>
                                    {l}) {p[l]}
                                  </span>
                                  {esCorrecta ? <span aria-label="correcta">✓</span> : null}
                                  {esElegida && !esCorrecta ? (
                                    <span aria-label="respuesta del alumno (incorrecta)">✗</span>
                                  ) : null}
                                </div>
                              )
                            })}
                            {!respuesta ? (
                              <p className="text-xs text-muted-foreground">
                                No respondió esta pregunta.
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-background p-2 text-sm text-foreground">
                            {respuesta || 'No respondió esta pregunta.'}
                          </p>
                        )}
                      </div>
                    )
                  })}
                  {preguntas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Esta tarea no tiene preguntas.
                    </p>
                  ) : null}
                </div>
              </details>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
