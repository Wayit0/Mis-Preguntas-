'use client'

import { useEffect, useRef, useState } from 'react'
import { guardarDibujoTarea } from '@/lib/actions/entregas'
import { Button } from '@/components/ui/button'

// Mismo motivo que en responder-tarea.tsx: ruta estable a /api/uploads/<clave>,
// sin importar lib/storage/blob (arrastraría el SDK de Azure al cliente).
function urlImagen(clave: string): string {
  return `/api/uploads/${clave}`
}

// Resolución interna del canvas (fija, independiente del tamaño en pantalla).
// El trazo se escala según el tamaño real mostrado (ver `coordenadas`), así
// que dibujar en un celular angosto o en un iPad grande da el mismo resultado.
const ANCHO = 800
const ALTO = 280

/**
 * Cuadro de dibujo para el desarrollo de una pregunta (tipo `desarrollo_corto`):
 * el estudiante puede escribir/dibujar con mouse, dedo o lápiz (Apple Pencil u
 * otro stylus compatible con Pointer Events, que reporta presión real). Cada
 * trazo termina autoguardándose como PNG en el Blob vía `guardarDibujoTarea`
 * (mismo patrón de debounce que el autoguardado de texto).
 */
export function CanvasDibujo({
  asignacionId,
  indice,
  claveInicial,
}: {
  asignacionId: number
  indice: number
  claveInicial?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dibujando = useRef(false)
  const ultimoPunto = useRef<{ x: number; y: number } | null>(null)
  // Pila de dataURLs para "Deshacer" (no viaja al servidor, solo vive en memoria).
  const historial = useRef<string[]>([])
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [puedeDeshacer, setPuedeDeshacer] = useState(false)
  const [estadoGuardado, setEstadoGuardado] = useState<
    'inactivo' | 'guardando' | 'guardado' | 'error'
  >('inactivo')

  function fondoBlanco(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, ANCHO, ALTO)
  }

  // Carga inicial: fondo blanco y, si había un dibujo previo (borrador o
  // rehacer), se pinta encima para poder seguir donde quedó.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    fondoBlanco(ctx)
    if (claveInicial) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, ANCHO, ALTO)
      img.src = urlImagen(claveInicial)
    }
    // Solo al montar: `claveInicial` es la foto inicial, no algo que deba
    // repintar si cambia (el propio autoguardado no debe reiniciar el canvas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function coordenadas(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * ANCHO,
      y: ((e.clientY - rect.top) / rect.height) * ALTO,
    }
  }

  function apilarHistorial() {
    const canvas = canvasRef.current
    if (!canvas) return
    historial.current.push(canvas.toDataURL('image/png'))
    if (historial.current.length > 20) historial.current.shift()
    setPuedeDeshacer(true)
  }

  function programarAutoguardado() {
    if (temporizador.current) clearTimeout(temporizador.current)
    setEstadoGuardado('guardando')
    temporizador.current = setTimeout(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.toBlob((blob) => {
        if (!blob) {
          setEstadoGuardado('error')
          return
        }
        const fd = new FormData()
        fd.append('imagen', blob, 'dibujo.png')
        guardarDibujoTarea(asignacionId, indice, fd)
          .then((r) => setEstadoGuardado('error' in r ? 'error' : 'guardado'))
          .catch(() => setEstadoGuardado('error'))
      }, 'image/png')
    }, 1200)
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    apilarHistorial()
    dibujando.current = true
    ultimoPunto.current = coordenadas(e)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current || !ultimoPunto.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const punto = coordenadas(e)
    // Presión real en dispositivos con lápiz (0 a 1); 0.5 de línea base para
    // mouse/dedo, que siempre reportan presión 0.
    const presion = e.pressure > 0 ? e.pressure : 0.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 1.5 + presion * 3
    ctx.beginPath()
    ctx.moveTo(ultimoPunto.current.x, ultimoPunto.current.y)
    ctx.lineTo(punto.x, punto.y)
    ctx.stroke()
    ultimoPunto.current = punto
  }

  function onPointerUp() {
    if (!dibujando.current) return
    dibujando.current = false
    ultimoPunto.current = null
    programarAutoguardado()
  }

  function onDeshacer() {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const anterior = historial.current.pop()
    setPuedeDeshacer(historial.current.length > 0)
    if (!anterior) {
      fondoBlanco(ctx)
    } else {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, ANCHO, ALTO)
      img.src = anterior
    }
    programarAutoguardado()
  }

  function onBorrar() {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    apilarHistorial()
    fondoBlanco(ctx)
    programarAutoguardado()
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">
        ✏️ Dibuja tu desarrollo (funciona con lápiz en iPad o similar):
      </p>
      <canvas
        ref={canvasRef}
        width={ANCHO}
        height={ALTO}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
        className="w-full touch-none rounded-md border border-border bg-white"
        style={{ aspectRatio: `${ANCHO} / ${ALTO}` }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDeshacer}
          disabled={!puedeDeshacer}
        >
          Deshacer
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onBorrar}>
          Borrar todo
        </Button>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {estadoGuardado === 'guardando'
            ? 'Guardando dibujo…'
            : estadoGuardado === 'guardado'
              ? '✓ Dibujo guardado'
              : estadoGuardado === 'error'
                ? 'No se pudo guardar el dibujo.'
                : null}
        </p>
      </div>
    </div>
  )
}
