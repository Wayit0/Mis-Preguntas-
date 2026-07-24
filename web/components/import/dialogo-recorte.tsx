'use client'

import { useState } from 'react'
import ReactCrop, { type PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

import type { ImagenParaGuardar } from '@/lib/validation/import'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'

/* eslint-disable @next/next/no-img-element */

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
  onRestaurar: () => void
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
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onRestaurar}>
            Restaurar original
          </Button>
          <DialogClose render={<Button type="button" variant="outline" />}>
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
