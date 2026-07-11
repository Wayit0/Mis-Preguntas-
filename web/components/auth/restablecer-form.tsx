'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { mensajeErrorAuth } from '@/lib/auth-errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

/**
 * `token` y `errorCode` llegan de la query con que better-auth redirige tras
 * abrir el enlace del correo: `?token=...` (válido) o `?error=INVALID_TOKEN`.
 */
export function RestablecerForm({
  token,
  errorCode,
}: {
  token: string | null
  errorCode: string | null
}) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(
    errorCode ? mensajeErrorAuth(errorCode) : null,
  )
  const [cargando, setCargando] = useState(false)
  const [listo, setListo] = useState(false)

  // Sin token válido no tiene sentido mostrar el formulario.
  const enlaceInvalido = !token || Boolean(errorCode)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!token) {
      setError('El enlace de recuperación no es válido o expiró.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (password !== password2) {
      setError('Las contraseñas no coinciden')
      return
    }
    setCargando(true)
    const { error: authError } = await authClient.resetPassword({
      newPassword: password,
      token,
    })
    if (authError) {
      setError(mensajeErrorAuth(authError.code))
      setCargando(false)
      return
    }
    setListo(true)
  }

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-6 pt-6">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Nueva contraseña
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Elige una contraseña nueva para tu cuenta.
          </p>
        </div>

        {listo ? (
          <>
            <div
              role="status"
              className="rounded-md border border-primary/30 bg-primary/5 px-3 py-3 text-sm leading-relaxed text-muted-foreground"
            >
              ✅ Tu contraseña se actualizó. Ya puedes iniciar sesión con ella.
            </div>
            <Button className="w-full" onClick={() => router.push('/login')}>
              Iniciar sesión
            </Button>
          </>
        ) : enlaceInvalido ? (
          <>
            <p role="alert" className="text-sm text-destructive">
              {error ??
                'El enlace de recuperación no es válido o expiró. Solicítalo de nuevo.'}
            </p>
            <Button
              className="w-full"
              onClick={() => router.push('/recuperar')}
            >
              Solicitar un nuevo enlace
            </Button>
          </>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Nueva contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password2">Repetir contraseña</Label>
              <Input
                id="password2"
                name="password2"
                type="password"
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" disabled={cargando} className="w-full">
              {cargando ? 'Guardando…' : 'Guardar contraseña'}
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
