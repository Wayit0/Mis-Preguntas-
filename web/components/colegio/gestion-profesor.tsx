'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  suspenderProfesor,
  reactivarProfesor,
  quitarProfesor,
} from '@/lib/actions/colegio'
import { buttonVariants } from '@/components/ui/button'

type Resultado = { error: string } | { ok: true }
type Accion = 'suspender' | 'reactivar' | 'eliminar'

const CLASE = 'h-9 px-3 sm:h-7 sm:px-2.5'

/**
 * Acciones de gestión de un profesor del colegio: suspender / reactivar y
 * eliminar del colegio. Cada acción llama a su server action (que impone el
 * guard de "mismo colegio + admin"), muestra el error legible si lo hay y
 * refresca la lista. Al suspender/eliminar, el contenido del profesor PERMANECE
 * en el colegio (anclado por colegio_id).
 */
export function GestionProfesor({
  userId,
  banned,
  esYo,
}: {
  userId: number
  banned: boolean
  /** true si esta fila es el propio actor (no se muestra "Suspender"). */
  esYo: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState<Accion | null>(null)

  async function ejecutar(
    accion: Accion,
    fn: (id: number) => Promise<Resultado>,
  ) {
    setError(null)
    setPendiente(accion)
    try {
      const r = await fn(userId)
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo completar la acción.')
    } finally {
      setPendiente(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {banned ? (
          <button
            type="button"
            disabled={pendiente !== null}
            onClick={() => ejecutar('reactivar', reactivarProfesor)}
            className={buttonVariants({
              variant: 'secondary',
              size: 'sm',
              className: CLASE,
            })}
          >
            {pendiente === 'reactivar' ? 'Reactivando…' : 'Reactivar'}
          </button>
        ) : !esYo ? (
          <button
            type="button"
            disabled={pendiente !== null}
            onClick={() => ejecutar('suspender', suspenderProfesor)}
            className={buttonVariants({
              variant: 'outline',
              size: 'sm',
              className: CLASE,
            })}
          >
            {pendiente === 'suspender' ? 'Suspendiendo…' : 'Suspender'}
          </button>
        ) : null}

        <button
          type="button"
          disabled={pendiente !== null}
          onClick={() => ejecutar('eliminar', quitarProfesor)}
          className={buttonVariants({
            variant: 'destructive',
            size: 'sm',
            className: CLASE,
          })}
        >
          {pendiente === 'eliminar' ? 'Eliminando…' : 'Eliminar del colegio'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
