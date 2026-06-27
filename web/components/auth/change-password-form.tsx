'use client'

import { useState } from 'react'
import { z } from 'zod'
import { authClient } from '@/lib/auth-client'
import { mensajeErrorAuth } from '@/lib/auth-errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const schema = z.object({
  actual: z.string().min(1),
  nueva: z.string().min(1),
  repetir: z.string().min(1),
})

export function ChangePasswordForm() {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)
  const [cargando, setCargando] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setExito(false)

    const parsed = schema.safeParse({ actual, nueva, repetir })
    if (!parsed.success) {
      setError('Completa todos los campos')
      return
    }
    if (nueva.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (nueva !== repetir) {
      setError('Las contraseñas no coinciden')
      return
    }

    setCargando(true)
    const { error: authError } = await authClient.changePassword({
      currentPassword: parsed.data.actual,
      newPassword: parsed.data.nueva,
      revokeOtherSessions: true,
    })

    if (authError) {
      setError(
        authError.code === 'INVALID_PASSWORD'
          ? 'Contraseña incorrecta'
          : mensajeErrorAuth(authError.code),
      )
      setCargando(false)
      return
    }

    setActual('')
    setNueva('')
    setRepetir('')
    setExito(true)
    setCargando(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cambiar contraseña</CardTitle>
        <CardDescription>
          Actualiza la contraseña de tu cuenta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="actual">Contraseña actual</Label>
            <Input
              id="actual"
              name="actual"
              type="password"
              autoComplete="current-password"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="nueva">Nueva contraseña</Label>
            <Input
              id="nueva"
              name="nueva"
              type="password"
              autoComplete="new-password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="repetir">Repetir nueva contraseña</Label>
            <Input
              id="repetir"
              name="repetir"
              type="password"
              autoComplete="new-password"
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {exito && (
            <p role="status" className="text-sm text-primary">
              Contraseña actualizada correctamente
            </p>
          )}

          <Button type="submit" disabled={cargando} className="mt-1 w-full">
            {cargando ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
