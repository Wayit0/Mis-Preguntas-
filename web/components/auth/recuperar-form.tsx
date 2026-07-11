'use client'

import { useState } from 'react'
import Link from 'next/link'
import { z } from 'zod'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

const emailSchema = z.string().email()

export function RecuperarForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!emailSchema.safeParse(email).success) {
      setError('Correo electrónico no válido')
      return
    }
    setCargando(true)
    // No revelamos si el correo existe: better-auth responde igual y siempre
    // mostramos el mismo mensaje de confirmación (evita enumeración de usuarios).
    await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/restablecer`,
    })
    setEnviado(true)
    setCargando(false)
  }

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-6 pt-6">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Recupera tu contraseña
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingresa tu correo y te enviaremos un enlace para elegir una nueva.
          </p>
        </div>

        {enviado ? (
          <div
            role="status"
            className="rounded-md border border-primary/30 bg-primary/5 px-3 py-3 text-sm leading-relaxed text-muted-foreground"
          >
            Si existe una cuenta con{' '}
            <strong className="font-medium text-foreground">{email}</strong>, te
            enviamos un enlace para restablecer tu contraseña. Revisa tu correo
            (y la carpeta de spam). El enlace vence en 1 hora.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.cl"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" disabled={cargando} className="w-full">
              {cargando ? 'Enviando…' : 'Enviar enlace'}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-primary hover:underline"
          >
            Volver a iniciar sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
