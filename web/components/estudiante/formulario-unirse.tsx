'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { registrarEstudiante } from '@/lib/actions/registro-estudiante'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Crea una cuenta de estudiante, sin inscribir en ningún curso: eso queda
 * para el link/QR de un curso puntual (ya con sesión) o el botón "Unirme a
 * un curso" del portal. `next`, si viene, es a dónde volver tras crear la
 * cuenta (p. ej. de vuelta a /unirse/CODIGO para inscribirse ahí mismo).
 */
export function FormularioUnirse({ next }: { next?: string | null }) {
  const router = useRouter()
  const [form, setForm] = useState({ nombre: '', email: '', password: '', password2: '' })
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!form.nombre.trim()) {
      setError('Ingresa tu nombre.')
      return
    }
    if (!form.email.trim()) {
      setError('Ingresa tu correo.')
      return
    }
    if (form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (form.password !== form.password2) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setPendiente(true)
    const res = await registrarEstudiante({
      nombre: form.nombre,
      email: form.email,
      password: form.password,
    })
    setPendiente(false)
    if ('error' in res) {
      setError(res.error)
      return
    }
    router.push(next || '/tareas')
    router.refresh()
  }

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-6 pt-6">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Crea tu cuenta de estudiante
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Para unirte a un curso, pídele a tu profesor el link o QR e
            ingresa a él una vez que tengas tu cuenta.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              name="nombre"
              type="text"
              autoComplete="name"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="tu@correo.cl"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password2">Repetir contraseña</Label>
            <Input
              id="password2"
              name="password2"
              type="password"
              autoComplete="new-password"
              value={form.password2}
              onChange={(e) => setForm((f) => ({ ...f, password2: e.target.value }))}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={pendiente} className="mt-1 w-full">
            {pendiente ? 'Creando cuenta…' : 'Crear cuenta'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{' '}
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
            className="font-medium text-primary hover:underline"
          >
            Inicia sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
