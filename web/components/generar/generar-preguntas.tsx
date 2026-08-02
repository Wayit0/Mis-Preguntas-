'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react'

import { guardarPreguntasImportadas } from '@/lib/actions/import'
import { enviarFeedback } from '@/lib/actions/feedback'
import {
  descartarBorradorImportacion,
  obtenerBorradorImportacion,
  actualizarBorradorImportacion,
} from '@/lib/actions/borradores-importacion'
import type { BorradorResumen } from '@/lib/import/borradores'
import {
  TIPOS_PREGUNTA,
  ETIQUETA_TIPO,
  LETRAS,
  type TipoPregunta,
} from '@/lib/validation/pregunta'
import type {
  PreguntaAnalizada,
  PreguntaEditableBorrador,
} from '@/lib/validation/import'
import {
  NIVELES_GENERADOR,
  CANTIDAD_GENERAR_DEFAULT,
  MIN_PREGUNTAS_GENERAR,
  MAX_PREGUNTAS_GENERAR,
  MAX_LARGO_TEMA,
  MAX_LARGO_QUE_EVALUAR,
  type ResultadoGeneracion,
} from '@/lib/validation/generar'
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

/**
 * Estado editable de la revisión: la MISMA forma que los borradores de
 * importación (preguntaEditableBorradorSchema), con todos los campos de imagen
 * en null (v1 no genera imágenes). Así el auto-guardado, retomar y el guardado
 * final reutilizan las actions de /importar sin cambios.
 */
type PreguntaEditable = PreguntaEditableBorrador

type Fase = 'configurar' | 'generando' | 'revisar' | 'guardando'

let contador = 0
function aEditable(p: PreguntaAnalizada): PreguntaEditable {
  const tipo = (TIPOS_PREGUNTA as readonly string[]).includes(p.tipo)
    ? (p.tipo as TipoPregunta)
    : 'seleccion_multiple'
  const correcta = (LETRAS as readonly string[]).includes(p.correcta ?? '')
    ? (p.correcta as string)
    : tipo === 'seleccion_multiple'
      ? 'A'
      : ''
  return {
    id: `gen-${contador++}`,
    incluir: true,
    carpetaId: null,
    compartida: 0,
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
    imagenPregunta: null,
    imagenPreguntaOriginal: null,
    imagenA: null,
    imagenAOriginal: null,
    imagenB: null,
    imagenBOriginal: null,
    imagenC: null,
    imagenCOriginal: null,
    imagenD: null,
    imagenDOriginal: null,
    imagenE: null,
    imagenEOriginal: null,
  }
}

/** Llama a /api/generar y lee el stream ndjson (ignora los pings). */
async function generarEnStreaming(params: {
  asignatura: string
  nivel: string
  tema: string
  queEvaluar: string
  tipo: TipoPregunta
  cantidad: number
}): Promise<ResultadoGeneracion> {
  const res = await fetch('/api/generar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok || !res.body) {
    const texto = (await res.text().catch(() => '')).trim()
    return {
      ok: false,
      error:
        texto || 'Ocurrió un error al generar las preguntas. Inténtalo de nuevo.',
    }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let resultado: ResultadoGeneracion | null = null

  const procesarLinea = (linea: string) => {
    if (!linea.trim()) return
    try {
      const obj = JSON.parse(linea)
      if (obj && typeof obj === 'object' && 'resultado' in obj) {
        resultado = obj.resultado as ResultadoGeneracion
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
      error:
        'La conexión se cortó antes de terminar la generación. Inténtalo de nuevo.',
    }
  )
}

/** Etapas por tiempo (sin progreso real), como en /importar. */
const ETAPAS_GENERACION = [
  { hastaMs: 3_000, texto: 'Preparando la generación' },
  { hastaMs: 40_000, texto: 'Creando las preguntas con la IA' },
  { hastaMs: Infinity, texto: 'Casi listo, ordenando las preguntas' },
] as const

function ProgresoGeneracion({ tema }: { tema: string }) {
  const [transcurrido, setTranscurrido] = useState(0)

  useEffect(() => {
    const inicio = Date.now()
    const timer = setInterval(() => setTranscurrido(Date.now() - inicio), 250)
    return () => clearInterval(timer)
  }, [])

  const progreso = Math.min(
    92,
    Math.round(100 * (1 - Math.exp(-transcurrido / 12_000))),
  )
  const etapaActual = ETAPAS_GENERACION.findIndex((e) => transcurrido < e.hastaMs)

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
          <div className="flex min-w-0 flex-col">
            <p className="text-sm font-medium text-foreground">
              Generando preguntas…
            </p>
            <p className="truncate text-xs text-muted-foreground">{tema}</p>
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
          {ETAPAS_GENERACION.map((etapa, i) => {
            const completada = i < etapaActual
            const activa = i === etapaActual
            if (i === ETAPAS_GENERACION.length - 1 && !activa) return null
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
                  <span
                    className="size-4 shrink-0 rounded-full border border-border"
                    aria-hidden
                  />
                )}
                {etapa.texto}
                {activa ? '…' : ''}
              </li>
            )
          })}
        </ul>

        <p className="text-xs text-muted-foreground">
          Esto puede tomar hasta un minuto. No cierres esta página.
        </p>
      </CardContent>
    </Card>
  )
}

/** Upsell cuando se agotó la cuota mensual de generaciones. */
function AvisoCuotaAgotada({ mensaje }: { mensaje?: string }) {
  return (
    <Card className="border border-accent-amber">
      <CardContent className="flex flex-col gap-2">
        <p role="alert" className="text-sm font-medium text-foreground">
          {mensaje ?? 'Alcanzaste tus generaciones con IA de este mes.'}
        </p>
        <Link
          href="/precios"
          className="w-fit text-sm font-medium text-primary hover:underline"
        >
          Conoce EduBox Pro — 100 generaciones al mes
        </Link>
      </CardContent>
    </Card>
  )
}

/** Disclaimer obligatorio de contenido generado por IA (fase revisar). */
function DisclaimerIa() {
  return (
    <Card className="border border-accent-amber bg-accent-amber/10">
      <CardContent className="flex items-start gap-2.5">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
        <p className="text-sm text-foreground">
          Estas preguntas fueron generadas por la IA de EduBox. Revísalas y
          edítalas antes de guardarlas: tú eres responsable del contenido que
          aplicas a tus estudiantes.
        </p>
      </CardContent>
    </Card>
  )
}

/**
 * Mini-encuesta contextual de la generación: 👍/👎 + comentario opcional.
 * Guarda junto al feedback los parámetros usados (tema, nivel, tipo), para
 * saber qué instrucciones producen buenas o malas preguntas. Desaparece tras
 * enviarse; no enviarla no afecta en nada al flujo.
 */
function EncuestaGeneracion({
  contexto,
}: {
  contexto: Record<string, unknown>
}) {
  const [voto, setVoto] = useState<1 | 5 | null>(null)
  const [comentario, setComentario] = useState('')
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'enviado'>('idle')

  if (estado === 'enviado') {
    return (
      <p className="text-sm text-muted-foreground">
        🙌 ¡Gracias! Tu opinión nos ayuda a mejorar la generación.
      </p>
    )
  }

  async function onEnviar() {
    if (voto == null) return
    setEstado('enviando')
    try {
      await enviarFeedback({
        pagina: '/generar',
        puntaje: voto,
        comentario,
        contexto: { ...contexto, encuesta: 'generacion' },
      })
    } catch {
      // Best-effort: perder un feedback no debe molestar al docente.
    }
    setEstado('enviado')
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-foreground">
            ¿Qué te parecieron las preguntas generadas?
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-pressed={voto === 5}
              aria-label="Buenas"
              onClick={() => setVoto(5)}
              className={`flex size-9 items-center justify-center rounded-full text-lg transition-transform hover:scale-110 ${
                voto === 5 ? 'bg-primary/15 ring-2 ring-primary' : 'grayscale hover:grayscale-0'
              }`}
            >
              <span aria-hidden>👍</span>
            </button>
            <button
              type="button"
              aria-pressed={voto === 1}
              aria-label="Malas"
              onClick={() => setVoto(1)}
              className={`flex size-9 items-center justify-center rounded-full text-lg transition-transform hover:scale-110 ${
                voto === 1 ? 'bg-primary/15 ring-2 ring-primary' : 'grayscale hover:grayscale-0'
              }`}
            >
              <span aria-hidden>👎</span>
            </button>
          </div>
        </div>

        {voto != null ? (
          <div className="flex flex-col gap-2">
            <Textarea
              aria-label="Comentario sobre las preguntas generadas"
              value={comentario}
              maxLength={500}
              onChange={(e) => setComentario(e.target.value)}
              rows={2}
              placeholder={
                voto === 5
                  ? '¿Qué te gustó? (opcional)'
                  : '¿Qué estuvo mal? Ej: muy fáciles, enunciado confuso… (opcional)'
              }
            />
            <div>
              <Button
                type="button"
                size="sm"
                onClick={onEnviar}
                disabled={estado === 'enviando'}
              >
                {estado === 'enviando' ? 'Enviando…' : 'Enviar opinión'}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function GenerarPreguntas({
  asignaturaInicial,
  cuota,
  borradores,
}: {
  asignaturaInicial?: string
  /** Cuota mensual de generaciones con IA del plan del usuario. */
  cuota: { limite: number; restantes: number }
  /** Borradores retomables del usuario (origen 'generar'). */
  borradores: BorradorResumen[]
}) {
  const router = useRouter()

  // Parámetros del formulario.
  const [asignatura, setAsignatura] = useState(
    asignaturaInicial ?? ASIGNATURAS[0].nombre,
  )
  const [nivelBase, setNivelBase] = useState<string>(NIVELES_GENERADOR[8]) // '1° Medio'
  const [nivelOtro, setNivelOtro] = useState('')
  const [tema, setTema] = useState('')
  const [queEvaluar, setQueEvaluar] = useState('')
  const [tipo, setTipo] = useState<TipoPregunta>('seleccion_multiple')
  const [cantidad, setCantidad] = useState(CANTIDAD_GENERAR_DEFAULT)

  const [fase, setFase] = useState<Fase>('configurar')
  const [error, setError] = useState<string | null>(null)
  const [sinCupoError, setSinCupoError] = useState(false)
  const [preguntas, setPreguntas] = useState<PreguntaEditable[]>([])
  const [borradorId, setBorradorId] = useState<number | null>(null)
  // Copia local + resincronización de props (mismo patrón y misma razón que
  // importar-documento.tsx: useState conserva el snapshot del primer montaje).
  const [listaBorradores, setListaBorradores] = useState(borradores)
  const [borradoresPrevios, setBorradoresPrevios] = useState(borradores)
  if (borradores !== borradoresPrevios) {
    setBorradoresPrevios(borradores)
    setListaBorradores(borradores)
  }

  const nivel = nivelBase === 'Otro' ? nivelOtro.trim() : nivelBase
  const seleccionadas = preguntas.filter((p) => p.incluir).length
  const sinCupo = cuota.restantes === 0 || sinCupoError

  async function onGenerar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSinCupoError(false)
    if (!nivel) {
      setError('Indica el nivel o curso.')
      return
    }
    if (!tema.trim() || !queEvaluar.trim()) {
      setError('Completa el tema y qué quieres evaluar.')
      return
    }

    setFase('generando')
    try {
      const resultado = await generarEnStreaming({
        asignatura,
        nivel,
        tema: tema.trim(),
        queEvaluar: queEvaluar.trim(),
        tipo,
        cantidad,
      })
      if (!resultado.ok) {
        setError(resultado.error)
        setSinCupoError(Boolean(resultado.sinCupo))
        setFase('configurar')
        return
      }
      setPreguntas(resultado.preguntas.map(aEditable))
      setBorradorId(resultado.borradorId ?? null)
      setFase('revisar')
    } catch {
      setError('Ocurrió un error al generar las preguntas. Inténtalo de nuevo.')
      setFase('configurar')
    }
  }

  function actualizar(id: string, cambios: Partial<PreguntaEditable>) {
    setPreguntas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)),
    )
  }

  // Auto-guardado del borrador: 3 s tras el último cambio en revisión.
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
        origen: 'ia',
        preguntas: incluidas.map((p) => ({
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
        })),
      })
      if (!resultado.ok) {
        setError(resultado.error)
        setFase('revisar')
        return
      }
      if (borradorId != null) {
        try {
          await descartarBorradorImportacion(borradorId)
        } catch {
          // La limpieza perezosa lo recogerá.
        }
        setBorradorId(null)
      }
      // Sin router.refresh(): ver la nota anti-carrera en importar-documento.
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
    setFase('configurar')
    setBorradorId(null)
    router.refresh()
  }

  async function onRetomar(id: number) {
    if (fase !== 'configurar') return
    setError(null)
    const res = await obtenerBorradorImportacion(id)
    if (!res.ok) {
      setError(res.error)
      setListaBorradores((prev) => prev.filter((b) => b.id !== id))
      return
    }
    const { borrador } = res
    setAsignatura(borrador.asignatura)
    setTema(borrador.nombreArchivo)
    setPreguntas(
      borrador.edicion ?? borrador.resultado.preguntas.map(aEditable),
    )
    setBorradorId(borrador.id)
    setFase('revisar')
  }

  async function onDescartar(id: number) {
    if (!window.confirm('¿Eliminar este borrador? No se puede deshacer.')) return
    await descartarBorradorImportacion(id).catch(() => {})
    setListaBorradores((prev) => prev.filter((b) => b.id !== id))
  }

  const encabezado = (
    <div className="flex flex-col gap-1">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
        Crear con IA
        <span className="font-semibold text-muted-foreground">
          {' — '}
          {asignatura}
        </span>
      </h1>
      <p className="text-sm text-muted-foreground">
        Describe el tema y qué quieres evaluar, y la IA de EduBox te propondrá
        preguntas para revisar y guardar en tu banco.
      </p>
    </div>
  )

  // ───────────────────────────── Fase: revisar ───────────────────────────
  if (fase === 'revisar' || fase === 'guardando') {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        {encabezado}

        <DisclaimerIa />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">
            {preguntas.length === 1
              ? '1 pregunta generada'
              : `${preguntas.length} preguntas generadas`}{' '}
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
            Generar otras
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
                            {(v: string) => ETIQUETA_TIPO[v as TipoPregunta] ?? v}
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
                  </div>

                  {esSeleccion ? (
                    <div className="flex flex-col gap-2">
                      {LETRAS.map((letra) => (
                        <div key={letra} className="flex flex-col gap-1.5">
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
                        </div>
                      ))}
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
                        placeholder="Ej: 2° Medio"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`explicacion-${p.id}`}>
                      Explicación / pauta
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

        <EncuestaGeneracion
          contexto={{
            tema,
            nivel,
            tipo,
            cantidadGenerada: preguntas.length,
          }}
        />
      </div>
    )
  }

  // ─────────────────────────── Fase: configurar ──────────────────────────
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {encabezado}

      {sinCupo ? (
        <AvisoCuotaAgotada
          mensaje={sinCupoError ? (error ?? undefined) : undefined}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Te quedan {cuota.restantes} de {cuota.limite} generaciones con IA
          este mes.
        </p>
      )}

      {fase === 'generando' ? <ProgresoGeneracion tema={tema} /> : null}

      <Card className={fase === 'generando' ? 'hidden' : undefined}>
        <CardContent>
          <form onSubmit={onGenerar} className="flex flex-col gap-4">
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
                <Label>Nivel / curso</Label>
                <Select
                  value={nivelBase}
                  onValueChange={(v) => setNivelBase(v as string)}
                >
                  <SelectTrigger aria-label="Nivel o curso" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NIVELES_GENERADOR.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {nivelBase === 'Otro' ? (
                  <Input
                    aria-label="Nivel personalizado"
                    value={nivelOtro}
                    onChange={(e) => setNivelOtro(e.target.value)}
                    placeholder="Ej: Electivo de 3° Medio"
                  />
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tema">Tema</Label>
              <Input
                id="tema"
                value={tema}
                maxLength={MAX_LARGO_TEMA}
                onChange={(e) => setTema(e.target.value)}
                placeholder="Ej: Leyes de Newton"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="que-evaluar">¿Qué quieres evaluar?</Label>
              <Textarea
                id="que-evaluar"
                value={queEvaluar}
                maxLength={MAX_LARGO_QUE_EVALUAR}
                onChange={(e) => setQueEvaluar(e.target.value)}
                rows={3}
                placeholder="Ej: que apliquen la segunda ley de Newton en problemas con fuerza de roce, con cálculo numérico"
              />
              <p className="text-xs text-muted-foreground">
                Mientras más específico seas, mejores serán las preguntas:
                indica la habilidad (calcular, analizar, interpretar…), el tipo
                de situación o problema, la dificultad y el contexto que
                quieres usar.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Tipo de pregunta</Label>
                <Select
                  value={tipo}
                  onValueChange={(v) => setTipo(v as TipoPregunta)}
                >
                  <SelectTrigger aria-label="Tipo de pregunta" className="w-full">
                    <SelectValue>
                      {(v: string) => ETIQUETA_TIPO[v as TipoPregunta] ?? v}
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

              <div className="flex flex-col gap-1.5">
                <Label>Cantidad de preguntas</Label>
                <Select
                  value={String(cantidad)}
                  onValueChange={(v) => setCantidad(Number(v))}
                >
                  <SelectTrigger
                    aria-label="Cantidad de preguntas"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(
                      { length: MAX_PREGUNTAS_GENERAR - MIN_PREGUNTAS_GENERAR + 1 },
                      (_, i) => MIN_PREGUNTAS_GENERAR + i,
                    ).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && !sinCupoError ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div>
              <Button
                type="submit"
                disabled={fase === 'generando' || sinCupo}
                className="w-full sm:w-auto"
              >
                {fase === 'generando' ? 'Generando…' : '✨ Generar preguntas'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {fase !== 'generando' && listaBorradores.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-semibold text-foreground">
                Generaciones en curso
              </h2>
              <p className="text-xs text-muted-foreground">
                Preguntas ya generadas que puedes retomar sin gastar otra
                generación. Se guardan por 30 días.
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
                        timeZone: 'America/Santiago',
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
