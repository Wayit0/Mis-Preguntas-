'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { quitarAlumno } from '@/lib/actions/cursos'
import { Button } from '@/components/ui/button'

/**
 * Quita a un alumno del curso (borra la inscripción; sus entregas quedan
 * intactas). Pide confirmación porque no hay deshacer desde la UI.
 */
export function QuitarAlumno({
  cursoId,
  estudianteId,
  nombre,
}: {
  cursoId: number
  estudianteId: number
  /** Solo para el mensaje de confirmación. */
  nombre: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function onClick() {
    if (!window.confirm(`¿Quitar a ${nombre} del curso?`)) return
    setError(null)
    setPendiente(true)
    try {
      const r = await quitarAlumno(cursoId, estudianteId)
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo quitar al alumno.')
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
        {pendiente ? 'Quitando…' : 'Quitar'}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
