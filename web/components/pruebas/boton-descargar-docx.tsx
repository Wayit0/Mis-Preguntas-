'use client'

import { useState } from 'react'
import { buttonVariants } from '@/components/ui/button'

/** Slug seguro para el nombre del archivo (mismo criterio que el servidor). */
function slugAsignatura(asignatura: string): string {
  return (
    asignatura
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'general'
  )
}

/**
 * Botón que genera y descarga el .docx de una prueba guardada. A diferencia
 * del PDF, no hay estado "listo"/cacheado: cada click regenera el documento
 * desde la selección actual y lo descarga directo.
 */
export function BotonDescargarDocx({
  pruebaId,
  asignatura,
}: {
  pruebaId: number
  asignatura: string
}) {
  const [pendiente, setPendiente] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function descargar() {
    setError(null)
    setPendiente(true)
    try {
      const res = await fetch(`/api/mis-pruebas/${pruebaId}/docx`, {
        method: 'POST',
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        setError(msg || 'No se pudo generar el documento Word.')
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `prueba_${slugAsignatura(asignatura)}.docx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('Ocurrió un error al generar el documento Word.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={descargar}
        disabled={pendiente}
        className={buttonVariants({
          variant: 'outline',
          size: 'sm',
          className: 'h-9 px-3 sm:h-7 sm:px-2.5',
        })}
      >
        {pendiente ? 'Generando…' : '📝 Descargar Word'}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </>
  )
}
