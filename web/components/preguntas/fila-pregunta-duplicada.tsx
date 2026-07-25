import { Badge } from '@/components/ui/badge'
import type { Pregunta } from '@/lib/queries/preguntas'
import { LatexText } from './latex-text'

/**
 * Fila compacta de una pregunta dentro de un grupo de duplicadas, con un
 * checkbox para marcarla a eliminar. Pensada para vivir dentro de un único
 * `<form action={eliminarPreguntasEnLote}>` que agrupa todos los grupos.
 */
export function FilaPreguntaDuplicada({ p }: { p: Pregunta }) {
  const badge =
    [p.materia, p.contenido].filter(Boolean).join(' · ') || 'Sin clasificar'

  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 hover:border-destructive/40">
      <input
        type="checkbox"
        name="id"
        value={p.id}
        className="mt-1 h-4 w-4 shrink-0 accent-destructive"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">#{p.id}</span>
          <Badge variant="secondary">{badge}</Badge>
          {p.compartida ? <Badge>● Compartida</Badge> : null}
        </div>
        <LatexText text={p.pregunta} className="text-sm text-foreground" />
      </div>
    </label>
  )
}
