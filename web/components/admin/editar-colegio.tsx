'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { editarColegio } from '@/lib/actions/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Edición inline del nombre de un colegio (admin global). La server action
 * impone el guard de rol. Solo se habilita «Guardar» si el nombre cambió.
 */
export function EditarColegio({
  id,
  nombreInicial,
}: {
  id: number
  nombreInicial: string
}) {
  const router = useRouter()
  const [nombre, setNombre] = useState(nombreInicial)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  const sinCambios = nombre.trim() === nombreInicial.trim() || !nombre.trim()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPendiente(true)
    try {
      const r = await editarColegio(id, nombre)
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo guardar el cambio.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Nombre del colegio ${nombreInicial}`}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="h-9"
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={pendiente || sinCambios}
          className="shrink-0"
        >
          {pendiente ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}
