'use client'

import { useSeleccionPreguntas } from './seleccion-context'

/**
 * Checkbox que selecciona/deselecciona de una vez todas las preguntas de la
 * página actual, para poder clasificarlas en carpetas sin marcarlas una por
 * una desde `BarraSeleccionPreguntas`.
 */
export function SeleccionarTodas({ ids }: { ids: number[] }) {
  const { seleccionados, seleccionarTodos, limpiar } = useSeleccionPreguntas()

  if (ids.length === 0) return null

  const todasSeleccionadas = ids.every((id) => seleccionados.includes(id))

  return (
    <label className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground">
      <input
        type="checkbox"
        aria-label="Seleccionar todas las preguntas"
        checked={todasSeleccionadas}
        onChange={() => (todasSeleccionadas ? limpiar() : seleccionarTodos(ids))}
        className="h-4 w-4 cursor-pointer accent-primary"
      />
      Seleccionar todas
    </label>
  )
}
