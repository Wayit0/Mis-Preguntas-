'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { joinByCode, aceptarInvitacion } from '@/lib/actions/colegio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import type { InvitacionPendiente } from '@/lib/queries/colegio'

/**
 * Punto de entrada para que un profesor SIN colegio se una a uno: ingresando el
 * código de unión, o aceptando una invitación pendiente que matchee su email.
 * Ambas vías usan server actions que imponen las reglas (código válido, email
 * coincidente, no pertenecer ya a otro colegio).
 */
export function UnirseColegio({
  invitaciones,
}: {
  invitaciones: InvitacionPendiente[]
}) {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)
  const [tokenPendiente, setTokenPendiente] = useState<string | null>(null)

  async function unirsePorCodigo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPendiente(true)
    try {
      const r = await joinByCode(codigo)
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo unir al colegio. Inténtalo de nuevo.')
    } finally {
      setPendiente(false)
    }
  }

  async function aceptar(token: string) {
    setError(null)
    setTokenPendiente(token)
    try {
      const r = await aceptarInvitacion(token)
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo aceptar la invitación.')
    } finally {
      setTokenPendiente(null)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            🏫 Unirse a un colegio
          </h2>
          <p className="text-sm text-muted-foreground">
            Ingresa el código que te dio tu colegio o acepta una invitación.
          </p>
        </div>

        <form onSubmit={unirsePorCodigo} className="flex flex-col gap-1.5">
          <Label htmlFor="codigo-colegio">Código de unión</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="codigo-colegio"
              name="codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Pega aquí el código"
              autoComplete="off"
              required
            />
            <Button type="submit" disabled={pendiente} className="sm:w-auto">
              {pendiente ? 'Uniéndote…' : 'Unirme'}
            </Button>
          </div>
        </form>

        {invitaciones.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">
              Invitaciones pendientes
            </p>
            {invitaciones.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm text-foreground">
                  {inv.colegioNombre}
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => aceptar(inv.token)}
                  disabled={tokenPendiente === inv.token}
                >
                  {tokenPendiente === inv.token ? 'Aceptando…' : 'Aceptar'}
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
