'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, FileText, Loader2 } from 'lucide-react'

import { guardarPreguntasImportadas } from '@/lib/actions/import'
import {
  descartarBorradorImportacion,
  obtenerBorradorImportacion,
  actualizarBorradorImportacion,
} from '@/lib/actions/borradores-importacion'
import type { BorradorResumen } from '@/lib/import/borradores'
import type { ResultadoAnalisis } from '@/lib/import/analizar'
import {
  TIPOS_PREGUNTA,
  ETIQUETA_TIPO,
  LETRAS,
  type TipoPregunta,
} from '@/lib/validation/pregunta'
import {
  MAX_PAGINAS_PDF,
  parsearImagenesAlternativas,
  type ImagenParaGuardar,
  type PreguntaAnalizada,
  type PreguntaEditableBorrador,
} from '@/lib/validation/import'
import type { ImagenExtraida } from '@/lib/docparse/extract'
import { ASIGNATURAS } from '@/components/shell/subjects'
import { DialogoRecorte } from '@/components/import/dialogo-recorte'
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

/**
 * Una pregunta detectada, ya en forma editable (sin nulls) + selección.
 * La forma es el schema compartido `preguntaEditableBorradorSchema`: es lo
 * que el auto-guardado persiste y lo que retomar restaura.
 */
type PreguntaEditable = PreguntaEditableBorrador

/** Columna de imagen editable de una alternativa (`imagenA`…`imagenE`). */
type CampoImagenAlternativa = `imagen${(typeof LETRAS)[number]}`

/** Cualquier columna de imagen editable (enunciado o alternativa). */
type CampoImagen = 'imagenPregunta' | CampoImagenAlternativa
/** La columna que guarda la imagen original (pre-recorte) de un campo. */
type CampoImagenOriginal = `${CampoImagen}Original`

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
  p: PreguntaAnalizada,
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
  // Imagen por alternativa desde el string compacto "A:0,B:1" que puso la IA.
  const porLetra = new Map(
    parsearImagenesAlternativas(p.imagenesAlternativas).map((ia) => [
      ia.letra,
      ia.indice,
    ]),
  )
  const imagenPregunta = resolverImagen(p.imagenPreguntaIndice, imagenesDisponibles)
  const imagenA = resolverImagen(porLetra.get('A'), imagenesDisponibles)
  const imagenB = resolverImagen(porLetra.get('B'), imagenesDisponibles)
  const imagenC = resolverImagen(porLetra.get('C'), imagenesDisponibles)
  const imagenD = resolverImagen(porLetra.get('D'), imagenesDisponibles)
  const imagenE = resolverImagen(porLetra.get('E'), imagenesDisponibles)
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
    imagenPregunta,
    // Si el servidor aplicó un recorte de la IA, la original vive en otro
    // índice; si no, la original ES la imagen asignada.
    imagenPreguntaOriginal:
      resolverImagen(p.imagenPreguntaOriginalIndice, imagenesDisponibles) ??
      imagenPregunta,
    imagenA,
    imagenAOriginal: imagenA,
    imagenB,
    imagenBOriginal: imagenB,
    imagenC,
    imagenCOriginal: imagenC,
    imagenD,
    imagenDOriginal: imagenD,
    imagenE,
    imagenEOriginal: imagenE,
  }
}

/** Miniatura de una imagen detectada, con botones para recortarla o quitarla. */
function MiniaturaImagen({
  imagen,
  alt,
  onQuitar,
  onRecortar,
}: {
  imagen: ImagenParaGuardar
  alt: string
  onQuitar: () => void
  onRecortar: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <img
        src={`data:${imagen.mediaType};base64,${imagen.base64}`}
        alt={alt}
        className="max-h-24 w-fit rounded-md border border-border object-contain"
      />
      <div className="flex flex-col gap-1 sm:flex-row">
        <Button type="button" variant="outline" size="sm" onClick={onRecortar}>
          Recortar
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onQuitar}>
          Quitar imagen
        </Button>
      </div>
    </div>
  )
}

type Fase = 'subir' | 'analizando' | 'revisar' | 'guardando'

/**
 * Llama a `/api/importar` y lee la respuesta ndjson en streaming: ignora los
 * keepalives `{"ping":true}` (que mantienen viva la conexión durante un
 * análisis largo; ver el route handler) y devuelve la línea final
 * `{"resultado":{...}}`.
 */
async function analizarEnStreaming(formData: FormData): Promise<ResultadoAnalisis> {
  const res = await fetch('/api/importar', { method: 'POST', body: formData })
  if (!res.ok || !res.body) {
    const texto = (await res.text().catch(() => '')).trim()
    return {
      ok: false,
      error: texto || 'Ocurrió un error al analizar el documento. Inténtalo de nuevo.',
    }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let resultado: ResultadoAnalisis | null = null

  const procesarLinea = (linea: string) => {
    if (!linea.trim()) return
    try {
      const obj = JSON.parse(linea)
      if (obj && typeof obj === 'object' && 'resultado' in obj) {
        resultado = obj.resultado as ResultadoAnalisis
      }
    } catch {
      // Línea parcial o ruido: se ignora.
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lineas = buffer.split('\n')
    buffer = lineas.pop() ?? ''
    lineas.forEach(procesarLinea)
  }
  procesarLinea(buffer)

  return (
    resultado ?? {
      ok: false,
      error: 'La conexión se cortó antes de terminar el análisis. Inténtalo de nuevo.',
    }
  )
}

/**
 * Etapas mostradas durante el análisis. El análisis es UNA llamada al servidor
 * (sin progreso real), así que las etapas avanzan por tiempo transcurrido:
 * dan una señal honesta de "estamos trabajando" sin inventar precisión. La
 * detección con IA es lo que domina el tiempo total (20-60 s con documentos
 * largos), por eso concentra la mayor parte de la línea de tiempo.
 */
const ETAPAS_ANALISIS = [
  { hastaMs: 2_000, texto: 'Leyendo el documento' },
  { hastaMs: 6_000, texto: 'Extrayendo texto e imágenes' },
  { hastaMs: 45_000, texto: 'Detectando preguntas con la IA' },
  { hastaMs: Infinity, texto: 'Casi listo, ordenando las preguntas' },
] as const

/** Panel de progreso mientras la IA analiza el documento. */
function ProgresoAnalisis({ nombreArchivo }: { nombreArchivo: string }) {
  const [transcurrido, setTranscurrido] = useState(0)

  useEffect(() => {
    const inicio = Date.now()
    const timer = setInterval(() => setTranscurrido(Date.now() - inicio), 250)
    return () => clearInterval(timer)
  }, [])

  // Avance asintótico hacia 92%: rápido al inicio y se frena al final, sin
  // llegar nunca a 100 (eso ocurre cuando el servidor responde y cambia la fase).
  const progreso = Math.min(92, Math.round(100 * (1 - Math.exp(-transcurrido / 15_000))))
  const etapaActual = ETAPAS_ANALISIS.findIndex((e) => transcurrido < e.hastaMs)

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
          <div className="flex min-w-0 flex-col">
            <p className="text-sm font-medium text-foreground">
              Analizando el documento…
            </p>
            {nombreArchivo ? (
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <FileText className="size-3 shrink-0" aria-hidden />
                {nombreArchivo}
              </p>
            ) : null}
          </div>
        </div>

        <div
          role="progressbar"
          aria-valuenow={progreso}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progreso}%` }}
          />
        </div>

        <ul className="flex flex-col gap-1.5" aria-live="polite">
          {ETAPAS_ANALISIS.map((etapa, i) => {
            const completada = i < etapaActual
            const activa = i === etapaActual
            // La etapa de reserva ("casi listo") sólo aparece si se alcanza.
            if (i === ETAPAS_ANALISIS.length - 1 && !activa) return null
            return (
              <li
                key={etapa.texto}
                className={`flex items-center gap-2 text-sm ${
                  activa
                    ? 'font-medium text-foreground'
                    : completada
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/50'
                }`}
              >
                {completada ? (
                  <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />
                ) : activa ? (
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <span className="size-4 shrink-0 rounded-full border border-border" aria-hidden />
                )}
                {etapa.texto}
                {activa ? '…' : ''}
              </li>
            )
          })}
        </ul>

        <p className="text-xs text-muted-foreground">
          Esto puede tomar hasta un minuto según el largo del documento. No
          cierres esta página.
        </p>
      </CardContent>
    </Card>
  )
}

/** Tarjeta de upsell cuando se agotó la cuota de importaciones con IA del mes. */
function AvisoCuotaAgotada({ mensaje }: { mensaje?: string }) {
  return (
    <Card className="border border-accent-amber">
      <CardContent className="flex flex-col gap-2">
        <p role="alert" className="text-sm font-medium text-foreground">
          {mensaje ?? 'Alcanzaste tus importaciones con IA de este mes.'}
        </p>
        <Link
          href="/precios"
          className="w-fit text-sm font-medium text-primary hover:underline"
        >
          Conoce EduBox Pro — 100 importaciones al mes
        </Link>
      </CardContent>
    </Card>
  )
}

export function ImportarDocumento({
  asignaturaInicial,
  cuota,
  borradores,
}: {
  asignaturaInicial?: string
  /** Cuota mensual de importaciones con IA del plan del usuario. */
  cuota: { limite: number; restantes: number }
  /** Borradores retomables del usuario (para «Importaciones en curso»). */
  borradores: BorradorResumen[]
}) {
  const router = useRouter()

  const [asignatura, setAsignatura] = useState(
    asignaturaInicial ?? ASIGNATURAS[0].nombre,
  )
  const [fase, setFase] = useState<Fase>('subir')
  const [error, setError] = useState<string | null>(null)
  // La ruta puede rechazar la petición por falta de cupo (carrera con otra
  // pestaña, o la cuota mostrada al cargar la página quedó desactualizada).
  // Se distingue del error genérico para mostrar el mismo CTA a Pro.
  const [sinCupoError, setSinCupoError] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [preguntas, setPreguntas] = useState<PreguntaEditable[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  // Imagen en recorte manual: qué pregunta y qué campo. El diálogo se monta
  // una sola vez (fuera del map de tarjetas) y recorta SIEMPRE desde la
  // imagen original guardada en el estado editable.
  const [recortando, setRecortando] = useState<{
    id: string
    campo: CampoImagen
  } | null>(null)
  // Borrador activo de esta revisión (para el auto-guardado y el borrado al
  // completar). Null si el análisis no alcanzó a crear uno (best-effort).
  const [borradorId, setBorradorId] = useState<number | null>(null)
  // Copia local de la lista para reflejar retomas/descartes sin recargar.
  const [listaBorradores, setListaBorradores] = useState(borradores)

  const seleccionadas = preguntas.filter((p) => p.incluir).length
  const sinCupo = cuota.restantes === 0 || sinCupoError

  async function onAnalizar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSinCupoError(false)
    setAviso(null)

    const formData = new FormData(e.currentTarget)
    const archivo = formData.get('archivo')
    if (!(archivo instanceof File) || archivo.size === 0) {
      setError('Sube un documento (PDF, DOCX o imagen).')
      return
    }
    formData.set('asignatura', asignatura)
    setNombreArchivo(archivo.name)

    setFase('analizando')
    try {
      const resultado = await analizarEnStreaming(formData)
      if (!resultado.ok) {
        setError(resultado.error)
        setSinCupoError(Boolean(resultado.sinCupo))
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
      setBorradorId(resultado.borradorId ?? null)
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

  // Auto-guardado del borrador: 3 s después del último cambio en revisión.
  // Best-effort: un fallo se ignora (se reintenta con el próximo cambio).
  useEffect(() => {
    if (fase !== 'revisar' || borradorId == null) return
    const timer = setTimeout(() => {
      actualizarBorradorImportacion(borradorId, preguntas).catch(() => {})
    }, 3000)
    return () => clearTimeout(timer)
  }, [preguntas, fase, borradorId])

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
      // El borrador ya cumplió su función; eliminarlo es best-effort.
      if (borradorId != null) {
        try {
          await descartarBorradorImportacion(borradorId)
        } catch {
          // La limpieza perezosa lo recogerá.
        }
      }
      // Sin router.refresh(): crearPregunta ya revalida /preguntas server-side,
      // y un refresh() justo tras push() corre una carrera que puede abortar
      // el redirect (visto en e2e: ERR_ABORTED del RSC de la navegación).
      router.push(`/preguntas?asignatura=${encodeURIComponent(asignatura)}`)
    } catch {
      setError('Ocurrió un error al guardar las preguntas. Inténtalo de nuevo.')
      setFase('revisar')
    }
  }

  function reiniciar() {
    setPreguntas([])
    setError(null)
    setSinCupoError(false)
    setAviso(null)
    setRecortando(null)
    setFase('subir')
    setBorradorId(null)
    // La lista del server component puede estar desactualizada (p. ej. el
    // análisis recién hecho creó un borrador): recargar props.
    router.refresh()
  }

  async function onRetomar(id: number) {
    setError(null)
    const res = await obtenerBorradorImportacion(id)
    if (!res.ok) {
      setError(res.error)
      setListaBorradores((prev) => prev.filter((b) => b.id !== id))
      return
    }
    const { borrador } = res
    setAsignatura(borrador.asignatura)
    setNombreArchivo(borrador.nombreArchivo)
    setPreguntas(
      borrador.edicion ??
        borrador.resultado.preguntas.map((p) =>
          aEditable(p, borrador.resultado.imagenes),
        ),
    )
    setBorradorId(borrador.id)
    setFase('revisar')
  }

  async function onDescartar(id: number) {
    if (!window.confirm('¿Eliminar este borrador? No se puede deshacer.')) return
    await descartarBorradorImportacion(id).catch(() => {})
    setListaBorradores((prev) => prev.filter((b) => b.id !== id))
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
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">
              {preguntas.length === 1
                ? '1 pregunta detectada'
                : `${preguntas.length} preguntas detectadas`}{' '}
              <span className="font-normal text-muted-foreground">
                · revisa, edita y elige cuáles guardar
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Cuando el documento no trae la respuesta correcta, la IA la
              resuelve y deja la pauta en la explicación — revísalas antes de
              guardar.
            </p>
          </div>
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

        {(() => {
          if (!recortando) return null
          const pregunta = preguntas.find((q) => q.id === recortando.id)
          if (!pregunta) return null
          const original =
            pregunta[`${recortando.campo}Original` as CampoImagenOriginal] ??
            pregunta[recortando.campo]
          if (!original) return null
          return (
            <DialogoRecorte
              original={original}
              onAplicar={(imagen) => {
                actualizar(recortando.id, { [recortando.campo]: imagen })
                setRecortando(null)
              }}
              onRestaurar={() => {
                actualizar(recortando.id, { [recortando.campo]: original })
                setRecortando(null)
              }}
              onCerrar={() => setRecortando(null)}
            />
          )
        })()}

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
                        onRecortar={() =>
                          setRecortando({ id: p.id, campo: 'imagenPregunta' })
                        }
                      />
                    ) : null}
                  </div>

                  {esSeleccion ? (
                    <div className="flex flex-col gap-2">
                      {LETRAS.map((letra) => {
                        const campoImagen =
                          `imagen${letra}` as CampoImagenAlternativa
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
                                onRecortar={() =>
                                  setRecortando({ id: p.id, campo: campoImagen })
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
  // Durante el análisis se muestra el panel de progreso; el formulario queda
  // MONTADO pero oculto para no perder el archivo elegido si el análisis falla
  // y hay que volver a intentar.
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {encabezado}

      {sinCupo ? (
        <AvisoCuotaAgotada mensaje={sinCupoError ? (error ?? undefined) : undefined} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Te quedan {cuota.restantes} de {cuota.limite} importaciones con IA
          este mes.
        </p>
      )}

      {fase === 'analizando' ? (
        <ProgresoAnalisis nombreArchivo={nombreArchivo} />
      ) : null}

      <Card className={fase === 'analizando' ? 'hidden' : undefined}>
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
                Formatos aceptados: PDF (máx. {MAX_PAGINAS_PDF} páginas), Word
                (DOCX) e imágenes (PNG, JPG).
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

            {error && !sinCupoError ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div>
              <Button
                type="submit"
                disabled={fase === 'analizando' || sinCupo}
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

      {fase !== 'analizando' && listaBorradores.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-semibold text-foreground">
                Importaciones en curso
              </h2>
              <p className="text-xs text-muted-foreground">
                Análisis ya hechos que puedes retomar sin gastar otra
                importación. Se guardan por 30 días.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {listaBorradores.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {b.nombreArchivo}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {b.asignatura} ·{' '}
                      {b.numPreguntas === 1
                        ? '1 pregunta'
                        : `${b.numPreguntas} preguntas`}{' '}
                      ·{' '}
                      {new Date(b.actualizadoEn).toLocaleString('es-CL', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" onClick={() => onRetomar(b.id)}>
                      Retomar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onDescartar(b.id)}
                    >
                      Descartar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
