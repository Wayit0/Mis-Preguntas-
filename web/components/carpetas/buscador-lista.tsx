'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Buscador simple para las listas de pruebas/textos. Al buscar navega a
 * `basePath?busqueda=...` (resultados globales, fuera de la carpeta actual). El
 * botón "Limpiar" vuelve a la navegación por carpetas.
 */
export function BuscadorLista({
  basePath,
  valorInicial = '',
  placeholder = 'Buscar por título…',
}: {
  basePath: string
  valorInicial?: string
  placeholder?: string
}) {
  const router = useRouter()
  const [valor, setValor] = useState(valorInicial)

  function buscar(e: React.FormEvent) {
    e.preventDefault()
    const q = valor.trim()
    router.push(q ? `${basePath}?busqueda=${encodeURIComponent(q)}` : basePath)
  }

  return (
    <form onSubmit={buscar} className="flex items-center gap-2">
      <input
        type="search"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={placeholder}
        className="h-9 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-sm text-foreground"
      />
      <button
        type="submit"
        className="h-9 shrink-0 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
      >
        Buscar
      </button>
      {valorInicial ? (
        <button
          type="button"
          onClick={() => router.push(basePath)}
          className="h-9 shrink-0 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          Limpiar
        </button>
      ) : null}
    </form>
  )
}
