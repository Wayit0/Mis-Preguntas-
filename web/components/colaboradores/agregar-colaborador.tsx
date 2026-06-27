'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { agregarColaborador } from '@/lib/actions/colaboradores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Formulario para invitar a un colega por email. Tras agregarlo, refresca la
 * lista (la action revalida `/colaboradores`) y muestra una confirmación. Los
 * errores legibles (email inexistente, uno mismo, etc.) vienen de la action.
 */
export function AgregarColaborador() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setExito(null)
    setPendiente(true)

    try {
      const resultado = await agregarColaborador(email)
      if ('error' in resultado) {
        setError(resultado.error)
        return
      }
      setExito(`✅ ${resultado.nombre} ahora puede ver tus preguntas compartidas.`)
      setEmail('')
      router.refresh()
    } catch {
      setError('Ocurrió un error al agregar el colega. Inténtalo de nuevo.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email-colega">Agregar colega por email</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="email-colega"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colega@colegio.cl"
            autoComplete="off"
            required
          />
          <Button type="submit" disabled={pendiente} className="sm:w-auto">
            {pendiente ? 'Agregando…' : '➕ Agregar colaborador'}
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {exito ? (
        <p role="status" className="text-sm text-primary">
          {exito}
        </p>
      ) : null}
    </form>
  )
}
