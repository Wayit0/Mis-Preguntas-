'use client'

import { useSeleccionPreguntas } from './seleccion-context'

/** Checkbox de selección de una tarjeta de pregunta para acciones en lote. */
export function CheckboxPregunta({ id }: { id: number }) {
  const { estaSeleccionado, alternar } = useSeleccionPreguntas()

  return (
    <input
      type="checkbox"
      aria-label="Seleccionar pregunta"
      checked={estaSeleccionado(id)}
      onChange={() => alternar(id)}
      className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
    />
  )
}
