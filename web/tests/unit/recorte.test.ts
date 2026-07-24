import sharp from 'sharp'
import { describe, it, expect } from 'vitest'

import { recortarImagen, aplicarRecortesIA } from '@/lib/import/recorte'
import { parsearRecorte } from '@/lib/validation/import'
import type { ImagenExtraida } from '@/lib/docparse/extract'
import type { PreguntaDetectada } from '@/lib/validation/import'

describe('validation/import parsearRecorte', () => {
  it('parsea una caja válida', () => {
    expect(parsearRecorte('25,25,50,50')).toEqual({ x: 25, y: 25, ancho: 50, alto: 50 })
  })

  it('tolera espacios alrededor de cada número', () => {
    expect(parsearRecorte(' 10 , 20 , 30 , 40 ')).toEqual({ x: 10, y: 20, ancho: 30, alto: 40 })
  })

  it('null, undefined y string vacío → null', () => {
    expect(parsearRecorte(null)).toBeNull()
    expect(parsearRecorte(undefined)).toBeNull()
    expect(parsearRecorte('')).toBeNull()
  })

  it('formatos malformados → null', () => {
    expect(parsearRecorte('a,b,c,d')).toBeNull()
    expect(parsearRecorte('10,20,30')).toBeNull()
    expect(parsearRecorte('10,20,30,40,50')).toBeNull()
    expect(parsearRecorte('10.5,20,30,40')).toBeNull()
    expect(parsearRecorte('-5,20,30,40')).toBeNull()
  })

  it('clampea ancho/alto que se salen de la imagen', () => {
    expect(parsearRecorte('90,90,50,50')).toEqual({ x: 90, y: 90, ancho: 10, alto: 10 })
  })

  it('caja degenerada (menos de 5% por lado tras el clamp) → null', () => {
    expect(parsearRecorte('98,0,50,50')).toBeNull()
    expect(parsearRecorte('0,0,100,3')).toBeNull()
  })

  it('origen fuera de la imagen → null', () => {
    expect(parsearRecorte('100,0,10,10')).toBeNull()
    expect(parsearRecorte('0,120,10,10')).toBeNull()
  })
})

/** PNG sólido generado con sharp, como `ImagenExtraida` en el índice dado. */
async function imagenDePrueba(
  width = 100,
  height = 100,
  indice = 0,
): Promise<ImagenExtraida> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer()
  return { indice, mediaType: 'image/png', base64: buf.toString('base64') }
}

/** Pregunta detectada mínima válida, con overrides. */
function pregunta(extra: Partial<PreguntaDetectada> = {}): PreguntaDetectada {
  return {
    pregunta: '¿Cuánto es 2 + 2?',
    tipo: 'seleccion_multiple',
    ...extra,
  } as PreguntaDetectada
}

describe('import/recorte recortarImagen', () => {
  it('recorta un 50% de una imagen de 100x100 → 50x50 del mismo formato', async () => {
    const img = await imagenDePrueba(100, 100)
    const res = await recortarImagen(img, { x: 0, y: 0, ancho: 50, alto: 50 })
    expect(res).not.toBeNull()
    expect(res!.mediaType).toBe('image/png')
    const meta = await sharp(Buffer.from(res!.base64, 'base64')).metadata()
    expect(meta.width).toBe(50)
    expect(meta.height).toBe(50)
  })

  it('resultado menor a 32px por lado → null (imagen queda completa)', async () => {
    const img = await imagenDePrueba(100, 100)
    expect(await recortarImagen(img, { x: 0, y: 0, ancho: 10, alto: 50 })).toBeNull()
    expect(await recortarImagen(img, { x: 0, y: 0, ancho: 50, alto: 10 })).toBeNull()
  })

  it('bytes no decodificables → null, sin lanzar', async () => {
    const rota: ImagenExtraida = {
      indice: 0,
      mediaType: 'image/png',
      base64: Buffer.from('no soy una imagen').toString('base64'),
    }
    expect(await recortarImagen(rota, { x: 0, y: 0, ancho: 50, alto: 50 })).toBeNull()
  })
})

describe('import/recorte aplicarRecortesIA', () => {
  it('con recorte válido: agrega imagen nueva y reapunta el índice', async () => {
    const original = await imagenDePrueba(200, 200)
    const { preguntas, imagenes } = await aplicarRecortesIA(
      [pregunta({ imagenPreguntaIndice: 0, imagenPreguntaRecorte: '0,0,50,50' })],
      [original],
    )
    expect(imagenes).toHaveLength(2)
    expect(imagenes[1].indice).toBe(1)
    expect(preguntas[0].imagenPreguntaIndice).toBe(1)
    expect(preguntas[0].imagenPreguntaOriginalIndice).toBe(0)
    // La original se conserva intacta en su índice.
    expect(imagenes[0]).toEqual(original)
    const meta = await sharp(Buffer.from(imagenes[1].base64, 'base64')).metadata()
    expect(meta.width).toBe(100)
    expect(meta.height).toBe(100)
  })

  it('recorte malformado o degenerado → pregunta e imágenes intactas', async () => {
    const original = await imagenDePrueba(200, 200)
    const { preguntas, imagenes } = await aplicarRecortesIA(
      [pregunta({ imagenPreguntaIndice: 0, imagenPreguntaRecorte: 'basura' })],
      [original],
    )
    expect(imagenes).toHaveLength(1)
    expect(preguntas[0].imagenPreguntaIndice).toBe(0)
    expect(preguntas[0].imagenPreguntaOriginalIndice).toBeUndefined()
  })

  it('recorte sin imagen resoluble (índice fuera de rango o null) → intacta', async () => {
    const original = await imagenDePrueba(200, 200)
    const casos = [
      pregunta({ imagenPreguntaIndice: 7, imagenPreguntaRecorte: '0,0,50,50' }),
      pregunta({ imagenPreguntaIndice: null, imagenPreguntaRecorte: '0,0,50,50' }),
      pregunta({ imagenPreguntaIndice: 0 }),
    ]
    const { preguntas, imagenes } = await aplicarRecortesIA(casos, [original])
    expect(imagenes).toHaveLength(1)
    expect(preguntas[0].imagenPreguntaOriginalIndice).toBeUndefined()
    expect(preguntas[1].imagenPreguntaOriginalIndice).toBeUndefined()
    expect(preguntas[2].imagenPreguntaIndice).toBe(0)
  })

  it('dos preguntas pueden recortar la MISMA imagen con cajas distintas', async () => {
    const original = await imagenDePrueba(200, 200)
    const { preguntas, imagenes } = await aplicarRecortesIA(
      [
        pregunta({ imagenPreguntaIndice: 0, imagenPreguntaRecorte: '0,0,50,50' }),
        pregunta({ imagenPreguntaIndice: 0, imagenPreguntaRecorte: '50,50,50,50' }),
      ],
      [original],
    )
    expect(imagenes).toHaveLength(3)
    expect(preguntas[0].imagenPreguntaIndice).toBe(1)
    expect(preguntas[1].imagenPreguntaIndice).toBe(2)
    expect(preguntas[1].imagenPreguntaOriginalIndice).toBe(0)
  })
})
