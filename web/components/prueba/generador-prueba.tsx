'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LatexText } from '@/components/preguntas/latex-text'
import { EditorEcuacion } from './editor-ecuacion'

const ETIQUETA_TIPO: Record<string, string> = {
  seleccion_multiple: 'Selección múltiple',
  desarrollo_corto: 'Desarrollo corto',
  desarrollo_largo: 'Desarrollo largo',
}

export interface PreguntaSeleccionable {
  id: number
  enunciado: string
  materia: string
  contenido: string
  nivel: string
  tipo: string
  correcta: string
  A: string
  B: string
  C: string
  D: string
  E: string
}

export interface TextoSeleccionable {
  id: number
  titulo: string
  nPreguntas: number
}

const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const

function conAsignatura(base: string, asignatura: string): string {
  return asignatura
    ? `${base}?asignatura=${encodeURIComponent(asignatura)}`
    : base
}

export function GeneradorPrueba({
  asignatura,
  profesorInicial,
  preguntas,
  materias,
  textos,
}: {
  asignatura: string
  profesorInicial: string
  preguntas: PreguntaSeleccionable[]
  materias: string[]
  textos: TextoSeleccionable[]
}) {
  const [titulo, setTitulo] = useState('')
  const [colegio, setColegio] = useState('')
  const [profesor, setProfesor] = useState(profesorInicial)
  const [instrucciones, setInstrucciones] = useState('')
  const [logo, setLogo] = useState<File | null>(null)

  const [formulas, setFormulas] = useState<string[]>([])
  const [nuevaFormula, setNuevaFormula] = useState('')

  const [filtroMateria, setFiltroMateria] = useState<string>('__todas__')
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [textosSel, setTextosSel] = useState<Set<number>>(new Set())

  const [pendiente, setPendiente] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preguntasFiltradas = useMemo(() => {
    if (filtroMateria === '__todas__') return preguntas
    return preguntas.filter((p) => p.materia === filtroMateria)
  }, [preguntas, filtroMateria])

  const sinNada = preguntas.length === 0 && textos.length === 0

  function toggle(id: number) {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTexto(id: number) {
    setTextosSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function agregarFormula() {
    const expr = nuevaFormula.trim()
    if (!expr) return
    setFormulas((prev) => [...prev, expr])
    setNuevaFormula('')
  }

  function quitarFormula(i: number) {
    setFormulas((prev) => prev.filter((_, idx) => idx !== i))
  }

  const totalSeleccionado = seleccion.size + textosSel.size

  async function generar() {
    setError(null)
    if (seleccion.size === 0 && textosSel.size === 0) {
      setError('Selecciona al menos una pregunta o un texto.')
      return
    }
    setPendiente(true)
    try {
      const fd = new FormData()
      fd.set('asignatura', asignatura)
      fd.set('titulo', titulo)
      fd.set('colegio', colegio)
      fd.set('profesor', profesor)
      fd.set('instrucciones', instrucciones)
      for (const expr of formulas) fd.append('formula', expr)
      for (const id of seleccion) fd.append('pregunta', String(id))
      for (const id of textosSel) fd.append('texto', String(id))
      if (logo) fd.set('logo', logo)

      const res = await fetch('/api/prueba', { method: 'POST', body: fd })
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        setError(msg || 'No se pudo generar el PDF. Inténtalo de nuevo.')
        setPendiente(false)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `prueba_${asignatura || 'general'}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('Ocurrió un error al generar el PDF. Inténtalo de nuevo.')
    } finally {
      setPendiente(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Crear Prueba
          {asignatura ? (
            <span className="font-semibold text-muted-foreground">
              {' — '}
              {asignatura}
            </span>
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">
          Selecciona preguntas, ajusta el encabezado y descarga la prueba en PDF.
        </p>
      </div>

      {sinNada ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-medium text-foreground">
            Aún no tienes preguntas para armar una prueba
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea preguntas en tu banco y vuelve aquí para generar el PDF.
          </p>
          <Link
            href={conAsignatura('/preguntas/nueva', asignatura)}
            className={buttonVariants({ className: 'mt-4' })}
          >
            ➕ Crear una pregunta
          </Link>
        </div>
      ) : (
        <>
          {/* Encabezado de la prueba */}
          <Card>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-foreground">
                Encabezado de la prueba
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="titulo">Título</Label>
                  <Input
                    id="titulo"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Ej: Prueba N°1 — Cinemática"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="colegio">Colegio</Label>
                  <Input
                    id="colegio"
                    value={colegio}
                    onChange={(e) => setColegio(e.target.value)}
                    placeholder="Ej: Colegio San José"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="profesor">Profesor/a</Label>
                  <Input
                    id="profesor"
                    value={profesor}
                    onChange={(e) => setProfesor(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="logo">Logo del colegio (opcional)</Label>
                <input
                  id="logo"
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg"
                  className="max-w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-2.5 file:py-1 file:text-sm file:font-medium file:text-secondary-foreground"
                  onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="instrucciones">Instrucciones (opcional)</Label>
                <Textarea
                  id="instrucciones"
                  value={instrucciones}
                  onChange={(e) => setInstrucciones(e.target.value)}
                  rows={2}
                  placeholder="Ej: Lee atentamente cada pregunta y marca la alternativa correcta."
                />
              </div>
            </CardContent>
          </Card>

          {/* Formulario (LaTeX) */}
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-foreground">
                  Formulario (opcional)
                </p>
                <p className="text-xs text-muted-foreground">
                  Escribe la fórmula directamente o usa los botones. Tab para avanzar entre partes.
                </p>
              </div>
              <EditorEcuacion
                value={nuevaFormula}
                onChange={setNuevaFormula}
                onEnter={agregarFormula}
              />
              <div className="flex justify-end">
                <Button type="button" variant="secondary" onClick={agregarFormula}>
                  ＋ Agregar
                </Button>
              </div>
              {formulas.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {formulas.map((expr, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1 overflow-x-auto">
                        <LatexText text={`$${expr}$`} className="text-sm" />
                      </div>
                      <button
                        type="button"
                        onClick={() => quitarFormula(i)}
                        aria-label={`Quitar fórmula ${i + 1}`}
                        className="text-sm text-muted-foreground hover:text-destructive"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          {/* Textos (opcional) */}
          {textos.length > 0 ? (
            <Card>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-semibold text-foreground">
                    Textos con preguntas asociadas (opcional)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Al seleccionar un texto se incluye completo, seguido de todas
                    sus preguntas.
                  </p>
                </div>
                <ul className="flex flex-col gap-2">
                  {textos.map((t) => (
                    <li key={t.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2">
                        <input
                          type="checkbox"
                          checked={textosSel.has(t.id)}
                          onChange={() => toggleTexto(t.id)}
                          className="size-4 accent-primary"
                        />
                        <span className="text-sm text-foreground">
                          📰 {t.titulo}{' '}
                          <span className="text-muted-foreground">
                            ({t.nPreguntas} pregunta
                            {t.nPreguntas === 1 ? '' : 's'})
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {/* Preguntas sueltas */}
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">
                  Preguntas ({preguntasFiltradas.length})
                </p>
                {materias.length > 0 ? (
                  <div className="w-full sm:w-48">
                    <Select
                      value={filtroMateria}
                      onValueChange={(v) => setFiltroMateria(v as string)}
                    >
                      <SelectTrigger
                        aria-label="Filtrar por materia"
                        className="w-full"
                      >
                        <SelectValue>
                          {(value: string) =>
                            value === '__todas__' ? 'Todas las materias' : value
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__todas__">Todas las materias</SelectItem>
                        {materias.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              {preguntasFiltradas.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                  No hay preguntas con este filtro.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {preguntasFiltradas.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer gap-3 rounded-md border border-border px-3 py-2.5 hover:bg-muted/40">
                        <input
                          type="checkbox"
                          checked={seleccion.has(p.id)}
                          onChange={() => toggle(p.id)}
                          aria-label={`Seleccionar pregunta ${p.id}`}
                          className="mt-1 size-4 accent-primary"
                        />
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="rounded bg-secondary px-1.5 py-0.5 font-medium text-secondary-foreground">
                              {ETIQUETA_TIPO[p.tipo] ?? p.tipo}
                            </span>
                            <span>
                              {[p.materia, p.contenido, p.nivel]
                                .filter(Boolean)
                                .join(' · ') || 'Sin clasificar'}
                            </span>
                          </div>
                          <LatexText
                            text={p.enunciado}
                            className="text-sm text-foreground"
                          />
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Button
              type="button"
              onClick={generar}
              disabled={pendiente}
              className="w-full sm:w-auto"
            >
              {pendiente ? 'Generando…' : '⬇️ Generar PDF'}
            </Button>
            <span className="text-sm text-muted-foreground">
              {totalSeleccionado === 0
                ? 'Nada seleccionado todavía'
                : `${seleccion.size} pregunta${seleccion.size === 1 ? '' : 's'}` +
                  (textosSel.size > 0
                    ? ` · ${textosSel.size} texto${textosSel.size === 1 ? '' : 's'}`
                    : '')}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
