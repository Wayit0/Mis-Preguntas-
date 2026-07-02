'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { guardarPrueba, actualizarPrueba } from '@/lib/actions/pruebas'
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
import dynamic from 'next/dynamic'
import { LatexText } from '@/components/preguntas/latex-text'

const EditorEcuacion = dynamic(
  () => import('./editor-ecuacion').then((m) => m.EditorEcuacion),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border bg-card text-sm text-muted-foreground">
        Cargando editor…
      </div>
    ),
  },
)

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

/** Prueba guardada que se carga en el editor para modificarla. */
export interface PruebaInicial {
  id: number
  titulo: string
  colegio: string
  profesor: string
  instrucciones: string
  formulas: string[]
  preguntasIds: number[]
  textosIds: number[]
}

const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const

function conAsignatura(base: string, asignatura: string): string {
  return asignatura
    ? `${base}?asignatura=${encodeURIComponent(asignatura)}`
    : base
}

// ── Panel de vista previa con reordenamiento ─────────────────────────────────

function PanelVistaPrevia({
  preguntas,
  seleccion,
  textos,
  textosSel,
  pendiente,
  editando,
  asignatura,
  onMover,
  onQuitar,
  onGuardar,
}: {
  preguntas: PreguntaSeleccionable[]
  seleccion: number[]
  textos: TextoSeleccionable[]
  textosSel: Set<number>
  pendiente: boolean
  editando: boolean
  asignatura: string
  onMover: (from: number, to: number) => void
  onQuitar: (id: number) => void
  onGuardar: () => void
}) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const mapa = useMemo(() => {
    const m = new Map<number, PreguntaSeleccionable>()
    for (const p of preguntas) m.set(p.id, p)
    return m
  }, [preguntas])

  const totalPreguntas =
    seleccion.length +
    [...textosSel].reduce((acc, id) => {
      const t = textos.find((t) => t.id === id)
      return acc + (t?.nPreguntas ?? 0)
    }, 0)

  const vacio = seleccion.length === 0 && textosSel.size === 0

  function handleDragStart(i: number) {
    setDragging(i)
  }
  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    setDragOver(i)
  }
  function handleDrop(i: number) {
    if (dragging !== null && dragging !== i) onMover(dragging, i)
    setDragging(null)
    setDragOver(null)
  }
  function handleDragEnd() {
    setDragging(null)
    setDragOver(null)
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Vista previa</p>
          {!vacio && (
            <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-xs font-bold text-primary-foreground">
              {totalPreguntas}
            </span>
          )}
        </div>

        {vacio ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Selecciona preguntas para ver la vista previa
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {/* Textos de comprensión */}
            {[...textosSel].map((id, ti) => {
              const t = textos.find((t) => t.id === id)
              if (!t) return null
              return (
                <li
                  key={`t-${id}`}
                  className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-secondary font-mono text-[10px] font-bold text-secondary-foreground">
                    T{ti + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-xs text-foreground">
                    {t.titulo}
                  </span>
                </li>
              )
            })}

            {/* Preguntas ordenables */}
            {seleccion.map((id, i) => {
              const p = mapa.get(id)
              if (!p) return null
              const isOver = dragOver === i
              const isDragging = dragging === i
              return (
                <li
                  key={id}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={handleDragEnd}
                  className={[
                    'flex items-start gap-1.5 rounded-md border px-2.5 py-2 transition-colors',
                    isOver ? 'border-primary bg-primary/5' : 'border-border bg-background',
                    isDragging ? 'opacity-40' : '',
                  ].join(' ')}
                >
                  {/* Handle drag */}
                  <span
                    className="mt-0.5 cursor-grab select-none text-base leading-none text-muted-foreground"
                    title="Arrastra para reordenar"
                  >
                    ⠿
                  </span>

                  {/* Número */}
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary font-mono text-[10px] font-bold text-primary-foreground">
                    {i + 1}
                  </span>

                  {/* Enunciado truncado */}
                  <span
                    className="min-w-0 flex-1 text-xs text-foreground"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    } as React.CSSProperties}
                  >
                    <LatexText text={p.enunciado} />
                  </span>

                  {/* Controles */}
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => i > 0 && onMover(i, i - 1)}
                      disabled={i === 0}
                      aria-label="Subir pregunta"
                      className="px-0.5 text-sm leading-none text-muted-foreground hover:text-foreground disabled:opacity-25"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => i < seleccion.length - 1 && onMover(i, i + 1)}
                      disabled={i === seleccion.length - 1}
                      aria-label="Bajar pregunta"
                      className="px-0.5 text-sm leading-none text-muted-foreground hover:text-foreground disabled:opacity-25"
                    >
                      ↓
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onQuitar(id)}
                    aria-label="Quitar pregunta"
                    className="mt-0.5 shrink-0 text-xs text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <Button
          type="button"
          onClick={onGuardar}
          disabled={pendiente || vacio}
          className="w-full"
        >
          {pendiente
            ? 'Guardando…'
            : editando
              ? '💾 Guardar cambios'
              : '💾 Guardar prueba'}
        </Button>
        {editando ? (
          <Link
            href={conAsignatura('/mis-pruebas', asignatura)}
            className={buttonVariants({
              variant: 'outline',
              className: 'w-full',
            })}
          >
            Cancelar
          </Link>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

/* eslint-disable @next/next/no-img-element */

export function GeneradorPrueba({
  asignatura,
  profesorInicial,
  preguntas,
  materias,
  textos,
  colegioInicial = '',
  logoColegioUrl = null,
  esAdmin = false,
  pruebaInicial,
}: {
  asignatura: string
  profesorInicial: string
  preguntas: PreguntaSeleccionable[]
  materias: string[]
  textos: TextoSeleccionable[]
  colegioInicial?: string | null
  logoColegioUrl?: string | null
  esAdmin?: boolean
  /** Si se pasa, el editor modifica esa prueba en vez de crear una nueva. */
  pruebaInicial?: PruebaInicial
}) {
  const router = useRouter()
  const editando = pruebaInicial != null

  const [titulo, setTitulo] = useState(pruebaInicial?.titulo ?? '')
  const [colegio, setColegio] = useState(
    pruebaInicial?.colegio || colegioInicial || '',
  )
  const [profesor, setProfesor] = useState(
    pruebaInicial?.profesor || profesorInicial,
  )
  const [instrucciones, setInstrucciones] = useState(
    pruebaInicial?.instrucciones ?? '',
  )
  const [formulas, setFormulas] = useState<string[]>(
    pruebaInicial?.formulas ?? [],
  )
  const [nuevaFormula, setNuevaFormula] = useState('')

  const [filtroMateria, setFiltroMateria] = useState<string>('__todas__')
  // Array ordenado de IDs seleccionados (el orden importa para el PDF). Al
  // editar, se conservan sólo los IDs que aún existen (los borrados se ignoran).
  const [seleccion, setSeleccion] = useState<number[]>(() =>
    (pruebaInicial?.preguntasIds ?? []).filter((id) =>
      preguntas.some((p) => p.id === id),
    ),
  )
  const [textosSel, setTextosSel] = useState<Set<number>>(
    () =>
      new Set(
        (pruebaInicial?.textosIds ?? []).filter((id) =>
          textos.some((t) => t.id === id),
        ),
      ),
  )

  const [pendiente, setPendiente] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preguntasFiltradas = useMemo(() => {
    if (filtroMateria === '__todas__') return preguntas
    return preguntas.filter((p) => p.materia === filtroMateria)
  }, [preguntas, filtroMateria])

  const sinNada = preguntas.length === 0 && textos.length === 0

  function toggle(id: number) {
    setSeleccion((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function toggleTexto(id: number) {
    setTextosSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function mover(from: number, to: number) {
    setSeleccion((prev) => {
      const arr = [...prev]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return arr
    })
  }

  function quitar(id: number) {
    setSeleccion((prev) => prev.filter((x) => x !== id))
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

  async function guardar() {
    setError(null)
    if (seleccion.length === 0 && textosSel.size === 0) {
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
      // El orden del array determina el orden en el PDF
      for (const id of seleccion) fd.append('pregunta', String(id))
      for (const id of textosSel) fd.append('texto', String(id))

      const resultado = pruebaInicial
        ? await actualizarPrueba(pruebaInicial.id, fd)
        : await guardarPrueba(fd)

      if ('error' in resultado) {
        setError(resultado.error)
        setPendiente(false)
        return
      }

      // Éxito: la lista ya fue revalidada en el servidor; vamos a "Mis Pruebas".
      router.push(conAsignatura('/mis-pruebas', asignatura))
      router.refresh()
    } catch {
      setError('Ocurrió un error al guardar la prueba. Inténtalo de nuevo.')
      setPendiente(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          {editando ? 'Editar Prueba' : 'Crear Prueba'}
          {asignatura ? (
            <span className="font-semibold text-muted-foreground">
              {' — '}
              {asignatura}
            </span>
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">
          Selecciona preguntas, ajusta el encabezado y guarda la prueba. El PDF se
          genera y descarga desde «Mis Pruebas».
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
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
          {/* ── Columna izquierda: configuración + selección ── */}
          <div className="flex min-w-0 flex-1 flex-col gap-5">
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
                  <Label>Logo del colegio</Label>
                  {logoColegioUrl ? (
                    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                      <img
                        src={logoColegioUrl}
                        alt="Logo del colegio"
                        className="h-10 w-auto object-contain"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          Se incluye automáticamente en el PDF.
                        </p>
                      </div>
                      {esAdmin ? (
                        <a
                          href="/colegio?tab=config"
                          className="shrink-0 text-xs text-primary hover:underline"
                        >
                          Cambiar
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                      {esAdmin ? (
                        <>
                          Sin logo.{' '}
                          <a href="/colegio?tab=config" className="text-primary hover:underline">
                            Súbelo en Configuración del colegio
                          </a>{' '}
                          para que aparezca en todos tus PDFs.
                        </>
                      ) : (
                        'Sin logo configurado. El administrador del colegio puede subir uno desde la configuración.'
                      )}
                    </p>
                  )}
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

            {/* Formulario (ecuaciones) */}
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

            {/* Textos de comprensión (opcional) */}
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

            {/* Lista de preguntas */}
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
                    {preguntasFiltradas.map((p) => {
                      const orden = seleccion.indexOf(p.id)
                      const seleccionada = orden !== -1
                      return (
                        <li key={p.id}>
                          <label
                            className={[
                              'flex cursor-pointer gap-3 rounded-md border px-3 py-2.5',
                              seleccionada
                                ? 'border-primary/40 bg-primary/5'
                                : 'border-border hover:bg-muted/40',
                            ].join(' ')}
                          >
                            <input
                              type="checkbox"
                              checked={seleccionada}
                              onChange={() => toggle(p.id)}
                              aria-label={`Seleccionar pregunta ${p.id}`}
                              className="mt-1 size-4 accent-primary"
                            />
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {seleccionada && (
                                  <span className="rounded bg-primary px-1.5 py-0.5 font-mono font-bold text-primary-foreground">
                                    #{orden + 1}
                                  </span>
                                )}
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
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          {/* ── Columna derecha: vista previa sticky ── */}
          <div className="lg:sticky lg:top-4 lg:w-80 lg:shrink-0">
            <PanelVistaPrevia
              preguntas={preguntas}
              seleccion={seleccion}
              textos={textos}
              textosSel={textosSel}
              pendiente={pendiente}
              editando={editando}
              asignatura={asignatura}
              onMover={mover}
              onQuitar={quitar}
              onGuardar={guardar}
            />
          </div>
        </div>
      )}
    </div>
  )
}
