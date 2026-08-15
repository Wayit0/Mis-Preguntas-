'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { inscribirConCodigo } from '@/lib/actions/cursos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Botón "➕ Unirme a un curso": al hacer clic revela un input de código que
 * llama a `inscribirConCodigo`; en éxito refresca la página (aparece el curso
 * y sus tareas en /tareas).
 */
export function UnirseACurso() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  function cerrar() {
    setAbierto(false)
    setCodigo('')
    setError(null)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!codigo.trim()) {
      setError('Ingresa el código del curso.')
      return
    }
    setPendiente(true)
    setError(null)
    const res = await inscribirConCodigo(codigo)
    setPendiente(false)
    if ('error' in res) {
      setError(res.error)
      return
    }
    cerrar()
    router.refresh()
  }

  if (!abierto) {
    return (
      <Button variant="outline" onClick={() => setAbierto(true)}>
        ➕ Unirme a un curso
      </Button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Código del curso"
          autoComplete="off"
          className="w-40"
        />
        <Button type="submit" disabled={pendiente}>
          {pendiente ? 'Uniendo…' : 'Unirme'}
        </Button>
        <Button type="button" variant="ghost" onClick={cerrar} disabled={pendiente}>
          Cancelar
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}
