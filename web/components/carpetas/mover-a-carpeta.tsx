'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { moverItems } from '@/lib/actions/carpetas'
import type { Carpeta, TipoContenido } from '@/lib/queries/carpetas'

/** Opciones del select con indentación según la profundidad de cada carpeta. */
export function opcionesIndentadas(
  carpetas: Carpeta[],
): { id: number; etiqueta: string }[] {
  const hijos = new Map<number | null, Carpeta[]>()
  for (const c of carpetas) {
    const arr = hijos.get(c.parentId) ?? []
    arr.push(c)
    hijos.set(c.parentId, arr)
  }
  const orden: { id: number; etiqueta: string }[] = []
  const recorrer = (parentId: number | null, nivel: number) => {
    const lista = (hijos.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    for (const c of lista) {
      orden.push({ id: c.id, etiqueta: `${'  '.repeat(nivel)}${c.nombre}` })
      recorrer(c.id, nivel + 1)
    }
  }
  recorrer(null, 0)
  return orden
}

/**
 * Selector compacto para mover UN ítem a una carpeta (o sacarlo con "Sin
 * carpeta"). Isla client dentro de la tarjeta (server) del ítem.
 */
export function MoverACarpeta({
  tipo,
  id,
  carpetaActual,
  carpetas,
}: {
  tipo: TipoContenido
  id: number
  carpetaActual: number | null
  carpetas: Carpeta[]
}) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const opciones = opcionesIndentadas(carpetas)

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    const nuevo = val === '' ? null : Number(val)
    if (nuevo === carpetaActual) return
    iniciar(async () => {
      await moverItems(tipo, [id], nuevo)
      router.refresh()
    })
  }

  return (
    <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span aria-hidden>📁</span>
      <select
        aria-label="Mover a carpeta"
        value={carpetaActual ?? ''}
        onChange={onChange}
        disabled={pendiente}
        className="h-9 rounded-md border border-border bg-card px-2 text-xs text-foreground disabled:opacity-60 sm:h-7"
      >
        <option value="">Sin carpeta</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </label>
  )
}
