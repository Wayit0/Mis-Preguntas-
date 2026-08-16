'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { adoptarPreguntasCompartidas } from '@/lib/actions/preguntas'
import { opcionesIndentadas } from '@/components/carpetas/mover-a-carpeta'
import type { Carpeta } from '@/lib/queries/carpetas'
import { useSeleccionPreguntas } from './seleccion-context'

const SIN_CARPETA = '__sin_carpeta__'

/**
 * Barra flotante para "adoptar" preguntas de colegas seleccionadas en el
 * Banco Compartido: crea una copia privada en el banco propio, clasificada en
 * la carpeta elegida. A diferencia de "mover a carpeta" (idempotente), cada
 * llamada inserta filas nuevas, así que el destino se elige aparte y la
 * acción sólo se dispara al pulsar el botón (no en el onChange del select).
 */
export function BarraAdopcionPreguntas({ carpetas }: { carpetas: Carpeta[] }) {
  const { seleccionados, limpiar } = useSeleccionPreguntas()
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [destino, setDestino] = useState('')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const opciones = opcionesIndentadas(carpetas)

  if (seleccionados.length === 0) return null

  function agregar() {
    const carpetaId = destino === '' || destino === SIN_CARPETA ? null : Number(destino)
    iniciar(async () => {
      const res = await adoptarPreguntasCompartidas(seleccionados, carpetaId)
      if ('error' in res) {
        setMensaje(res.error)
        return
      }
      const base = `${res.agregadas} ${res.agregadas === 1 ? 'pregunta agregada' : 'preguntas agregadas'} a tu banco.`
      setMensaje(res.yaExistian > 0 ? `${base} ${res.yaExistian} ya la tenías.` : base)
      limpiar()
      router.refresh()
    })
  }

  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-card p-3 shadow-sm">
      <span className="text-sm font-medium text-foreground">
        {seleccionados.length}{' '}
        {seleccionados.length === 1 ? 'seleccionada' : 'seleccionadas'}
      </span>

      <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <span aria-hidden>📁</span>
        <select
          aria-label="Carpeta destino"
          value={destino}
          onChange={(e) => {
            setDestino(e.target.value)
            setMensaje(null)
          }}
          disabled={pendiente}
          className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground disabled:opacity-60"
        >
          <option value="">Sin carpeta</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={agregar}
        disabled={pendiente}
        className={buttonVariants({ variant: 'default', size: 'sm' })}
      >
        ➕ Agregar a mi banco
      </button>

      {mensaje ? (
        <span className="text-xs text-muted-foreground">{mensaje}</span>
      ) : null}

      <button
        type="button"
        onClick={() => {
          limpiar()
          setMensaje(null)
        }}
        disabled={pendiente}
        className={buttonVariants({
          variant: 'ghost',
          size: 'sm',
          className: 'ml-auto',
        })}
      >
        ✕ Cancelar
      </button>
    </div>
  )
}
