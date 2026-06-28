'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { guardarTexto } from '@/lib/actions/textos'
import { VISIBILIDAD_TEXTO } from '@/lib/validation/texto'
import { ASIGNATURAS } from '@/components/shell/subjects'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Formulario de alta de un texto de comprensión lectora. Tras guardar, navega a
 * la pestaña "Ver mis textos" de la misma asignatura para que el profesor pueda
 * empezar a asociarle preguntas.
 */
export function FormularioTexto({
  asignaturaInicial,
}: {
  asignaturaInicial?: string
}) {
  const router = useRouter()

  const [asignatura, setAsignatura] = useState(
    asignaturaInicial ?? ASIGNATURAS[0].nombre,
  )
  const [titulo, setTitulo] = useState('')
  const [contenido, setContenido] = useState('')
  const [compartida, setCompartida] = useState('0')

  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPendiente(true)

    try {
      const resultado = await guardarTexto({
        asignatura,
        titulo,
        contenido,
        compartida,
      })

      if ('error' in resultado) {
        setError(resultado.error)
        setPendiente(false)
        return
      }

      // Éxito: la lista ya fue revalidada en el servidor; vamos a "Ver mis textos".
      router.push(
        `/textos?asignatura=${encodeURIComponent(asignatura)}&tab=ver`,
      )
      router.refresh()
    } catch {
      setError('Ocurrió un error al guardar el texto. Inténtalo de nuevo.')
      setPendiente(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Asignatura</Label>
              <Select
                value={asignatura}
                onValueChange={(v) => setAsignatura(v as string)}
              >
                <SelectTrigger aria-label="Asignatura" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASIGNATURAS.map((a) => (
                    <SelectItem key={a.nombre} value={a.nombre}>
                      {a.emoji} {a.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Visibilidad</Label>
              <Select
                value={compartida}
                onValueChange={(v) => setCompartida(v as string)}
              >
                <SelectTrigger aria-label="Visibilidad" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILIDAD_TEXTO.map((v) => (
                    <SelectItem key={v.valor} value={String(v.valor)}>
                      {v.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="titulo">Título del texto</Label>
            <Input
              id="titulo"
              name="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Noticia sobre el cambio climático"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contenido">Contenido del texto</Label>
            <Textarea
              id="contenido"
              name="contenido"
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              placeholder="Pega o escribe el texto aquí…"
              rows={10}
              required
            />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="submit"
          disabled={pendiente}
          className="w-full sm:w-auto"
        >
          {pendiente ? 'Guardando…' : 'Guardar texto'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pendiente}
          className="w-full sm:w-auto"
          onClick={() =>
            router.push(
              `/textos?asignatura=${encodeURIComponent(asignatura)}&tab=ver`,
            )
          }
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
