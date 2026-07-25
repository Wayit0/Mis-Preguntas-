import sharp from 'sharp'

import type { ImagenExtraida, MediaTypeImagen } from '@/lib/docparse/extract'
import {
  parsearRecorte,
  type CajaRecorte,
  type PreguntaAnalizada,
  type PreguntaDetectada,
} from '@/lib/validation/import'

// ---------------------------------------------------------------------------
// Recorte server-side de las imágenes del documento (propuesto por la IA).
//
// Cuando una imagen incrustada contiene más contenido que la figura relevante
// (caso real: un bitmap pegado en Word que abarca la tabla Y el texto de las
// preguntas), la IA propone en `imagenPreguntaRecorte` la zona a conservar.
// Aquí se valida la caja y se recorta con sharp DESPUÉS de la detección: el
// recorte entra como imagen NUEVA al arreglo (la original se conserva, otras
// preguntas pueden referenciarla y el cliente la necesita para «Restaurar
// original») y la pregunta pasa a apuntar al índice nuevo.
//
// Regla de oro: un recorte malo NUNCA hace fallar la importación — cualquier
// problema (caja inválida, imagen no decodificable, resultado diminuto) deja
// la imagen completa en silencio.
// ---------------------------------------------------------------------------

/**
 * Lado mínimo (px) del resultado de un recorte: por debajo de esto la caja de
 * la IA es casi seguro un error (o la imagen era diminuta) y se ignora.
 */
export const LADO_MINIMO_RECORTE_PX = 32

/**
 * Recorta una imagen según la caja (porcentajes 0-100 ya validados por
 * `parsearRecorte`). Devuelve null si la imagen no se puede decodificar o el
 * resultado quedaría menor a `LADO_MINIMO_RECORTE_PX` por lado. Conserva JPEG
 * como JPEG (fotos: PNG las inflaría); el resto sale como PNG.
 */
export async function recortarImagen(
  imagen: ImagenExtraida,
  caja: CajaRecorte,
): Promise<{ mediaType: MediaTypeImagen; base64: string } | null> {
  const buffer = Buffer.from(imagen.base64, 'base64')

  let anchoPx: number | undefined
  let altoPx: number | undefined
  try {
    const meta = await sharp(buffer).metadata()
    anchoPx = meta.width
    altoPx = meta.height
  } catch {
    return null
  }
  if (!anchoPx || !altoPx) return null

  const left = Math.round((caja.x / 100) * anchoPx)
  const top = Math.round((caja.y / 100) * altoPx)
  const width = Math.min(Math.round((caja.ancho / 100) * anchoPx), anchoPx - left)
  const height = Math.min(Math.round((caja.alto / 100) * altoPx), altoPx - top)
  if (width < LADO_MINIMO_RECORTE_PX || height < LADO_MINIMO_RECORTE_PX) {
    return null
  }

  try {
    const recorte = sharp(buffer).extract({ left, top, width, height })
    const esJpeg = imagen.mediaType === 'image/jpeg'
    const salida = await (esJpeg ? recorte.jpeg() : recorte.png()).toBuffer()
    return {
      mediaType: esJpeg ? 'image/jpeg' : 'image/png',
      base64: salida.toString('base64'),
    }
  } catch {
    return null
  }
}

/**
 * Post-proceso de la detección: aplica los recortes propuestos por la IA a la
 * imagen del enunciado de cada pregunta. Devuelve las preguntas (reapuntadas a
 * la imagen recortada cuando aplicó, con `imagenPreguntaOriginalIndice` al
 * índice de la original) y el arreglo de imágenes ampliado con los recortes.
 * Nunca lanza por una pregunta problemática: esa pregunta queda intacta.
 */
export async function aplicarRecortesIA(
  preguntas: PreguntaDetectada[],
  imagenes: ImagenExtraida[],
): Promise<{ preguntas: PreguntaAnalizada[]; imagenes: ImagenExtraida[] }> {
  const todas = [...imagenes]
  const resultado: PreguntaAnalizada[] = []

  for (const p of preguntas) {
    const caja = parsearRecorte(p.imagenPreguntaRecorte)
    const indice = p.imagenPreguntaIndice
    const original =
      caja != null && indice != null && Number.isInteger(indice) && indice >= 0
        ? todas[indice]
        : undefined
    if (!caja || !original) {
      resultado.push(p)
      continue
    }

    let recorte: { mediaType: MediaTypeImagen; base64: string } | null = null
    try {
      recorte = await recortarImagen(original, caja)
    } catch {
      recorte = null
    }
    if (!recorte) {
      resultado.push(p)
      continue
    }

    const nueva: ImagenExtraida = { indice: todas.length, ...recorte }
    todas.push(nueva)
    resultado.push({
      ...p,
      imagenPreguntaIndice: nueva.indice,
      imagenPreguntaOriginalIndice: original.indice,
    })
  }

  return { preguntas: resultado, imagenes: todas }
}
