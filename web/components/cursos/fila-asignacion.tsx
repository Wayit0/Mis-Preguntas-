'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { editarAsignacion } from '@/lib/actions/asignaciones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { EliminarAsignacion } from '@/components/cursos/eliminar-asignacion'

/**
 * Formatea una fecha para un `<input type="datetime-local">` en hora LOCAL
 * del navegador (mismo criterio que `AsignarACurso`: el input no lleva zona
 * horaria, así que se arma y se lee siempre en local).
 */
function aInputLocal(fecha: Date | null): string {
  if (!fecha) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`
}

/**
 * Fila de una tarea asignada al curso: normalmente el título (link a
 * resultados), el avance de entregas y Editar/Eliminar. Al editar, la fila
 * cambia a un formulario de ancho completo (título + fecha límite) en vez de
 * apretarlo en la columna de botones.
 */
export function FilaAsignacion({
  id,
  cursoId,
  titulo,
  fechaLimite,
  nEntregas,
  nAlumnos,
}: {
  id: number
  cursoId: number
  titulo: string
  fechaLimite: Date | null
  nEntregas: number
  nAlumnos: number
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [tituloEdit, setTituloEdit] = useState(titulo)
  const [fechaEdit, setFechaEdit] = useState(aInputLocal(fechaLimite))
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  function cancelar() {
    setEditando(false)
    setTituloEdit(titulo)
    setFechaEdit(aInputLocal(fechaLimite))
    setError(null)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pendiente) return
    setError(null)
    setPendiente(true)
    try {
      const r = await editarAsignacion(id, {
        titulo: tituloEdit,
        fechaLimite: fechaEdit ? new Date(fechaEdit).toISOString() : null,
      })
      if ('error' in r) {
        setError(r.error)
        return
      }
      setEditando(false)
      router.refresh()
    } catch {
      setError('No se pudo guardar el cambio.')
    } finally {
      setPendiente(false)
    }
  }

  if (editando) {
    return (
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-2">
            <Input
              aria-label="Título de la tarea"
              value={tituloEdit}
              onChange={(e) => setTituloEdit(e.target.value)}
              required
              autoFocus
            />
            <input
              type="datetime-local"
              aria-label="Fecha límite (opcional)"
              value={fechaEdit}
              onChange={(e) => setFechaEdit(e.target.value)}
              className="h-9 w-fit rounded-md border border-border bg-background px-2 text-sm text-foreground"
            />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={pendiente}>
                {pendiente ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pendiente}
                onClick={cancelar}
              >
                Cancelar
              </Button>
            </div>
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/cursos/${cursoId}/tareas/${id}`}
            className="truncate font-medium text-foreground hover:underline"
          >
            {titulo}
          </Link>
          <p className="text-xs text-muted-foreground">
            {nEntregas}/{nAlumnos} entregadas
            {fechaLimite
              ? ` · hasta el ${fechaLimite.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}`
              : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditando(true)}
            className="h-9 px-3 sm:h-7 sm:px-2.5"
          >
            ✏️ Editar
          </Button>
          <EliminarAsignacion id={id} />
        </div>
      </CardContent>
    </Card>
  )
}
