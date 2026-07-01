'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
 * Botón que genera (o regenera) el PDF de una prueba guardada. Hace POST a la
 * ruta del PDF, descarga el binario resultante y refresca la lista para reflejar
 * el nuevo estado ("PDF listo"). El servidor cachea el PDF en el storage, de modo
 * que las descargas posteriores no lo regeneran.
 */
export function BotonGenerarPdf({
  pruebaId,
  asignatura,
  tienePdf,
}: {
  pruebaId: number
  asignatura: string
  /** Si ya hay un PDF cacheado, el botón dice "Regenerar". */
  tienePdf: boolean
}) {
  const router = useRouter()
  const [pendiente, setPendiente] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generar() {
    setError(null)
    setPendiente(true)
    try {
      const res = await fetch(`/api/mis-pruebas/${pruebaId}/pdf`, {
        method: 'POST',
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        setError(msg || 'No se pudo generar el PDF.')
        setPendiente(false)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `prueba_${slugAsignatura(asignatura)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      // Refresca la lista para que aparezca "PDF listo" y el botón "Descargar".
      router.refresh()
    } catch {
      setError('Ocurrió un error al generar el PDF.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={generar}
        disabled={pendiente}
        className={buttonVariants({
          variant: tienePdf ? 'outline' : 'default',
          size: 'sm',
          className: 'h-9 px-3 sm:h-7 sm:px-2.5',
        })}
      >
        {pendiente
          ? 'Generando…'
          : tienePdf
            ? '♻️ Regenerar PDF'
            : '⚙️ Generar PDF'}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </>
  )
}
