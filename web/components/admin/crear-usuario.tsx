'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearUsuario } from '@/lib/actions/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Alta manual de un usuario desde el admin global. La contraseña es temporal:
 * el admin se la comparte al usuario, que puede cambiarla con "recuperar
 * contraseña". El guard de rol vive en la server action. Los estudiantes no
 * llevan colegio (el selector se oculta para ese rol).
 */
export function CrearUsuario({
  colegios,
}: {
  colegios: { id: number; nombre: string }[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    password: '',
    role: 'teacher',
    colegioId: '' as string,
  })
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pendiente) return
    setError(null)
    setExito(null)
    setPendiente(true)
    try {
      const r = await crearUsuario({
        nombre: form.nombre,
        email: form.email,
        password: form.password,
        role: form.role,
        colegioId: form.colegioId ? Number(form.colegioId) : null,
      })
      if ('error' in r) {
        setError(r.error)
        return
      }
      setExito(`✅ Usuario «${form.nombre.trim()}» creado.`)
      setForm({ nombre: '', email: '', password: '', role: 'teacher', colegioId: '' })
      router.refresh()
    } catch {
      setError('No se pudo crear el usuario. Inténtalo de nuevo.')
    } finally {
      setPendiente(false)
    }
  }

  if (!abierto) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setAbierto(true)}
          className="self-start"
        >
          ➕ Crear usuario
        </Button>
        {exito ? (
          <p role="status" className="text-sm text-primary">
            {exito}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <p className="text-sm font-semibold text-foreground">Nuevo usuario</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nuevo-usuario-nombre">Nombre</Label>
          <Input
            id="nuevo-usuario-nombre"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: María Pérez"
            autoComplete="off"
            required
            disabled={pendiente}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nuevo-usuario-email">Correo</Label>
          <Input
            id="nuevo-usuario-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="maria@colegio.cl"
            autoComplete="off"
            required
            disabled={pendiente}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nuevo-usuario-password">Contraseña temporal</Label>
          <Input
            id="nuevo-usuario-password"
            type="text"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Mínimo 6 caracteres"
            autoComplete="off"
            minLength={6}
            required
            disabled={pendiente}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nuevo-usuario-rol">Rol</Label>
          <select
            id="nuevo-usuario-rol"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            disabled={pendiente}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="teacher">Profesor</option>
            <option value="school_admin">Admin de colegio</option>
            <option value="student">Estudiante</option>
          </select>
        </div>
        {form.role !== 'student' ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nuevo-usuario-colegio">Colegio (opcional)</Label>
            <select
              id="nuevo-usuario-colegio"
              value={form.colegioId}
              onChange={(e) =>
                setForm((f) => ({ ...f, colegioId: e.target.value }))
              }
              disabled={pendiente}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Sin colegio</option>
              {colegios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Creando…' : '💾 Crear usuario'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setAbierto(false)}
          disabled={pendiente}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
