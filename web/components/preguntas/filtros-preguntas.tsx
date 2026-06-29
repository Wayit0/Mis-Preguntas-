'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { EstadoCompartida } from '@/lib/queries/preguntas'

const TODAS = '__todas__'

const ESTADOS: { valor: EstadoCompartida; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'compartida', etiqueta: 'Compartidas' },
  { valor: 'privada', etiqueta: 'Privadas' },
]

/**
 * Barra de filtros tipo chips. Materia y nivel son selects; el estado son tres
 * chips. Cada cambio actualiza los searchParams (preservando ?asignatura=) y
 * navega, de modo que la lista (server component) se vuelve a renderizar.
 */
export function FiltrosPreguntas({
  materias,
  niveles,
}: {
  materias: string[]
  niveles: string[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const materiaActual = searchParams.get('materia') ?? ''
  const nivelActual = searchParams.get('nivel') ?? ''
  const estadoActual = (searchParams.get('estado') as EstadoCompartida) || 'todas'

  function setParam(clave: string, valor: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (valor) params.set(clave, valor)
    else params.delete(clave)
    router.push(`/preguntas?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        name="materia"
        value={materiaActual || TODAS}
        onValueChange={(v) =>
          setParam('materia', v === TODAS ? null : (v as string))
        }
      >
        <SelectTrigger
          aria-label="Filtrar por materia"
          className="h-9 rounded-full sm:h-8"
        >
          {/* base-ui muestra el value crudo; mapeamos el centinela a una
              etiqueta legible para que no se filtre "__todas__" a la UI. */}
          <SelectValue placeholder="Materia: Todas">
            {(value: string) => (value === TODAS ? 'Materia: Todas' : value)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Materia: Todas</SelectItem>
          {materias.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        name="nivel"
        value={nivelActual || TODAS}
        onValueChange={(v) =>
          setParam('nivel', v === TODAS ? null : (v as string))
        }
      >
        <SelectTrigger
          aria-label="Filtrar por nivel"
          className="h-9 rounded-full sm:h-8"
        >
          <SelectValue placeholder="Nivel: Todos">
            {(value: string) => (value === TODAS ? 'Nivel: Todos' : value)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Nivel: Todos</SelectItem>
          {niveles.map((n) => (
            <SelectItem key={n} value={n}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        {ESTADOS.map(({ valor, etiqueta }) => {
          const activo = estadoActual === valor
          return (
            <button
              key={valor}
              type="button"
              onClick={() =>
                setParam('estado', valor === 'todas' ? null : valor)
              }
              aria-pressed={activo}
              className={cn(
                'rounded-full border px-3.5 py-2 text-xs font-medium transition-colors sm:py-1',
                activo
                  ? 'border-accent bg-secondary text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted',
              )}
            >
              {valor !== 'todas' ? '● ' : ''}
              {etiqueta}
            </button>
          )
        })}
      </div>
    </div>
  )
}
