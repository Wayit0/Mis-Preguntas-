'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearColegio } from '@/lib/actions/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Formulario para que el admin global cree un colegio. La server action genera
 * un joinCode único y aplica el guard de rol (global_admin); aquí solo pedimos
 * el nombre. Tras crearlo, refrescamos para que aparezca en la lista.
 */
export function CrearColegio() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setExito(null)
    setPendiente(true)
    try {
      const r = await crearColegio(nombre)
      if ('error' in r) {
        setError(r.error)
        return
      }
      setExito(`✅ Colegio «${r.colegio.nombre}» creado.`)
      setNombre('')
      router.refresh()
    } catch {
      setError('No se pudo crear el colegio. Inténtalo de nuevo.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nombre-colegio-nuevo">Nombre del colegio</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="nombre-colegio-nuevo"
            name="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Colegio San Ignacio"
            autoComplete="off"
            required
          />
          <Button type="submit" disabled={pendiente} className="sm:w-auto">
            {pendiente ? 'Creando…' : '➕ Crear colegio'}
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
