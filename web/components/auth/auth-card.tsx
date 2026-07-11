'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { authClient } from '@/lib/auth-client'
import { correoRegistrado } from '@/lib/actions/auth-ui'
import { mensajeErrorAuth } from '@/lib/auth-errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { BotonesSociales } from '@/components/auth/botones-sociales'
import type { ProveedorSocial } from '@/lib/auth-social'

type Modo = 'login' | 'registro'

const emailSchema = z.string().email()

export function AuthCard({
  modoInicial = 'login',
  proveedores = [],
}: {
  modoInicial?: Modo
  proveedores?: ProveedorSocial[]
}) {
  const router = useRouter()
  const [modo, setModo] = useState<Modo>(modoInicial)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  function cambiarModo(nuevo: Modo) {
    if (nuevo === modo) return
    setModo(nuevo)
    setError(null)
    // Refleja el modo en la URL sin recargar (deep-link + refresh consistentes).
    window.history.replaceState(null, '', nuevo === 'login' ? '/login' : '/registro')
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!email || !password || (modo === 'registro' && (!nombre || !password2))) {
      setError('Completa todos los campos')
      return
    }
    if (!emailSchema.safeParse(email).success) {
      setError('Correo electrónico no válido')
      return
    }

    if (modo === 'login') {
      setCargando(true)
      const { error: authError } = await authClient.signIn.email({ email, password })
      if (authError) {
        if (authError.code === 'INVALID_EMAIL_OR_PASSWORD') {
          const existe = await correoRegistrado(email)
          setError(existe ? 'Contraseña incorrecta' : 'Correo no encontrado')
        } else {
          setError(mensajeErrorAuth(authError.code))
        }
        setCargando(false)
        return
      }
    } else {
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres')
        return
      }
      if (password !== password2) {
        setError('Las contraseñas no coinciden')
        return
      }
      setCargando(true)
      const { error: authError } = await authClient.signUp.email({
        name: nombre,
        email,
        password,
      })
      if (authError) {
        setError(mensajeErrorAuth(authError.code))
        setCargando(false)
        return
      }
    }

    router.push('/dashboard')
    router.refresh()
  }

  const animClase = modo === 'registro' ? 'animar-form-der' : 'animar-form-izq'

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-6 pt-6">
        {/* Toggle segmentado con indicador deslizante */}
        <div
          role="tablist"
          aria-label="Iniciar sesión o crear cuenta"
          className="relative grid grid-cols-2 rounded-lg bg-secondary p-1 text-sm font-medium"
        >
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-card shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              transform: modo === 'registro' ? 'translateX(100%)' : 'translateX(0)',
            }}
          />
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'login'}
            onClick={() => cambiarModo('login')}
            className={`relative z-10 rounded-md py-2 transition-colors ${
              modo === 'login' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'registro'}
            onClick={() => cambiarModo('registro')}
            className={`relative z-10 rounded-md py-2 transition-colors ${
              modo === 'registro' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            Crear cuenta
          </button>
        </div>

        {/* El key fuerza el re-montaje para re-disparar la animación al cambiar */}
        <form
          key={modo}
          onSubmit={onSubmit}
          className={`flex flex-col gap-4 ${animClase}`}
          noValidate
        >
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
              {modo === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {modo === 'login'
                ? 'Ingresa tus credenciales para acceder a tu banco.'
                : 'Completa tus datos para empezar a usar EduBox.'}
            </p>
          </div>

          <BotonesSociales
            proveedores={proveedores}
            onError={setError}
            deshabilitado={cargando}
          />

          {modo === 'registro' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                name="nombre"
                type="text"
                autoComplete="name"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
          )}

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

          {modo === 'registro' && (
            <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              💡 Regístrate con el{' '}
              <strong className="font-medium text-foreground">
                correo de tu colegio
              </strong>
              : al verificarlo, tu cuenta se unirá automáticamente y podrás
              compartir pruebas y preguntas con todo tu equipo.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {modo === 'login' && (
            <div className="-mt-1 text-right">
              <Link
                href="/recuperar"
                className="text-xs font-medium text-primary hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          )}

          {modo === 'registro' && (
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
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={cargando} className="mt-1 w-full">
            {cargando
              ? modo === 'login'
                ? 'Ingresando…'
                : 'Creando cuenta…'
              : modo === 'login'
                ? 'Ingresar'
                : 'Crear cuenta'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
