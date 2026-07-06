'use client'

import { useRouter } from 'next/navigation'
import { ASIGNATURAS, fijarCookieAsignatura } from './subjects'

/**
 * Cuadro para elegir la asignatura por defecto cuando el contexto es "Todas"
 * (usuario nuevo sin asignatura fijada). Al elegir una, fija la misma cookie que
 * el selector del menú lateral y refresca los server components, de modo que las
 * listas y formularios pasen a usar esa asignatura y se desbloqueen las pantallas
 * que necesitan una asignatura concreta (Crear Prueba, Agregar Pregunta, etc.).
 */
export function ElegirAsignatura({
  titulo = '¿De qué asignatura eres profesor?',
  subtitulo = 'Elige tu asignatura para empezar. Quedará como tu asignatura por defecto y podrás cambiarla cuando quieras en el menú lateral.',
}: {
  titulo?: string
  subtitulo?: string
}) {
  const router = useRouter()

  function elegir(nombre: string) {
    fijarCookieAsignatura(nombre)
    router.refresh()
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
      <div className="flex flex-col gap-1 text-center">
        <p className="font-heading text-lg font-semibold text-foreground">
          {titulo}
        </p>
        <p className="text-sm text-muted-foreground">{subtitulo}</p>
      </div>
      <div className="mx-auto mt-5 grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-3">
        {ASIGNATURAS.map((a) => (
          <button
            key={a.nombre}
            type="button"
            onClick={() => elegir(a.nombre)}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <span aria-hidden className="text-base leading-none">
              {a.emoji}
            </span>
            <span className="truncate">{a.nombre}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
