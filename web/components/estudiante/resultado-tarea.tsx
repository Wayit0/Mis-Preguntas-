import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { LatexText } from '@/components/preguntas/latex-text'
import { LETRAS } from '@/lib/validation/pregunta'
import { imageUrl } from '@/lib/storage/blob'
import { cn } from '@/lib/utils'
import type { TareaEstudiante } from '@/lib/queries/tareas'
import type { PreguntaSnapshot } from '@/lib/tareas/contenido'

/* eslint-disable @next/next/no-img-element */

function PreguntaResultado({
  p,
  i,
  respuesta,
  dibujo,
}: {
  p: PreguntaSnapshot
  i: number
  respuesta: string | undefined
  dibujo: string | undefined
}) {
  const esSeleccion = p.tipo === 'seleccion_multiple'
  const tieneCorrecta = !!p.correcta?.trim()
  const acerto =
    esSeleccion && tieneCorrecta && !!respuesta && respuesta.trim().toUpperCase() ===
      p.correcta!.trim().toUpperCase()

  return (
    <Card
      className={cn(
        esSeleccion && tieneCorrecta
          ? acerto
            ? 'border-2 border-primary'
            : 'border-2 border-destructive'
          : undefined,
      )}
    >
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="text-sm font-medium">
          {i + 1}. <LatexText text={p.enunciado} />
        </p>
        {p.imagenPregunta ? (
          <img
            src={imageUrl(p.imagenPregunta)}
            alt="Imagen de la pregunta"
            className="max-h-48 w-fit max-w-full rounded-md border border-border object-contain"
          />
        ) : null}

        {esSeleccion ? (
          <>
            <div className="flex flex-col gap-1.5 text-sm">
              {LETRAS.filter((l) => p[l]).map((l) => {
                const claveImagen = `imagen${l}` as
                  | 'imagenA'
                  | 'imagenB'
                  | 'imagenC'
                  | 'imagenD'
                  | 'imagenE'
                const imagen = p[claveImagen]
                const esElegida = respuesta === l
                // Misma normalización que `acerto` arriba y que `corregir()`
                // en el servidor (trim + mayúsculas), para que el ✓ nunca
                // contradiga el borde verde/rojo de la tarjeta.
                const esCorrecta = tieneCorrecta && p.correcta!.trim().toUpperCase() === l
                return (
                  <div
                    key={l}
                    className={cn(
                      'flex flex-wrap items-center gap-1.5',
                      esCorrecta && 'font-semibold text-primary',
                      esElegida && !esCorrecta && 'text-destructive',
                    )}
                  >
                    <span>{l})</span>
                    <LatexText text={p[l] ?? ''} />
                    {imagen ? (
                      <img
                        src={imageUrl(imagen)}
                        alt={`Imagen de la alternativa ${l}`}
                        className="max-h-16 w-fit max-w-full rounded border border-border object-contain"
                      />
                    ) : null}
                    {esElegida ? <span aria-label="tu respuesta">← tu respuesta</span> : null}
                    {esCorrecta ? <span aria-label="correcta">✓</span> : null}
                  </div>
                )
              })}
            </div>
            {tieneCorrecta ? (
              <p className="text-xs text-muted-foreground">
                Correcta: {p.correcta}
                {!respuesta && !dibujo ? ' (no respondiste)' : ''}
              </p>
            ) : null}
            {p.explicacion ? (
              <div className="rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">
                <LatexText text={p.explicacion} />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p className="whitespace-pre-wrap rounded-md border border-border bg-background p-2 text-sm">
              {respuesta || (dibujo ? '(ver dibujo abajo)' : 'No respondiste esta pregunta.')}
            </p>
            <p className="text-xs text-muted-foreground">La revisará tu profesor.</p>
          </>
        )}

        {dibujo ? (
          <img
            src={imageUrl(dibujo)}
            alt="Tu desarrollo dibujado"
            className="w-full max-w-md rounded-md border border-border bg-white object-contain"
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

export function ResultadoTarea({
  tarea,
  puedeRehacer,
}: {
  tarea: Extract<TareaEstudiante, { entregada: true }>
  puedeRehacer: boolean
}) {
  // Contador global: mismo orden que aplanarPreguntas() del servidor (textos
  // primero, luego sueltas) — el índice es la clave de `tarea.respuestas`.
  let indice = 0

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold">{tarea.titulo}</h1>
        <p className="text-sm text-muted-foreground">{tarea.curso}</p>
        {tarea.instrucciones ? (
          <p className="mt-2 text-sm text-foreground">
            <LatexText text={tarea.instrucciones} />
          </p>
        ) : null}
      </div>

      {tarea.total > 0 ? (
        <p className="font-heading text-lg font-semibold text-foreground">
          Tu resultado: {tarea.puntaje}/{tarea.total}
        </p>
      ) : null}

      {tarea.contenido.textos.map((t, ti) => (
        <div key={ti} className="flex flex-col gap-3">
          <Card>
            <CardContent className="flex flex-col gap-2 p-4">
              <p className="font-heading text-base font-semibold">{t.titulo}</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                <LatexText text={t.contenido} />
              </p>
            </CardContent>
          </Card>
          {t.preguntas.map((p) => {
            const i = indice++
            return (
              <PreguntaResultado
                key={i}
                p={p}
                i={i}
                respuesta={tarea.respuestas[String(i)]}
                dibujo={tarea.dibujos[String(i)]}
              />
            )
          })}
        </div>
      ))}

      {tarea.contenido.preguntas.map((p) => {
        const i = indice++
        return (
          <PreguntaResultado
            key={i}
            p={p}
            i={i}
            respuesta={tarea.respuestas[String(i)]}
            dibujo={tarea.dibujos[String(i)]}
          />
        )
      })}

      {puedeRehacer ? (
        <Link
          href={`/tareas/${tarea.id}?rehacer=1`}
          className={buttonVariants({ variant: 'outline', className: 'self-start' })}
        >
          🔁 Rehacer evaluación
        </Link>
      ) : null}
    </div>
  )
}
