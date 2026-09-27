'use client'

import { useState } from 'react'
import ReactCrop, { type PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

import type { ImagenParaGuardar } from '@/lib/validation/import'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'

/* eslint-disable @next/next/no-img-element */

/** Tipos que se aceptan al subir una imagen a mano (los mismos que acepta Blob). */
export const ACCEPT_IMAGEN = 'image/png,image/jpeg,image/webp,image/gif'

/** Tamaño máximo de una imagen subida a mano (antes de recortar). */
export const MAX_BYTES_IMAGEN = 10 * 1024 * 1024

const TIPOS_IMAGEN: readonly ImagenParaGuardar['mediaType'][] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]

/**
 * Lee un archivo/blob de imagen a base64 + mime. Devuelve null si el tipo no
 * está en la whitelist (p. ej. SVG) o no se pudo leer.
 */
export async function blobAImagen(blob: Blob): Promise<ImagenParaGuardar | null> {
  const mediaType = blob.type.split(';')[0].trim().toLowerCase()
  if (!(TIPOS_IMAGEN as readonly string[]).includes(mediaType)) return null
  const dataUrl = await new Promise<string | null>((resolve) => {
    const lector = new FileReader()
    lector.onload = () => resolve(typeof lector.result === 'string' ? lector.result : null)
    lector.onerror = () => resolve(null)
    lector.readAsDataURL(blob)
  })
  const base64 = dataUrl?.split(',')[1]
  return base64
    ? { base64, mediaType: mediaType as ImagenParaGuardar['mediaType'] }
    : null
}

/** Convierte una imagen base64 en un `File` (para meterla en un input/FormData). */
export function imagenAArchivo(imagen: ImagenParaGuardar, nombre: string): File {
  const binario = atob(imagen.base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  const ext = imagen.mediaType.split('/')[1].replace('jpeg', 'jpg')
  const base = nombre.replace(/\.[^.]+$/, '') || 'imagen'
  return new File([bytes], `${base}.${ext}`, { type: imagen.mediaType })
}

/** Selección inicial: casi toda la imagen, para partir ajustando bordes. */
const CROP_INICIAL: PercentCrop = { unit: '%', x: 5, y: 5, width: 90, height: 90 }

/**
 * Recorta la imagen original en el navegador con canvas, según la selección en
 * porcentajes. GIF/WebP salen como PNG (canvas no codifica GIF); JPEG se
 * conserva como JPEG para no inflar fotos. Devuelve null si la imagen no se
 * puede decodificar o la selección es degenerada.
 */
async function recortarConCanvas(
  original: ImagenParaGuardar,
  crop: PercentCrop,
): Promise<ImagenParaGuardar | null> {
  if (!crop.width || !crop.height || crop.width < 1 || crop.height < 1) return null

  const img = new Image()
  img.src = `data:${original.mediaType};base64,${original.base64}`
  try {
    await img.decode()
  } catch {
    return null
  }

  const sx = Math.round((crop.x / 100) * img.naturalWidth)
  const sy = Math.round((crop.y / 100) * img.naturalHeight)
  const sw = Math.max(1, Math.round((crop.width / 100) * img.naturalWidth))
  const sh = Math.max(1, Math.round((crop.height / 100) * img.naturalHeight))

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

  const mediaType = original.mediaType === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  const base64 = canvas.toDataURL(mediaType).split(',')[1]
  return base64 ? { base64, mediaType } : null
}

/**
 * Diálogo de recorte manual. Siempre recorta DESDE la imagen original (la de
 * antes de cualquier recorte, de IA o manual): re-recortar no degrada.
 */
export function DialogoRecorte({
  original,
  onAplicar,
  onRestaurar,
  onCerrar,
}: {
  original: ImagenParaGuardar
  onAplicar: (imagen: ImagenParaGuardar) => void
  /** Si no se pasa, no se muestra el botón «Restaurar original». */
  onRestaurar?: () => void
  onCerrar: () => void
}) {
  const [crop, setCrop] = useState<PercentCrop>(CROP_INICIAL)
  const [error, setError] = useState<string | null>(null)
  const [aplicando, setAplicando] = useState(false)

  async function aplicar() {
    setAplicando(true)
    setError(null)
    const recortada = await recortarConCanvas(original, crop)
    setAplicando(false)
    if (!recortada) {
      setError('No se pudo recortar la imagen. Ajusta la selección e inténtalo de nuevo.')
      return
    }
    onAplicar(recortada)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCerrar()
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogTitle>Recortar imagen</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Arrastra sobre la imagen para elegir la zona que quieres conservar.
        </p>
        <div className="flex justify-center">
          <ReactCrop crop={crop} onChange={(_, porcentual) => setCrop(porcentual)}>
            <img
              src={`data:${original.mediaType};base64,${original.base64}`}
              alt="Imagen a recortar"
              className="max-h-[60vh] max-w-full"
            />
          </ReactCrop>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {/* Deshabilitar mientras aplicando para evitar que Restaurar/Cancelar pisen el onAplicar en vuelo */}
        <div className="flex flex-wrap justify-end gap-2">
          {onRestaurar ? (
            <Button type="button" variant="outline" onClick={onRestaurar} disabled={aplicando}>
              Restaurar original
            </Button>
          ) : null}
          <DialogClose render={<Button type="button" variant="outline" disabled={aplicando} />}>
            Cancelar
          </DialogClose>
          <Button type="button" onClick={aplicar} disabled={aplicando}>
            {aplicando ? 'Recortando…' : 'Aplicar recorte'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
