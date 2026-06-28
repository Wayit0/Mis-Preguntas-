import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { eliminarTexto } from '@/lib/actions/textos'
import { VISIBILIDAD_TEXTO } from '@/lib/validation/texto'
import type { Texto } from '@/lib/queries/textos'

/** Texto recortado para la vista previa de la tarjeta. */
function preview(contenido: string, max = 220): string {
  const limpio = contenido.trim()
  return limpio.length > max ? `${limpio.slice(0, max).trimEnd()}…` : limpio
}

function etiquetaVisibilidad(compartida: number | null): string {
  return (
    VISIBILIDAD_TEXTO.find((v) => v.valor === (compartida ?? 0))?.etiqueta ??
    VISIBILIDAD_TEXTO[0].etiqueta
  )
}

export function TarjetaTexto({
  texto,
  nPreguntas,
}: {
  texto: Texto
  /** Nº de preguntas asociadas a este texto. */
  nPreguntas: number
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            📰 {texto.titulo}
          </h2>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {etiquetaVisibilidad(texto.compartida)}
          </span>
        </div>

        <p className="whitespace-pre-line text-sm text-muted-foreground">
          {preview(texto.contenido)}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {nPreguntas === 1
              ? '1 pregunta asociada'
              : `${nPreguntas} preguntas asociadas`}
          </Badge>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <form action={eliminarTexto.bind(null, texto.id)}>
            <button
              type="submit"
              className={buttonVariants({
                variant: 'destructive',
                size: 'sm',
                className: 'h-9 px-3 sm:h-7 sm:px-2.5',
              })}
            >
              🗑 Eliminar texto
            </button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}
