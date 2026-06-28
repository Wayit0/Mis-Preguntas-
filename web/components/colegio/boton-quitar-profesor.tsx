'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { quitarProfesor } from '@/lib/actions/colegio'
import { buttonVariants } from '@/components/ui/button'

/**
 * Botón para quitar a un profesor del colegio. Llama a la server action (que
 * impone el guard de "mismo colegio + school_admin" y la regla del único admin)
 * y refresca la lista. Si la action devuelve un error legible, lo muestra.
 */
export function BotonQuitarProfesor({ userId }: { userId: number }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function onClick() {
    setError(null)
    setPendiente(true)
    try {
      const r = await quitarProfesor(userId)
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo quitar al profesor.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pendiente}
        className={buttonVariants({
          variant: 'destructive',
          size: 'sm',
          className: 'h-9 px-3 sm:h-7 sm:px-2.5',
        })}
      >
        {pendiente ? 'Quitando…' : 'Quitar'}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
