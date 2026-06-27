/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { imageUrl } from '@/lib/storage/blob'
import { eliminarPregunta, toggleCompartida } from '@/lib/actions/preguntas'
import { ETIQUETA_TIPO, LETRAS, type TipoPregunta } from '@/lib/validation/pregunta'
import type { Pregunta } from '@/lib/queries/preguntas'
import { LatexText } from './latex-text'

function alternativaTexto(p: Pregunta, letra: string): string | null {
  return (p[letra as 'A' | 'B' | 'C' | 'D' | 'E'] ?? null) as string | null
}

function alternativaImagen(p: Pregunta, letra: string): string | null {
  const clave = `imagen${letra}` as
    | 'imagenA'
    | 'imagenB'
    | 'imagenC'
    | 'imagenD'
    | 'imagenE'
  return p[clave] ?? null
}

export function TarjetaPregunta({
  p,
  autor,
  soloLectura = false,
}: {
  p: Pregunta
  /** Nombre del autor; se muestra en el modo solo lectura (Banco Compartido). */
  autor?: string
  /** En modo solo lectura se ocultan las acciones de edición/compartir/eliminar. */
  soloLectura?: boolean
}) {
  const compartida = (p.compartida ?? 0) > 0
  const tipo = (p.tipo ?? 'seleccion_multiple') as TipoPregunta
  const esSeleccion = tipo === 'seleccion_multiple'

  const badge =
    [p.materia, p.contenido].filter(Boolean).join(' · ') || 'Sin clasificar'

  const hrefEditar = `/preguntas/${p.id}/editar?asignatura=${encodeURIComponent(
    p.asignatura,
  )}`

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="secondary">{badge}</Badge>
          {soloLectura ? (
            autor ? (
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                Publicado por {autor}
              </span>
            ) : null
          ) : (
            <span
              className={cn(
                'shrink-0 text-xs font-medium',
                compartida ? 'text-accent' : 'text-muted-foreground',
              )}
            >
              {compartida ? '● Compartida' : 'Privada'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{ETIQUETA_TIPO[tipo]}</span>
          {p.nivel ? (
            <>
              <span aria-hidden>·</span>
              <span>{p.nivel}</span>
            </>
          ) : null}
        </div>

        <LatexText
          text={p.pregunta}
          className="text-sm font-medium text-foreground"
        />

        {p.imagenPregunta ? (
          <img
            src={imageUrl(p.imagenPregunta)}
            alt="Imagen de la pregunta"
            className="max-h-48 w-fit rounded-md border border-border object-contain"
          />
        ) : null}

        {esSeleccion ? (
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {LETRAS.map((letra) => {
              const texto = alternativaTexto(p, letra)
              const imagen = alternativaImagen(p, letra)
              if (!texto && !imagen) return null
              const correcta = p.correcta === letra
              return (
                <li
                  key={letra}
                  className={cn(
                    'flex flex-wrap items-center gap-1.5',
                    correcta && 'font-semibold text-primary',
                  )}
                >
                  <span>{letra})</span>
                  {texto ? <LatexText text={texto} /> : null}
                  {imagen ? (
                    <img
                      src={imageUrl(imagen)}
                      alt={`Imagen de la alternativa ${letra}`}
                      className="max-h-16 w-fit rounded border border-border object-contain"
                    />
                  ) : null}
                  {correcta ? <span aria-label="correcta">✓</span> : null}
                </li>
              )
            })}
          </ul>
        ) : null}

        {soloLectura ? null : (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <Link
              href={hrefEditar}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              ✏️ Editar
            </Link>

            <form
              action={toggleCompartida.bind(null, p.id, compartida ? 0 : 1)}
            >
              <button
                type="submit"
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                {compartida ? '🔒 Hacer privada' : '🌐 Compartir'}
              </button>
            </form>

            <form action={eliminarPregunta.bind(null, p.id)}>
              <button
                type="submit"
                className={buttonVariants({ variant: 'destructive', size: 'sm' })}
              >
                🗑 Eliminar
              </button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
