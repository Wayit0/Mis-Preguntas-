'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { invitarPorEmail } from '@/lib/actions/colegio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Formulario para invitar a un profesor por email. Crea una invitación pendiente
 * (sin envío real de correo): el profesor invitado la acepta desde su cuenta. La
 * autorización (solo school_admin del colegio) la impone la server action.
 */
export function InvitarProfesor() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setExito(null)
    setPendiente(true)
    try {
      const r = await invitarPorEmail(email)
      if ('error' in r) {
        setError(r.error)
        return
      }
      setExito(`✅ Invitación creada para ${email.trim().toLowerCase()}.`)
      setEmail('')
      router.refresh()
    } catch {
      setError('No se pudo crear la invitación. Inténtalo de nuevo.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email-profesor">Invitar profesor por email</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="email-profesor"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="profesor@colegio.cl"
            autoComplete="off"
            required
          />
          <Button type="submit" disabled={pendiente} className="sm:w-auto">
            {pendiente ? 'Invitando…' : '✉️ Enviar invitación'}
          </Button>
        </div>
      </div>
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
