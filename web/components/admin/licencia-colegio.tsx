'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fijarLicenciaColegio } from '@/lib/actions/suscripciones-admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface ColegioLicencia {
  id: number
  nombre: string
  licenciaHasta: Date | null
  licenciaNota: string | null
}

const fecha = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
    : null

/**
 * Fila de licencia B2B de un colegio (admin global). Muestra el estado actual
 * (vigente/vencida/sin licencia) y permite fijar un nuevo vencimiento+nota o
 * cortar la licencia de inmediato. La server action impone el guard de rol.
 */
export function LicenciaColegio({ colegio }: { colegio: ColegioLicencia }) {
  const router = useRouter()
  const [fechaInput, setFechaInput] = useState('')
  const [nota, setNota] = useState(colegio.licenciaNota ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  const vigente = colegio.licenciaHasta != null && colegio.licenciaHasta > new Date()
  const vencida = colegio.licenciaHasta != null && !vigente

  async function guardar() {
    setError(null)
    if (!fechaInput) {
      setError('Elige una fecha de vencimiento.')
      return
    }
    setPendiente(true)
    try {
      const hastaISO = new Date(`${fechaInput}T23:59:59`).toISOString()
      const r = await fijarLicenciaColegio(colegio.id, hastaISO, nota)
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo guardar la licencia.')
    } finally {
      setPendiente(false)
    }
  }

  async function cortar() {
    if (!window.confirm(`¿Cortar la licencia de «${colegio.nombre}»? Sus profesores perderán Pro por colegio.`)) {
      return
    }
    setError(null)
    setPendiente(true)
    try {
      const r = await fijarLicenciaColegio(colegio.id, null, nota)
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo cortar la licencia.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-foreground">🏫 {colegio.nombre}</span>
        <span
          className={cn(
            'text-xs font-medium',
            vigente
              ? 'text-emerald-600 dark:text-emerald-400'
              : vencida
                ? 'text-destructive'
                : 'text-muted-foreground',
          )}
        >
          {vigente
            ? `Vigente hasta ${fecha(colegio.licenciaHasta)}`
            : vencida
              ? `Venció el ${fecha(colegio.licenciaHasta)}`
              : 'Sin licencia'}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={`licencia-fecha-${colegio.id}`} className="text-xs text-muted-foreground">
            Nuevo vencimiento
          </label>
          <Input
            id={`licencia-fecha-${colegio.id}`}
            type="date"
            value={fechaInput}
            onChange={(e) => setFechaInput(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={`licencia-nota-${colegio.id}`} className="text-xs text-muted-foreground">
            Nota
          </label>
          <Input
            id={`licencia-nota-${colegio.id}`}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej: factura 123"
            className="h-9"
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pendiente} onClick={guardar}>
            {pendiente ? 'Guardando…' : 'Guardar'}
          </Button>
          {colegio.licenciaHasta != null ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pendiente}
              onClick={cortar}
            >
              Cortar licencia
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
