'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type SeleccionContextValue = {
  seleccionados: number[]
  estaSeleccionado: (id: number) => boolean
  alternar: (id: number) => void
  limpiar: () => void
}

const SeleccionContext = createContext<SeleccionContextValue | null>(null)

/**
 * Contexto client que agrupa la selección de preguntas (checkboxes) para
 * poder aplicarles una acción en lote (mover a carpeta, compartir) desde la
 * barra flotante. Vive en `/preguntas` alrededor de la lista de tarjetas.
 */
export function SeleccionPreguntasProvider({ children }: { children: ReactNode }) {
  const [seleccionados, setSeleccionados] = useState<Set<number>>(() => new Set())

  const value = useMemo<SeleccionContextValue>(
    () => ({
      seleccionados: Array.from(seleccionados),
      estaSeleccionado: (id) => seleccionados.has(id),
      alternar: (id) =>
        setSeleccionados((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        }),
      limpiar: () => setSeleccionados(new Set()),
    }),
    [seleccionados],
  )

  return (
    <SeleccionContext.Provider value={value}>{children}</SeleccionContext.Provider>
  )
}

export function useSeleccionPreguntas(): SeleccionContextValue {
  const ctx = useContext(SeleccionContext)
  if (!ctx) {
    throw new Error(
      'useSeleccionPreguntas debe usarse dentro de <SeleccionPreguntasProvider>',
    )
  }
  return ctx
}
