'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { eliminarUsuario } from '@/lib/actions/admin'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { UsuarioAdmin, EstadisticaUsuario } from '@/lib/queries/admin'
import { EstadisticaActividad } from '@/components/admin/estadistica-actividad'

/**
 * Fila de estudiante en el panel de administración global: los estudiantes no
 * tienen colegio ni rol asignable (ver CrearUsuario), así que la única acción
 * disponible es eliminar la cuenta.
 */
export function FilaEstudiante({
  usuario,
  estadistica,
}: {
  usuario: UsuarioAdmin
  estadistica: EstadisticaUsuario
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  function onEliminar() {
    if (
      !window.confirm(
        `¿Eliminar la cuenta de ${usuario.email}? Esto borra TODO su contenido ` +
          '(inscripciones, entregas, etc.) de forma permanente. No se puede deshacer.',
      )
    ) {
      return
    }
    setError(null)
    setPendiente(true)
    void eliminarUsuario(usuario.id)
      .then((r) => {
        if ('error' in r) {
          setError(r.error)
          return
        }
        router.refresh()
      })
      .catch(() => setError('No se pudo aplicar el cambio.'))
      .finally(() => setPendiente(false))
  }

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">
              🎓 {usuario.nombre}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {usuario.email}
            </span>
          </div>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onEliminar}
            disabled={pendiente}
            aria-label={`Eliminar cuenta de ${usuario.email}`}
          >
            {pendiente ? 'Eliminando…' : '🗑️ Eliminar'}
          </Button>
        </div>

        <EstadisticaActividad estadistica={estadistica} />

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
