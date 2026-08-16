'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearCurso } from '@/lib/actions/cursos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Crea un curso nuevo (nombre + código de inscripción autogenerado). A
 * diferencia de "Crear colegio", que solo refresca, aquí navegamos al detalle
 * del curso recién creado para que el profesor copie el link y agregue tareas.
 */
export function NuevoCurso() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function crear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pendiente) return
    setError(null)
    setPendiente(true)
    try {
      const r = await crearCurso(nombre)
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.push(`/cursos/${r.id}`)
    } catch {
      setError('No se pudo crear el curso. Inténtalo de nuevo.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          🎓 Crear curso
        </h2>
        <form onSubmit={crear} className="flex flex-col gap-1.5">
          <Label htmlFor="nombre-curso">Nombre del curso</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="nombre-curso"
              name="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: 4° Medio B"
              autoComplete="off"
              required
            />
            <Button type="submit" disabled={pendiente} className="sm:w-auto">
              {pendiente ? 'Creando…' : 'Crear curso'}
            </Button>
          </div>
        </form>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
