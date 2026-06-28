'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { eliminarPreguntaColegio } from '@/lib/actions/banco-colegio'
import { buttonVariants } from '@/components/ui/button'

/**
 * Controles de gestión del banco del colegio para una pregunta: editar (lleva al
 * formulario de edición del colegio) y eliminar. La autorización ("mismo colegio
 * + school_admin") la impone la server action; aquí solo se muestran los
 * controles y se refresca la lista tras eliminar.
 */
export function AccionesBancoPregunta({ preguntaId }: { preguntaId: number }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function eliminar() {
    setError(null)
    setPendiente(true)
    try {
      const r = await eliminarPreguntaColegio(preguntaId)
      if (r && 'error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo eliminar la pregunta.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <Link
        href={`/colegio/preguntas/${preguntaId}/editar`}
        className={buttonVariants({
          variant: 'outline',
          size: 'sm',
          className: 'h-9 px-3 sm:h-7 sm:px-2.5',
        })}
      >
        ✏️ Editar
      </Link>
      <button
        type="button"
        onClick={eliminar}
        disabled={pendiente}
        className={buttonVariants({
          variant: 'destructive',
          size: 'sm',
          className: 'h-9 px-3 sm:h-7 sm:px-2.5',
        })}
      >
        {pendiente ? 'Eliminando…' : '🗑 Eliminar'}
      </button>
      {error ? (
        <p role="alert" className="w-full text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
