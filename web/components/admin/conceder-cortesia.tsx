'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { concederCortesia } from '@/lib/actions/suscripciones-admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Formulario para que el admin global conceda Pro de cortesía a un usuario por
 * su correo, con un vencimiento y una nota (piloto, reclamo, etc). La server
 * action impone el guard de rol y valida que no exista ya una suscripción de
 * MercadoPago vigente para ese usuario.
 */
export function ConcederCortesia() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [fecha, setFecha] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setExito(null)
    setPendiente(true)
    try {
      const hastaISO = new Date(`${fecha}T23:59:59`).toISOString()
      const r = await concederCortesia(email, hastaISO, nota)
      if ('error' in r) {
        setError(r.error)
        return
      }
      setExito(`✅ Cortesía concedida a ${email}.`)
      setEmail('')
      setFecha('')
      setNota('')
      router.refresh()
    } catch {
      setError('No se pudo conceder la cortesía. Inténtalo de nuevo.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cortesia-email">Correo del usuario</Label>
          <Input
            id="cortesia-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="profesor@colegio.cl"
            autoComplete="off"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cortesia-fecha">Vigente hasta</Label>
          <Input
            id="cortesia-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cortesia-nota">Nota</Label>
          <Input
            id="cortesia-nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej: piloto liceo A"
          />
        </div>
      </div>
      <Button type="submit" disabled={pendiente} className="sm:w-auto">
        {pendiente ? 'Concediendo…' : '🎁 Conceder cortesía'}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {exito ? (
        <p role="status" className="text-sm text-primary">
          {exito}
        </p>
      ) : null}
    </form>
  )
}
