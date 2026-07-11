'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearMiColegio } from '@/lib/actions/colegio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Alternativa a unirse a un colegio: crear el propio. El profesor queda como
 * administrador (school_admin) y puede luego invitar a sus colegas, configurar
 * logo/dominio y gestionar el banco desde "Mi Colegio". La server action
 * impone las reglas (sin colegio previo, nombre obligatorio).
 */
export function CrearColegio() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function crear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPendiente(true)
    try {
      const r = await crearMiColegio(nombre)
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo crear el colegio. Inténtalo de nuevo.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            🏫 Crear mi colegio
          </h2>
          <p className="text-sm text-muted-foreground">
            ¿Tu colegio aún no está en la plataforma? Créalo y quedarás como su
            administrador: podrás invitar profesores, subir el logo y compartir
            el banco de preguntas.
          </p>
        </div>

        <form onSubmit={crear} className="flex flex-col gap-1.5">
          <Label htmlFor="nombre-colegio">Nombre del colegio</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="nombre-colegio"
              name="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Colegio San José"
              autoComplete="off"
              required
            />
            <Button type="submit" disabled={pendiente} className="sm:w-auto">
              {pendiente ? 'Creando…' : 'Crear colegio'}
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
