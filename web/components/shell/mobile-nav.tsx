'use client'

import { createContext, useContext, useMemo, useState } from 'react'

interface MobileNavValue {
  abierto: boolean
  abrir: () => void
  cerrar: () => void
}

const MobileNavContext = createContext<MobileNavValue | null>(null)

// Provee el estado del menú lateral en móvil. El layout (server) lo monta una sola
// vez envolviendo al sidebar (que se colapsa) y al topbar (que tiene el botón ☰).
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false)

  const value = useMemo<MobileNavValue>(
    () => ({
      abierto,
      abrir: () => setAbierto(true),
      cerrar: () => setAbierto(false),
    }),
    [abierto],
  )

  return (
    <MobileNavContext.Provider value={value}>
      {children}
    </MobileNavContext.Provider>
  )
}

export function useMobileNav(): MobileNavValue {
  const ctx = useContext(MobileNavContext)
  if (!ctx) {
    throw new Error('useMobileNav debe usarse dentro de <MobileNavProvider>')
  }
  return ctx
}
