'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { registrarEstudianteConCodigo } from '@/lib/actions/registro-estudiante'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export function FormularioUnirse({
  codigo,
  nombreCurso,
}: {
  codigo: string
  nombreCurso: string | null
}) {
  const router = useRouter()
  const [form, setForm] = useState({ codigo, nombre: '', email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  // Vino un código en la URL (/unirse/CODIGO) pero no corresponde a ningún
  // curso: no tiene sentido mostrar el formulario, mejor un aviso claro.
  const codigoInvalido = codigo.trim() !== '' && nombreCurso === null

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!form.codigo.trim()) {
      setError('Ingresa el código del curso.')
      return
    }
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

    setPendiente(true)
    const res = await registrarEstudianteConCodigo(form)
    setPendiente(false)
    if ('error' in res) {
      setError(res.error)
      return
    }
    router.push('/tareas')
    router.refresh()
  }

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-6 pt-6">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Únete a tu curso
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {nombreCurso
              ? (
                <>
                  Te estás uniendo a{' '}
                  <strong className="font-medium text-foreground">
                    «{nombreCurso}»
                  </strong>
                  . Crea tu cuenta para entrar.
                </>
              )
              : 'Ingresa el código que te dio tu profesor y crea tu cuenta.'}
          </p>
        </div>

        {codigoInvalido
          ? (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              El código no es válido; pídele a tu profesor el link correcto.
            </p>
          )
          : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              {!nombreCurso && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="codigo">Código del curso</Label>
                  <Input
                    id="codigo"
                    name="codigo"
                    type="text"
                    autoComplete="off"
                    value={form.codigo}
                    onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                  />
                </div>
              )}

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

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={pendiente} className="mt-1 w-full">
                {pendiente ? 'Creando cuenta…' : 'Crear cuenta y unirme'}
              </Button>
            </form>
          )}

        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Inicia sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
