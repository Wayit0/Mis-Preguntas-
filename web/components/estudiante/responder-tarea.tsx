'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { entregarTarea } from '@/lib/actions/entregas'
import { LatexText } from '@/components/preguntas/latex-text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LETRAS } from '@/lib/validation/pregunta'
import type { TareaEstudiante } from '@/lib/queries/tareas'
import type { PreguntaEstudiante } from '@/lib/tareas/contenido'

/* eslint-disable @next/next/no-img-element */

// imageUrl no se importa de @/lib/storage/blob para no arrastrar el SDK de
// Azure al bundle del cliente (mismo patrón que formulario-pregunta.tsx). La
// ruta es estable: /api/uploads/<clave>.
function urlImagen(clave: string): string {
  return `/api/uploads/${clave}`
}

/**
 * Una pregunta a responder. Definida fuera de `ResponderTarea` (no anidada en
 * su cuerpo) para que conserve una identidad de componente estable entre
 * renders: si fuera una función declarada dentro del render, React la trataría
 * como un tipo nuevo en cada tecla escrita y remontaría el <textarea>,
 * perdiendo el foco tras cada carácter.
 */
function PreguntaItem({
  p,
  i,
  valor,
  onCambiar,
}: {
  p: PreguntaEstudiante
  i: number
  valor: string
  onCambiar: (valor: string) => void
}) {
  const esSeleccion = p.tipo === 'seleccion_multiple'
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="text-sm font-medium">
          {i + 1}. <LatexText text={p.enunciado} />
        </p>
        {p.imagenPregunta ? (
          <img
            src={urlImagen(p.imagenPregunta)}
            alt="Imagen de la pregunta"
            className="max-h-48 w-fit max-w-full rounded-md border border-border object-contain"
          />
        ) : null}
        {esSeleccion ? (
          <div className="flex flex-col gap-1.5">
            {LETRAS.filter((l) => p[l]).map((l) => {
              const claveImagen = `imagen${l}` as
                | 'imagenA'
                | 'imagenB'
                | 'imagenC'
                | 'imagenD'
                | 'imagenE'
              const imagen = p[claveImagen]
              return (
                <label key={l} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`p-${i}`}
                    checked={valor === l}
                    onChange={() => onCambiar(l)}
                    className="mt-1 accent-primary"
                  />
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span>
                      {l}) <LatexText text={p[l] ?? ''} />
                    </span>
                    {imagen ? (
                      <img
                        src={urlImagen(imagen)}
                        alt={`Imagen de la alternativa ${l}`}
                        className="max-h-16 w-fit max-w-full rounded border border-border object-contain"
                      />
                    ) : null}
                  </span>
                </label>
              )
            })}
          </div>
        ) : (
          <textarea
            rows={4}
            value={valor}
            onChange={(e) => onCambiar(e.target.value)}
            placeholder="Escribe tu respuesta…"
            className="rounded-md border border-border bg-background p-2 text-sm"
          />
        )}
      </CardContent>
    </Card>
  )
}

export function ResponderTarea({
  tarea,
}: {
  tarea: Extract<TareaEstudiante, { entregada: false }>
}) {
  const router = useRouter()
  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  // Lista aplanada con el MISMO orden que el servidor (textos primero), solo
  // para el conteo total; el índice real se calcula al recorrer el contenido
  // abajo, texto por texto, para poder intercalar cada bloque con sus preguntas.
  const totalPreguntas = useMemo(() => {
    const deTextos = tarea.contenido.textos.flatMap((t) => t.preguntas)
    return deTextos.length + tarea.contenido.preguntas.length
  }, [tarea])

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (Object.keys(respuestas).length === 0) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [respuestas])

  function setRespuesta(i: number, valor: string) {
    setRespuestas((r) => ({ ...r, [String(i)]: valor }))
  }

  async function onEnviar() {
    if (!confirm('¿Enviar tus respuestas? No podrás cambiarlas después.')) return
    setPendiente(true)
    setError(null)
    const res = await entregarTarea(tarea.id, respuestas)
    setPendiente(false)
    if ('error' in res) return setError(res.error)
    router.refresh()
  }

  // Contador global: recorre primero las preguntas de cada texto y luego las
  // sueltas, en el mismo orden que aplanarPreguntas() del servidor — el índice
  // es la clave que persiste en `entregas.respuestas`.
  let indice = 0

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold">{tarea.titulo}</h1>
        <p className="text-sm text-muted-foreground">
          {tarea.curso}
          {tarea.fechaLimite
            ? ` · hasta el ${tarea.fechaLimite.toLocaleDateString('es-CL')}`
            : ''}
        </p>
        {tarea.instrucciones ? (
          <p className="mt-2 text-sm text-foreground">
            <LatexText text={tarea.instrucciones} />
          </p>
        ) : null}
      </div>

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
              <PreguntaItem
                key={i}
                p={p}
                i={i}
                valor={respuestas[String(i)] ?? ''}
                onCambiar={(v) => setRespuesta(i, v)}
              />
            )
          })}
        </div>
      ))}

      {tarea.contenido.preguntas.map((p) => {
        const i = indice++
        return (
          <PreguntaItem
            key={i}
            p={p}
            i={i}
            valor={respuestas[String(i)] ?? ''}
            onCambiar={(v) => setRespuesta(i, v)}
          />
        )
      })}

      {totalPreguntas === 0 ? (
        <p className="text-sm text-muted-foreground">Esta tarea no tiene preguntas.</p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button onClick={onEnviar} disabled={pendiente} className="self-start">
        {pendiente ? 'Enviando…' : '📨 Enviar respuestas'}
      </Button>
    </div>
  )
}
