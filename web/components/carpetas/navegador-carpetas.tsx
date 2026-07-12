'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  crearCarpeta,
  renombrarCarpeta,
  eliminarCarpeta,
} from '@/lib/actions/carpetas'
import type { Carpeta } from '@/lib/queries/carpetas'

export interface SubCarpeta extends Carpeta {
  /** Nº de ítems del tipo actual dentro de la carpeta. */
  n: number
}

/**
 * Navegación estilo explorador de archivos para una lista (preguntas/pruebas/
 * textos): breadcrumb de la ruta actual, chips de subcarpetas con conteo, y
 * gestión inline de la carpeta actual (crear subcarpeta, renombrar, eliminar).
 * El "estás en" se refleja en la URL con `?carpeta=ID`. Las carpetas son un árbol
 * único compartido por los tres tipos, así que la gestión no depende del tipo;
 * `basePath` define sobre qué lista navega.
 */
export function NavegadorCarpetas({
  basePath,
  carpetaActual,
  ruta,
  subcarpetas,
}: {
  basePath: string
  carpetaActual: number | null
  ruta: Carpeta[]
  subcarpetas: SubCarpeta[]
}) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [renombrando, setRenombrando] = useState(false)
  const [nombreEdit, setNombreEdit] = useState('')
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nombreActual = ruta.length > 0 ? ruta[ruta.length - 1].nombre : null
  const padreId = ruta.length >= 2 ? ruta[ruta.length - 2].id : null

  function href(id: number | null): string {
    return id == null ? basePath : `${basePath}?carpeta=${id}`
  }

  function crear() {
    const n = nombre.trim()
    if (!n) return
    setError(null)
    iniciar(async () => {
      const r = await crearCarpeta(n, carpetaActual)
      if ('error' in r) {
        setError(r.error)
        return
      }
      setNombre('')
      setCreando(false)
      router.refresh()
    })
  }

  function renombrar() {
    const n = nombreEdit.trim()
    if (!n || carpetaActual == null) return
    setError(null)
    iniciar(async () => {
      const r = await renombrarCarpeta(carpetaActual, n)
      if ('error' in r) {
        setError(r.error)
        return
      }
      setRenombrando(false)
      router.refresh()
    })
  }

  function eliminar() {
    if (carpetaActual == null) return
    setError(null)
    iniciar(async () => {
      const r = await eliminarCarpeta(carpetaActual)
      if ('error' in r) {
        setError(r.error)
        return
      }
      // Su contenido subió al padre; navegamos allí.
      router.push(href(padreId))
      router.refresh()
    })
  }

  const chip =
    'inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground transition-colors hover:bg-muted'

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-3">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <Link
          href={href(null)}
          className={
            carpetaActual == null
              ? 'font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }
        >
          📂 Todo
        </Link>
        {ruta.map((c, i) => {
          const esActual = i === ruta.length - 1
          return (
            <span key={c.id} className="flex items-center gap-1">
              <span aria-hidden className="text-muted-foreground">
                /
              </span>
              {esActual ? (
                <span className="font-medium text-foreground">{c.nombre}</span>
              ) : (
                <Link
                  href={href(c.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {c.nombre}
                </Link>
              )}
            </span>
          )
        })}
      </div>

      {/* Subcarpetas + acciones de la carpeta actual */}
      <div className="flex flex-wrap items-center gap-2">
        {subcarpetas.map((c) => (
          <Link key={c.id} href={href(c.id)} className={chip}>
            📁 {c.nombre}
            {c.n > 0 ? (
              <span className="text-xs text-muted-foreground">{c.n}</span>
            ) : null}
          </Link>
        ))}

        {creando ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') crear()
                if (e.key === 'Escape') {
                  setCreando(false)
                  setNombre('')
                }
              }}
              placeholder="Nombre de la carpeta"
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            />
            <button
              type="button"
              onClick={crear}
              disabled={pendiente || !nombre.trim()}
              className="h-8 rounded-md bg-primary px-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              Crear
            </button>
            <button
              type="button"
              onClick={() => {
                setCreando(false)
                setNombre('')
              }}
              className="h-8 rounded-md px-2 text-sm text-muted-foreground"
            >
              Cancelar
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className={`${chip} border-dashed`}
          >
            ➕ Nueva carpeta
          </button>
        )}
      </div>

      {/* Renombrar / eliminar la carpeta actual */}
      {carpetaActual != null ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {renombrando ? (
            <span className="inline-flex items-center gap-1">
              <input
                autoFocus
                value={nombreEdit}
                onChange={(e) => setNombreEdit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renombrar()
                  if (e.key === 'Escape') setRenombrando(false)
                }}
                className="h-8 rounded-md border border-border bg-card px-2 text-sm"
              />
              <button
                type="button"
                onClick={renombrar}
                disabled={pendiente || !nombreEdit.trim()}
                className="h-8 rounded-md bg-primary px-2 font-medium text-primary-foreground disabled:opacity-60"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setRenombrando(false)}
                className="h-8 rounded-md px-2 text-muted-foreground"
              >
                Cancelar
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNombreEdit(nombreActual ?? '')
                setRenombrando(true)
              }}
              className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
            >
              ✏️ Renombrar carpeta
            </button>
          )}

          {confirmarBorrar ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              ¿Eliminar «{nombreActual}»? Su contenido sube a la carpeta superior.
              <button
                type="button"
                onClick={eliminar}
                disabled={pendiente}
                className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive"
              >
                Sí, eliminar
              </button>
              <button
                type="button"
                onClick={() => setConfirmarBorrar(false)}
                className="rounded-md px-2 py-1"
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmarBorrar(true)}
              className="rounded-md px-2 py-1 text-muted-foreground hover:text-destructive"
            >
              🗑 Eliminar carpeta
            </button>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
