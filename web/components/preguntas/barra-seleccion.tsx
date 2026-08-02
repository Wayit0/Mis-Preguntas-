'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { moverItems } from '@/lib/actions/carpetas'
import { cambiarCompartidaEnLote } from '@/lib/actions/preguntas'
import { opcionesIndentadas } from '@/components/carpetas/mover-a-carpeta'
import type { Carpeta } from '@/lib/queries/carpetas'
import { useSeleccionPreguntas } from './seleccion-context'

const SIN_CARPETA = '__sin_carpeta__'

/**
 * Barra flotante que aparece cuando hay preguntas seleccionadas: permite
 * moverlas todas a una carpeta o compartirlas/hacerlas privadas en un solo
 * paso, en vez de repetir la acción tarjeta por tarjeta.
 */
export function BarraSeleccionPreguntas({ carpetas }: { carpetas: Carpeta[] }) {
  const { seleccionados, limpiar } = useSeleccionPreguntas()
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const opciones = opcionesIndentadas(carpetas)

  if (seleccionados.length === 0) return null

  function moverA(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    const carpetaId = val === SIN_CARPETA ? null : Number(val)
    e.target.value = ''
    iniciar(async () => {
      await moverItems('preguntas', seleccionados, carpetaId)
      limpiar()
      router.refresh()
    })
  }

  function compartir(valor: 0 | 1) {
    iniciar(async () => {
      await cambiarCompartidaEnLote(seleccionados, valor)
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
          aria-label="Mover seleccionadas a carpeta"
          defaultValue=""
          onChange={moverA}
          disabled={pendiente}
          className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground disabled:opacity-60"
        >
          <option value="" disabled>
            Mover a…
          </option>
          <option value={SIN_CARPETA}>Sin carpeta</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => compartir(1)}
        disabled={pendiente}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        🌐 Compartir
      </button>

      <button
        type="button"
        onClick={() => compartir(0)}
        disabled={pendiente}
        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
      >
        🔒 Hacer privadas
      </button>

      <button
        type="button"
        onClick={limpiar}
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
