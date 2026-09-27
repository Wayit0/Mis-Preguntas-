'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Crop, ImagePlus } from 'lucide-react'
import { crearPregunta, actualizarPregunta } from '@/lib/actions/preguntas'
import type { ResultadoPregunta } from '@/lib/actions/pregunta-fields'
import {
  TIPOS_PREGUNTA,
  ETIQUETA_TIPO,
  LETRAS,
  NIVELES_SUGERIDOS,
  TAMANOS_IMAGEN,
  ETIQUETA_TAMANO_IMAGEN,
  type TipoPregunta,
  type TamanoImagen,
} from '@/lib/validation/pregunta'
import type { Pregunta } from '@/lib/queries/preguntas'
import { ASIGNATURAS } from '@/components/shell/subjects'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import {
  DialogoRecorte,
  MAX_BYTES_IMAGEN,
  blobAImagen,
  imagenAArchivo,
} from '@/components/import/dialogo-recorte'
import type { ImagenParaGuardar } from '@/lib/validation/import'
import { LatexText } from './latex-text'
import { InsertarEcuacion } from './insertar-ecuacion'

/* eslint-disable @next/next/no-img-element */

// imageUrl no se importa de @/lib/storage/blob para no arrastrar el SDK de Azure
// al bundle del cliente. La ruta es estable: /api/uploads/<clave>.
function urlImagen(clave: string): string {
  return `/api/uploads/${clave}`
}

function CampoImagen({
  name,
  label,
  existente,
}: {
  name: string
  label: string
  existente?: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)
  // Imagen desde la que se recorta (siempre la completa: re-recortar no
  // degrada). `desdeArchivo` distingue una subida nueva de la ya guardada.
  const [original, setOriginal] = useState<{
    imagen: ImagenParaGuardar
    nombre: string
    desdeArchivo: boolean
  } | null>(null)
  const [recortando, setRecortando] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const src = preview ?? (existente ? urlImagen(existente) : null)

  /** Pone un archivo en el input real (así viaja en el FormData al guardar). */
  function fijarArchivo(archivo: File | null) {
    const input = inputRef.current
    if (!input) return
    const dt = new DataTransfer()
    if (archivo) dt.items.add(archivo)
    input.files = dt.files
  }

  function mostrar(imagen: ImagenParaGuardar | null, nombre: string | null) {
    setPreview(imagen ? `data:${imagen.mediaType};base64,${imagen.base64}` : null)
    setNombreArchivo(nombre)
  }

  async function abrirRecorte() {
    setError(null)
    if (original) {
      setRecortando(true)
      return
    }
    if (!existente) return
    // Imagen ya guardada: traerla para recortar en el navegador.
    setCargando(true)
    try {
      const res = await fetch(urlImagen(existente))
      const imagen = res.ok ? await blobAImagen(await res.blob()) : null
      if (!imagen) throw new Error()
      setOriginal({ imagen, nombre: existente, desdeArchivo: false })
      setRecortando(true)
    } catch {
      setError('No se pudo cargar la imagen para recortarla.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {src ? (
        <img
          src={src}
          alt="Vista previa"
          className="max-h-28 w-fit rounded-md border border-border object-contain"
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Botón claro de subida; el input real queda oculto (sr-only) pero
            dentro del form, así el archivo viaja igual en el FormData. */}
        <label
          htmlFor={name}
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/60 hover:text-foreground"
        >
          <ImagePlus className="size-3.5" aria-hidden />
          {src ? 'Cambiar imagen' : 'Agregar imagen'}
        </label>
        {src ? (
          <button
            type="button"
            onClick={abrirRecorte}
            disabled={cargando}
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
          >
            <Crop className="size-3.5" aria-hidden />
            {cargando ? 'Cargando…' : 'Recortar'}
          </button>
        ) : null}
      </div>
      {nombreArchivo ? (
        <span className="max-w-44 truncate text-xs text-muted-foreground">
          {nombreArchivo}
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <input
        ref={inputRef}
        id={name}
        name={name}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          setError(null)
          if (!f) {
            setOriginal(null)
            mostrar(null, null)
            return
          }
          setPreview(URL.createObjectURL(f))
          setNombreArchivo(f.name)
          if (f.size > MAX_BYTES_IMAGEN) {
            // Se deja tal cual (sin recorte); el servidor decide si la acepta.
            setOriginal(null)
            return
          }
          const imagen = await blobAImagen(f)
          if (!imagen) {
            setOriginal(null)
            return
          }
          setOriginal({ imagen, nombre: f.name, desdeArchivo: true })
          setRecortando(true)
        }}
      />
      {recortando && original ? (
        <DialogoRecorte
          original={original.imagen}
          onAplicar={(imagen) => {
            const archivo = imagenAArchivo(imagen, original.nombre)
            fijarArchivo(archivo)
            mostrar(imagen, archivo.name)
            setRecortando(false)
          }}
          onRestaurar={() => {
            if (original.desdeArchivo) {
              const archivo = imagenAArchivo(original.imagen, original.nombre)
              fijarArchivo(archivo)
              mostrar(original.imagen, archivo.name)
            } else {
              // Volver a la imagen guardada: no se sube nada nuevo.
              fijarArchivo(null)
              mostrar(null, null)
            }
            setRecortando(false)
          }}
          onCerrar={() => setRecortando(false)}
        />
      ) : null}
    </div>
  )
}

function nivelInicial(nivel: string | null | undefined): {
  base: string
  otro: string
} {
  const v = nivel ?? ''
  if (v === '') return { base: 'PAES', otro: '' }
  const enLista = (NIVELES_SUGERIDOS as readonly string[]).includes(v)
  if (enLista) return { base: v, otro: '' }
  return { base: 'Otro', otro: v }
}

export function FormularioPregunta({
  pregunta,
  asignaturaInicial,
  accionActualizar,
  hrefVolver,
}: {
  pregunta?: Pregunta
  asignaturaInicial?: string
  /**
   * Action de edición a usar (default: actualizarPregunta, con guard de
   * propiedad). El banco del colegio la sustituye por editarPreguntaColegio
   * (guard "mismo colegio + school_admin"). Sólo aplica en modo edición.
   */
  accionActualizar?: (
    id: number,
    formData: FormData,
  ) => Promise<ResultadoPregunta>
  /** Ruta a la que volver al guardar/cancelar (default: /preguntas?asignatura=). */
  hrefVolver?: string
}) {
  const router = useRouter()
  const esEdicion = Boolean(pregunta)

  const nivel0 = nivelInicial(pregunta?.nivel)

  const [asignatura, setAsignatura] = useState(
    pregunta?.asignatura ?? asignaturaInicial ?? ASIGNATURAS[0].nombre,
  )
  const [tipo, setTipo] = useState<TipoPregunta>(
    (pregunta?.tipo as TipoPregunta) ?? 'seleccion_multiple',
  )
  const [nivelBase, setNivelBase] = useState(nivel0.base)
  const [nivelOtro, setNivelOtro] = useState(nivel0.otro)
  const [correcta, setCorrecta] = useState(pregunta?.correcta ?? 'A')
  const [imagenTamano, setImagenTamano] = useState<TamanoImagen>(
    (pregunta?.imagenTamano as TamanoImagen) ?? 'mediano',
  )
  const [compartida, setCompartida] = useState((pregunta?.compartida ?? 0) > 0)

  const [enunciado, setEnunciado] = useState(pregunta?.pregunta ?? '')
  const [altA, setAltA] = useState(pregunta?.A ?? '')
  const [altB, setAltB] = useState(pregunta?.B ?? '')
  const [altC, setAltC] = useState(pregunta?.C ?? '')
  const [altD, setAltD] = useState(pregunta?.D ?? '')
  const [altE, setAltE] = useState(pregunta?.E ?? '')

  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  const nivelResuelto =
    nivelBase === 'Otro' ? nivelOtro.trim() || 'Otro' : nivelBase
  const esSeleccion = tipo === 'seleccion_multiple'

  /** Añade una ecuación `$...$` al final del valor actual de un campo. */
  function conEcuacion(valor: string, latexDelimitado: string): string {
    if (!valor.trim()) return latexDelimitado
    return `${valor}${valor.endsWith(' ') ? '' : ' '}${latexDelimitado}`
  }

  const alternativas: {
    letra: string
    valor: string
    set: (v: string) => void
  }[] = [
    { letra: 'A', valor: altA, set: setAltA },
    { letra: 'B', valor: altB, set: setAltB },
    { letra: 'C', valor: altC, set: setAltC },
    { letra: 'D', valor: altD, set: setAltD },
    { letra: 'E', valor: altE, set: setAltE },
  ]

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPendiente(true)

    const destino =
      hrefVolver ?? `/preguntas?asignatura=${encodeURIComponent(asignatura)}`
    const editar = accionActualizar ?? actualizarPregunta

    const formData = new FormData(e.currentTarget)
    try {
      const resultado = pregunta
        ? await editar(pregunta.id, formData)
        : await crearPregunta(formData)

      if (resultado && 'error' in resultado) {
        setError(resultado.error)
        setPendiente(false)
        return
      }

      // Éxito: la lista ya fue revalidada en el servidor; navegamos a ella.
      router.push(destino)
      router.refresh()
    } catch {
      setError('Ocurrió un error al guardar la pregunta. Inténtalo de nuevo.')
      setPendiente(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          {esEdicion ? 'Editar pregunta' : 'Agregar pregunta'}
          <span className="font-semibold text-muted-foreground">
            {' — '}
            {asignatura}
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Usa el botón «Ecuación» para insertar fórmulas con el editor visual.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        {/* Clasificación */}
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Asignatura</Label>
                <Select
                  name="asignatura"
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
                <Label>Tipo de pregunta</Label>
                <Select
                  name="tipo"
                  value={tipo}
                  onValueChange={(v) => setTipo(v as TipoPregunta)}
                >
                  <SelectTrigger
                    aria-label="Tipo de pregunta"
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

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="materia">Materia</Label>
                <Input
                  id="materia"
                  name="materia"
                  defaultValue={pregunta?.materia ?? ''}
                  placeholder="Ej: Mecánica"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contenido">Contenido / Tema</Label>
                <Input
                  id="contenido"
                  name="contenido"
                  defaultValue={pregunta?.contenido ?? ''}
                  placeholder="Ej: Movimiento rectilíneo"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Nivel</Label>
                <Select
                  value={nivelBase}
                  onValueChange={(v) => setNivelBase(v as string)}
                >
                  <SelectTrigger aria-label="Nivel" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NIVELES_SUGERIDOS.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {nivelBase === 'Otro' ? (
                  <Input
                    aria-label="Especifica el nivel"
                    value={nivelOtro}
                    onChange={(e) => setNivelOtro(e.target.value)}
                    placeholder="Ej: Reforzamiento"
                  />
                ) : null}
                <input type="hidden" name="nivel" value={nivelResuelto} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Enunciado */}
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pregunta">Enunciado</Label>
              <Textarea
                id="pregunta"
                name="pregunta"
                value={enunciado}
                onChange={(e) => setEnunciado(e.target.value)}
                placeholder="Escribe la pregunta…"
                rows={3}
                required
              />
            </div>
            <InsertarEcuacion
              onInsert={(latex) => setEnunciado((v) => conEcuacion(v, latex))}
            />
            {enunciado.trim() ? (
              <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-xs text-muted-foreground">
                  Vista previa:{' '}
                </span>
                <LatexText text={enunciado} />
              </div>
            ) : null}
            <CampoImagen
              name="imagen_pregunta"
              label="Imagen del enunciado (opcional)"
              existente={pregunta?.imagenPregunta}
            />
            <div className="flex flex-col gap-1.5">
              <Label>Tamaño de las imágenes al imprimir</Label>
              <Select
                name="imagen_tamano"
                value={imagenTamano}
                onValueChange={(v) => setImagenTamano(v as TamanoImagen)}
              >
                <SelectTrigger
                  aria-label="Tamaño de las imágenes al imprimir"
                  className="w-full sm:w-56"
                >
                  <SelectValue>
                    {(v: string) =>
                      ETIQUETA_TAMANO_IMAGEN[v as TamanoImagen] ?? v
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TAMANOS_IMAGEN.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ETIQUETA_TAMANO_IMAGEN[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                Aplica a la imagen del enunciado y de las alternativas en el PDF.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Alternativas (sólo selección múltiple) */}
        {esSeleccion ? (
          <Card>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm font-medium text-foreground">Alternativas</p>
              {alternativas.map(({ letra, valor, set }) => (
                <div
                  key={letra}
                  className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start"
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`alt-${letra}`}>Alternativa {letra}</Label>
                    <Input
                      id={`alt-${letra}`}
                      name={letra}
                      value={valor}
                      onChange={(e) => set(e.target.value)}
                    />
                    {valor.trim() ? (
                      <LatexText
                        text={valor}
                        className="text-xs text-muted-foreground"
                      />
                    ) : null}
                    <InsertarEcuacion
                      onInsert={(latex) => set(conEcuacion(valor, latex))}
                    />
                  </div>
                  <div className="sm:w-44">
                    <CampoImagen
                      name={`imagen_${letra}`}
                      label={`Imagen ${letra}`}
                      existente={
                        pregunta?.[
                          `imagen${letra}` as
                            | 'imagenA'
                            | 'imagenB'
                            | 'imagenC'
                            | 'imagenD'
                            | 'imagenE'
                        ]
                      }
                    />
                  </div>
                </div>
              ))}

              <div className="flex flex-col gap-1.5">
                <Label>Respuesta correcta</Label>
                <Select
                  name="correcta"
                  value={correcta}
                  onValueChange={(v) => setCorrecta(v as string)}
                >
                  <SelectTrigger
                    aria-label="Respuesta correcta"
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
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {tipo === 'desarrollo_corto'
                  ? 'El alumno dispondrá de 2 líneas para responder en el PDF.'
                  : 'El alumno dispondrá de 6 líneas para responder en el PDF.'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Explicación + visibilidad */}
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="explicacion">Explicación / pauta (opcional)</Label>
              <Textarea
                id="explicacion"
                name="explicacion"
                defaultValue={pregunta?.explicacion ?? ''}
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="flex flex-col">
                <Label htmlFor="compartida-switch">
                  Compartir con mis colaboradores
                </Label>
                <span className="text-xs text-muted-foreground">
                  Si está activa, tus colaboradores verán esta pregunta.
                </span>
              </div>
              <Switch
                id="compartida-switch"
                checked={compartida}
                onCheckedChange={(v) => setCompartida(Boolean(v))}
                aria-label="Compartir con mis colaboradores"
              />
              <input
                type="hidden"
                name="compartida"
                value={compartida ? '1' : '0'}
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
            {pendiente
              ? 'Guardando…'
              : esEdicion
                ? 'Guardar cambios'
                : 'Guardar pregunta'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pendiente}
            className="w-full sm:w-auto"
            onClick={() =>
              router.push(
                hrefVolver ??
                  `/preguntas?asignatura=${encodeURIComponent(asignatura)}`,
              )
            }
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  )
}
