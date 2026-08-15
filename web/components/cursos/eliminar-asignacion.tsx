'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { eliminarAsignacion } from '@/lib/actions/asignaciones'
import { Button } from '@/components/ui/button'

/**
 * Elimina una tarea (asignación) del curso. Advierte explícitamente que las
 * entregas de los alumnos también se borran, porque es irreversible.
 */
export function EliminarAsignacion({ id }: { id: number }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function onClick() {
    if (pendiente) return
    if (!window.confirm('Se borrarán también las entregas de los alumnos. ¿Eliminar?')) {
      return
    }
    setError(null)
    setPendiente(true)
    try {
      const r = await eliminarAsignacion(id)
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo eliminar la tarea.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pendiente}
        onClick={onClick}
        className="h-9 px-3 sm:h-7 sm:px-2.5"
      >
        {pendiente ? 'Eliminando…' : '🗑 Eliminar'}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
