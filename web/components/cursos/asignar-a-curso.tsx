'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { asignarPruebaACurso } from '@/lib/actions/asignaciones'
import { Button } from '@/components/ui/button'

interface CursoOpcion {
  id: number
  nombre: string
}

/**
 * Asigna una prueba a uno de los cursos del profesor, con fecha límite
 * opcional. Vive dentro de la tarjeta de prueba en /mis-pruebas. Si el
 * profesor todavía no tiene cursos, muestra un link a /cursos en su lugar
 * (no tiene sentido ofrecer el selector vacío).
 */
export function AsignarACurso({
  pruebaId,
  cursos,
}: {
  pruebaId: number
  cursos: CursoOpcion[]
}) {
  const router = useRouter()
  const [cursoId, setCursoId] = useState(cursos[0] ? String(cursos[0].id) : '')
  const [fechaLimite, setFechaLimite] = useState('')
  const [pendiente, setPendiente] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asignada, setAsignada] = useState(false)

  if (cursos.length === 0) {
    return (
      <Link
        href="/cursos"
        className="text-xs font-medium text-primary underline-offset-2 hover:underline"
      >
        🎓 Crea un curso para asignar
      </Link>
    )
  }

  async function asignar() {
    if (pendiente) return
    if (!cursoId) return
    setPendiente(true)
    setError(null)
    setAsignada(false)
    try {
      const r = await asignarPruebaACurso({
        pruebaId,
        cursoId: Number(cursoId),
        fechaLimite: fechaLimite || null,
      })
      if ('error' in r) {
        setError(r.error)
        return
      }
      setAsignada(true)
      router.refresh()
    } catch {
      setError('No se pudo asignar la prueba.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <select
        aria-label="Curso"
        value={cursoId}
        onChange={(e) => {
          setCursoId(e.target.value)
          setAsignada(false)
        }}
        className="h-9 rounded-md border border-border bg-card px-2 text-xs text-foreground sm:h-7"
      >
        {cursos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <input
        type="datetime-local"
        aria-label="Fecha límite (opcional)"
        value={fechaLimite}
        onChange={(e) => {
          setFechaLimite(e.target.value)
          setAsignada(false)
        }}
        className="h-9 rounded-md border border-border bg-card px-2 text-xs text-foreground sm:h-7"
      />
      <Button
        type="button"
        size="sm"
        disabled={pendiente}
        onClick={asignar}
        className="h-9 px-3 sm:h-7 sm:px-2.5"
      >
        {pendiente ? 'Asignando…' : asignada ? 'Asignada ✓' : '📤 Asignar'}
      </Button>
      {error ? (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  )
}
