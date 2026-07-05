'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  analizarDocumento,
  guardarPreguntasImportadas,
} from '@/lib/actions/import'
import {
  TIPOS_PREGUNTA,
  ETIQUETA_TIPO,
  LETRAS,
  type Letra,
  type TipoPregunta,
} from '@/lib/validation/pregunta'
import type {
  ImagenParaGuardar,
  PreguntaDetectada,
} from '@/lib/validation/import'
import type { ImagenExtraida } from '@/lib/docparse/extract'
import { ASIGNATURAS } from '@/components/shell/subjects'
import { Button } from '@/components/ui/button'
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

/* eslint-disable @next/next/no-img-element */

/** Una pregunta detectada, ya en forma editable (sin nulls) + selección. */
interface PreguntaEditable {
  id: string
  incluir: boolean
  pregunta: string
  A: string
  B: string
  C: string
  D: string
  E: string
  correcta: string
  explicacion: string
  materia: string
  nivel: string
  tipo: TipoPregunta
  imagenPregunta: ImagenParaGuardar | null
  imagenA: ImagenParaGuardar | null
  imagenB: ImagenParaGuardar | null
  imagenC: ImagenParaGuardar | null
  imagenD: ImagenParaGuardar | null
  imagenE: ImagenParaGuardar | null
}

/** Nombre del campo de imagen de cada alternativa en `PreguntaEditable`. */
const CAMPO_IMAGEN_ALT: Record<
  Letra,
  'imagenA' | 'imagenB' | 'imagenC' | 'imagenD' | 'imagenE'
> = {
  A: 'imagenA',
  B: 'imagenB',
  C: 'imagenC',
  D: 'imagenD',
  E: 'imagenE',
}

/** Resuelve un índice de imagen (el que puso la IA) al objeto correspondiente. */
function resolverImagen(
  indice: number | null | undefined,
  imagenesDisponibles: ImagenExtraida[],
): ImagenParaGuardar | null {
  if (indice == null) return null
  const img = imagenesDisponibles[indice]
  return img ? { base64: img.base64, mediaType: img.mediaType } : null
}

let contador = 0
function aEditable(
  p: PreguntaDetectada,
  imagenesDisponibles: ImagenExtraida[],
): PreguntaEditable {
  const tipo = (TIPOS_PREGUNTA as readonly string[]).includes(p.tipo)
    ? (p.tipo as TipoPregunta)
    : 'seleccion_multiple'
  const correcta = (LETRAS as readonly string[]).includes(p.correcta ?? '')
    ? (p.correcta as string)
    : tipo === 'seleccion_multiple'
      ? 'A'
      : ''
  return {
    id: `det-${contador++}`,
    incluir: true,
    pregunta: p.pregunta ?? '',
    A: p.A ?? '',
    B: p.B ?? '',
    C: p.C ?? '',
    D: p.D ?? '',
    E: p.E ?? '',
    correcta,
    explicacion: p.explicacion ?? '',
    materia: p.materia ?? '',
    nivel: p.nivel ?? '',
    tipo,
    imagenPregunta: resolverImagen(p.imagenPreguntaIndice, imagenesDisponibles),
    imagenA: resolverImagen(p.imagenAIndice, imagenesDisponibles),
    imagenB: resolverImagen(p.imagenBIndice, imagenesDisponibles),
    imagenC: resolverImagen(p.imagenCIndice, imagenesDisponibles),
    imagenD: resolverImagen(p.imagenDIndice, imagenesDisponibles),
    imagenE: resolverImagen(p.imagenEIndice, imagenesDisponibles),
  }
}

/** Miniatura de una imagen detectada, con botón para quitarla. */
function MiniaturaImagen({
  imagen,
  alt,
  onQuitar,
}: {
  imagen: ImagenParaGuardar
  alt: string
  onQuitar: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <img
        src={`data:${imagen.mediaType};base64,${imagen.base64}`}
        alt={alt}
        className="max-h-24 w-fit rounded-md border border-border object-contain"
      />
      <Button type="button" variant="outline" size="sm" onClick={onQuitar}>
        Quitar imagen
      </Button>
    </div>
  )
}

type Fase = 'subir' | 'analizando' | 'revisar' | 'guardando'

export function ImportarDocumento({
  asignaturaInicial,
}: {
  asignaturaInicial?: string
}) {
  const router = useRouter()

  const [asignatura, setAsignatura] = useState(
    asignaturaInicial ?? ASIGNATURAS[0].nombre,
  )
  const [fase, setFase] = useState<Fase>('subir')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [preguntas, setPreguntas] = useState<PreguntaEditable[]>([])

  const seleccionadas = preguntas.filter((p) => p.incluir).length

  async function onAnalizar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setAviso(null)

    const formData = new FormData(e.currentTarget)
    const archivo = formData.get('archivo')
    if (!(archivo instanceof File) || archivo.size === 0) {
      setError('Sube un documento (PDF, DOCX o imagen).')
      return
    }
    formData.set('asignatura', asignatura)

    setFase('analizando')
    try {
      const resultado = await analizarDocumento(formData)
      if (!resultado.ok) {
        setError(resultado.error)
        setFase('subir')
        return
      }
      if (resultado.preguntas.length === 0) {
        setAviso(
          'No detectamos preguntas en el documento. Prueba con otro archivo o revisa su contenido.',
        )
        setFase('subir')
        return
      }
      setPreguntas(
        resultado.preguntas.map((p) => aEditable(p, resultado.imagenes)),
      )
      setFase('revisar')
    } catch {
      setError('Ocurrió un error al analizar el documento. Inténtalo de nuevo.')
      setFase('subir')
    }
  }

  function actualizar(id: string, cambios: Partial<PreguntaEditable>) {
    setPreguntas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)),
    )
  }

  async function onGuardar() {
    setError(null)
    const incluidas = preguntas.filter((p) => p.incluir)
    if (incluidas.length === 0) {
      setError('Selecciona al menos una pregunta para guardar.')
      return
    }

    setFase('guardando')
    try {
      const resultado = await guardarPreguntasImportadas({
        asignatura,
        preguntas: incluidas.map(({ ...p }) => ({
          pregunta: p.pregunta,
          A: p.A,
          B: p.B,
          C: p.C,
          D: p.D,
          E: p.E,
          correcta: p.correcta,
          explicacion: p.explicacion,
          materia: p.materia,
          nivel: p.nivel,
          tipo: p.tipo,
          imagenPregunta: p.imagenPregunta,
          imagenA: p.imagenA,
          imagenB: p.imagenB,
          imagenC: p.imagenC,
          imagenD: p.imagenD,
          imagenE: p.imagenE,
        })),
      })
      if (!resultado.ok) {
        setError(resultado.error)
        setFase('revisar')
        return
      }
      router.push(`/preguntas?asignatura=${encodeURIComponent(asignatura)}`)
      router.refresh()
    } catch {
      setError('Ocurrió un error al guardar las preguntas. Inténtalo de nuevo.')
      setFase('revisar')
    }
  }

  function reiniciar() {
    setPreguntas([])
    setError(null)
    setAviso(null)
    setFase('subir')
  }

  // ───────────────────────────── Encabezado ──────────────────────────────
  const encabezado = (
    <div className="flex flex-col gap-1">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
        Importar Documento
        <span className="font-semibold text-muted-foreground">
          {' — '}
          {asignatura}
        </span>
      </h1>
      <p className="text-sm text-muted-foreground">
        Sube una prueba o guía (PDF, Word o imagen) y la IA detectará las
        preguntas para que las revises y guardes en tu banco.
      </p>
    </div>
  )

  // ───────────────────────────── Fase: revisar ───────────────────────────
  if (fase === 'revisar' || fase === 'guardando') {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        {encabezado}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">
            {preguntas.length === 1
              ? '1 pregunta detectada'
              : `${preguntas.length} preguntas detectadas`}{' '}
            <span className="font-normal text-muted-foreground">
              · revisa, edita y elige cuáles guardar
            </span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reiniciar}
            disabled={fase === 'guardando'}
          >
            Subir otro documento
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          {preguntas.map((p, i) => {
            const esSeleccion = p.tipo === 'seleccion_multiple'
            return (
              <Card key={p.id} className={p.incluir ? '' : 'opacity-60'}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <input
                        type="checkbox"
                        checked={p.incluir}
                        onChange={(e) =>
                          actualizar(p.id, { incluir: e.target.checked })
                        }
                        aria-label={`Incluir pregunta ${i + 1}`}
                        className="size-4 accent-primary"
                      />
                      Pregunta {i + 1}
                    </label>
                    <div className="w-full sm:w-48">
                      <Select
                        value={p.tipo}
                        onValueChange={(v) =>
                          actualizar(p.id, { tipo: v as TipoPregunta })
                        }
                      >
                        <SelectTrigger
                          aria-label={`Tipo de la pregunta ${i + 1}`}
                          className="w-full"
                        >
                          <SelectValue>
                            {(v: string) =>
                              ETIQUETA_TIPO[v as TipoPregunta] ?? v
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {TIPOS_PREGUNTA.map((t) => (
                            <SelectItem key={t} value={t}>
                              {ETIQUETA_TIPO[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`enunciado-${p.id}`}>Enunciado</Label>
                    <Textarea
                      id={`enunciado-${p.id}`}
                      value={p.pregunta}
                      onChange={(e) =>
                        actualizar(p.id, { pregunta: e.target.value })
                      }
                      rows={2}
                    />
                    {p.pregunta.trim() ? (
                      <LatexText
                        text={p.pregunta}
                        className="text-xs text-muted-foreground"
                      />
                    ) : null}
                    {p.imagenPregunta ? (
                      <MiniaturaImagen
                        imagen={p.imagenPregunta}
                        alt={`Imagen del enunciado ${i + 1}`}
                        onQuitar={() => actualizar(p.id, { imagenPregunta: null })}
                      />
                    ) : null}
                  </div>

                  {esSeleccion ? (
                    <div className="flex flex-col gap-2">
                      {LETRAS.map((letra) => {
                        const campoImagen = CAMPO_IMAGEN_ALT[letra]
                        const imagenAlt = p[campoImagen]
                        return (
                          <div
                            key={letra}
                            className="flex flex-col gap-1.5"
                          >
                            <Label htmlFor={`alt-${p.id}-${letra}`}>
                              Alternativa {letra}
                            </Label>
                            <Input
                              id={`alt-${p.id}-${letra}`}
                              value={p[letra]}
                              onChange={(e) =>
                                actualizar(p.id, { [letra]: e.target.value })
                              }
                            />
                            {imagenAlt ? (
                              <MiniaturaImagen
                                imagen={imagenAlt}
                                alt={`Imagen de la alternativa ${letra}`}
                                onQuitar={() =>
                                  actualizar(p.id, { [campoImagen]: null })
                                }
                              />
                            ) : null}
                          </div>
                        )
                      })}
                      <div className="flex flex-col gap-1.5">
                        <Label>Respuesta correcta</Label>
                        <Select
                          value={p.correcta || 'A'}
                          onValueChange={(v) =>
                            actualizar(p.id, { correcta: v as string })
                          }
                        >
                          <SelectTrigger
                            aria-label={`Respuesta correcta de la pregunta ${i + 1}`}
                            className="w-32"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LETRAS.map((l) => (
                              <SelectItem key={l} value={l}>
                                {l}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`materia-${p.id}`}>Materia</Label>
                      <Input
                        id={`materia-${p.id}`}
                        value={p.materia}
                        onChange={(e) =>
                          actualizar(p.id, { materia: e.target.value })
                        }
                        placeholder="Ej: Mecánica"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`nivel-${p.id}`}>Nivel</Label>
                      <Input
                        id={`nivel-${p.id}`}
                        value={p.nivel}
                        onChange={(e) =>
                          actualizar(p.id, { nivel: e.target.value })
                        }
                        placeholder="Ej: PAES"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`explicacion-${p.id}`}>
                      Explicación / pauta (opcional)
                    </Label>
                    <Textarea
                      id={`explicacion-${p.id}`}
                      value={p.explicacion}
                      onChange={(e) =>
                        actualizar(p.id, { explicacion: e.target.value })
                      }
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            onClick={onGuardar}
            disabled={fase === 'guardando' || seleccionadas === 0}
            className="w-full sm:w-auto"
          >
            {fase === 'guardando'
              ? 'Guardando…'
              : `Guardar ${seleccionadas} ${
                  seleccionadas === 1 ? 'pregunta' : 'preguntas'
                }`}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={reiniciar}
            disabled={fase === 'guardando'}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  // ───────────────────────────── Fase: subir ─────────────────────────────
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {encabezado}

      <Card>
        <CardContent>
          <form onSubmit={onAnalizar} className="flex flex-col gap-4">
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
              <Label htmlFor="archivo">Documento</Label>
              <input
                id="archivo"
                name="archivo"
                type="file"
                accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp,image/gif"
                className="max-w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-2.5 file:py-1 file:text-sm file:font-medium file:text-secondary-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Formatos aceptados: PDF, Word (DOCX) e imágenes (PNG, JPG).
              </p>
            </div>

            {aviso ? (
              <p
                role="status"
                className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
              >
                {aviso}
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div>
              <Button
                type="submit"
                disabled={fase === 'analizando'}
                className="w-full sm:w-auto"
              >
                {fase === 'analizando'
                  ? 'Analizando documento…'
                  : 'Analizar documento'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
