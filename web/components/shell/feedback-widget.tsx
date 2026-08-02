'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { MessageCircle } from 'lucide-react'

import { enviarFeedback } from '@/lib/actions/feedback'
import { MAX_LARGO_COMENTARIO_FEEDBACK } from '@/lib/validation/feedback'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

// Puntajes 1–5 con su cara. El emoji es la UI; el número es lo que se guarda.
const PUNTAJES = [
  { valor: 1, emoji: '😠', etiqueta: 'Muy malo' },
  { valor: 2, emoji: '🙁', etiqueta: 'Malo' },
  { valor: 3, emoji: '😐', etiqueta: 'Regular' },
  { valor: 4, emoji: '🙂', etiqueta: 'Bueno' },
  { valor: 5, emoji: '😍', etiqueta: 'Excelente' },
] as const

/**
 * Botón flotante de feedback, visible en toda la app autenticada (lo monta el
 * layout del shell). Abre un diálogo con puntaje 1–5 y comentario opcional;
 * guarda también la ruta actual para saber de qué pantalla habla el usuario.
 */
export function FeedbackWidget() {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)
  const [puntaje, setPuntaje] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reiniciar() {
    setPuntaje(null)
    setComentario('')
    setEnviando(false)
    setEnviado(false)
    setError(null)
  }

  async function onEnviar() {
    if (puntaje == null) {
      setError('Elige una carita para contarnos cómo fue tu experiencia.')
      return
    }
    setError(null)
    setEnviando(true)
    try {
      const res = await enviarFeedback({
        pagina: pathname,
        puntaje,
        comentario,
      })
      if (!res.ok) {
        setError(res.error)
        setEnviando(false)
        return
      }
      setEnviado(true)
    } catch {
      setError('No pudimos enviar tu feedback. Inténtalo de nuevo.')
      setEnviando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reiniciar()
          setAbierto(true)
        }}
        aria-label="Enviar feedback"
        title="Enviar feedback"
        className="fixed right-4 bottom-4 z-40 flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 print:hidden"
      >
        <MessageCircle className="size-5" aria-hidden />
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-md">
          {enviado ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span aria-hidden className="text-3xl">
                🙌
              </span>
              <DialogTitle>¡Gracias por tu feedback!</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Lo leemos de verdad: nos ayuda a mejorar EduBox.
              </p>
              <Button type="button" onClick={() => setAbierto(false)}>
                Cerrar
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <DialogTitle>Cuéntanos qué te parece EduBox</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Tu opinión llega directo al equipo. ¿Cómo ha sido tu
                  experiencia en esta pantalla?
                </p>
              </div>

              <div
                role="radiogroup"
                aria-label="Puntaje"
                className="flex items-center justify-between gap-1"
              >
                {PUNTAJES.map((p) => (
                  <button
                    key={p.valor}
                    type="button"
                    role="radio"
                    aria-checked={puntaje === p.valor}
                    aria-label={p.etiqueta}
                    title={p.etiqueta}
                    onClick={() => setPuntaje(p.valor)}
                    className={cn(
                      'flex size-11 items-center justify-center rounded-full text-2xl transition-transform hover:scale-110',
                      puntaje === p.valor
                        ? 'bg-primary/15 ring-2 ring-primary'
                        : 'grayscale hover:grayscale-0',
                    )}
                  >
                    <span aria-hidden>{p.emoji}</span>
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="feedback-comentario">
                  Comentario (opcional)
                </Label>
                <Textarea
                  id="feedback-comentario"
                  value={comentario}
                  maxLength={MAX_LARGO_COMENTARIO_FEEDBACK}
                  onChange={(e) => setComentario(e.target.value)}
                  rows={3}
                  placeholder="¿Qué mejorarías? ¿Qué te gustó? ¿Encontraste algún problema?"
                />
              </div>

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAbierto(false)}
                  disabled={enviando}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={onEnviar} disabled={enviando}>
                  {enviando ? 'Enviando…' : 'Enviar feedback'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
