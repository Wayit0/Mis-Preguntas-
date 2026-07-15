'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cancelarSuscripcionDeUsuario } from '@/lib/actions/suscripciones-admin'
import { Button } from '@/components/ui/button'

/**
 * Botón para que el admin global cancele la suscripción de un usuario
 * (reclamos/fraude). Si es de MercadoPago, la cancela también en MP; si es
 * cortesía, la termina de inmediato. Pide confirmación porque es irreversible.
 */
export function CancelarSuscripcion({ userId, email }: { userId: number; email: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function onClick() {
    if (!window.confirm(`¿Cancelar la suscripción de ${email}? Esta acción no se puede deshacer.`)) {
      return
    }
    setError(null)
    setPendiente(true)
    try {
      const r = await cancelarSuscripcionDeUsuario(userId)
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo cancelar la suscripción.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="destructive" size="sm" disabled={pendiente} onClick={onClick}>
        {pendiente ? 'Cancelando…' : 'Cancelar'}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
