import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { describe, it, expect } from 'vitest'

import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'

import {
  contarPaginasPdf,
  extraerBloquesDocumento,
  TipoArchivoNoSoportadoError,
  MIME_DOCX,
  MIME_PDF,
  type BloqueImagen,
  type BloqueTexto,
  type BloqueDocumento,
} from '@/lib/docparse/extract'

// Fixtures generados por tests/fixtures/generar-fixtures.mjs.
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const docxBytes = readFileSync(join(fixturesDir, 'sample.docx'))
const pngBytes = readFileSync(join(fixturesDir, 'sample.png'))

describe('docparse/extract', () => {
  it('DOCX → un bloque de texto con el texto esperado y sin imágenes', async () => {
    const { bloques, imagenes } = await extraerBloquesDocumento({
      data: docxBytes,
      mime: MIME_DOCX,
    })

    expect(bloques).toHaveLength(1)
    const bloque = bloques[0] as BloqueTexto
    expect(bloque.type).toBe('text')
    expect(bloque.text).toContain('Pregunta de prueba: ¿cuánto es 2 + 2?')
    expect(imagenes).toEqual([])
  })

  it('PNG → un bloque de imagen base64 con media_type correcto', async () => {
    const { bloques, imagenes } = await extraerBloquesDocumento({
      data: pngBytes,
      mime: 'image/png',
    })

    expect(bloques).toHaveLength(1)
    const bloque = bloques[0] as BloqueImagen
    expect(bloque.type).toBe('image')
    expect(bloque.source.type).toBe('base64')
    expect(bloque.source.media_type).toBe('image/png')
    // base64 sin saltos de línea y decodificable a los bytes originales.
    expect(bloque.source.data).not.toMatch(/\s/)
    expect(Buffer.from(bloque.source.data, 'base64').equals(pngBytes)).toBe(true)
    expect(imagenes).toEqual([])
  })

  it('PDF → un bloque document base64', async () => {
    // Un PDF mínimo válido basta: la función no parsea el PDF, lo codifica.
    const pdfBytes = Buffer.from('%PDF-1.4\n%mini\n', 'utf8')
    const { bloques, imagenes } = await extraerBloquesDocumento({
      data: pdfBytes,
      mime: MIME_PDF,
    })

    expect(bloques).toHaveLength(1)
    const bloque = bloques[0] as BloqueDocumento
    expect(bloque.type).toBe('document')
    expect(bloque.source.type).toBe('base64')
    expect(bloque.source.media_type).toBe('application/pdf')
    expect(Buffer.from(bloque.source.data, 'base64').equals(pdfBytes)).toBe(true)
    expect(imagenes).toEqual([])
  })

  it('acepta un Blob/File (FormData) y usa su mime', async () => {
    const blob = new Blob([new Uint8Array(pngBytes)], { type: 'image/png' })
    const { bloques } = await extraerBloquesDocumento(blob)

    const bloque = bloques[0] as BloqueImagen
    expect(bloque.type).toBe('image')
    expect(bloque.source.media_type).toBe('image/png')
  })

  it('tipo no soportado lanza TipoArchivoNoSoportadoError', async () => {
    await expect(
      extraerBloquesDocumento({ data: Buffer.from('x'), mime: 'application/zip' }),
    ).rejects.toBeInstanceOf(TipoArchivoNoSoportadoError)
  })

  it('PDF con imágenes incrustadas → bloque document + imágenes numeradas (JPEG y PNG; filtra diminutas)', async () => {
    const jpeg = await sharp({
      create: { width: 120, height: 90, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
      .jpeg()
      .toBuffer()
    const png = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .png()
      .toBuffer()
    // Diminuta (16px): debe filtrarse como decorativa.
    const icono = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer()

    const doc = await PDFDocument.create()
    const page = doc.addPage([400, 400])
    const imgJpeg = await doc.embedJpg(jpeg)
    const imgPng = await doc.embedPng(png)
    const imgIcono = await doc.embedPng(icono)
    page.drawImage(imgJpeg, { x: 20, y: 250, width: 120, height: 90 })
    page.drawImage(imgPng, { x: 20, y: 120, width: 100, height: 100 })
    page.drawImage(imgIcono, { x: 20, y: 80, width: 16, height: 16 })
    const pdfBytes = Buffer.from(await doc.save())

    const { bloques, imagenes } = await extraerBloquesDocumento({
      data: pdfBytes,
      mime: MIME_PDF,
    })

    expect(imagenes).toHaveLength(2)
    expect(imagenes.map((i) => i.indice)).toEqual([0, 1])
    // Cada imagen extraída es decodificable por sharp (round-trip real).
    for (const img of imagenes) {
      const meta = await sharp(Buffer.from(img.base64, 'base64')).metadata()
      expect(meta.width).toBeGreaterThanOrEqual(90)
    }

    // Bloques: document + (texto "Imagen n:" + imagen) por cada una.
    expect(bloques[0].type).toBe('document')
    expect(bloques).toHaveLength(1 + 2 * 2)
    expect((bloques[1] as BloqueTexto).text).toBe('Imagen 0:')
    expect((bloques[2] as BloqueImagen).type).toBe('image')
  })

  it('contarPaginasPdf: cuenta páginas reales y devuelve null con bytes que no son PDF', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.addPage()
    doc.addPage()
    const bytes = await doc.save()

    expect(await contarPaginasPdf(bytes)).toBe(3)
    expect(await contarPaginasPdf(Buffer.from('no soy un pdf'))).toBeNull()
  })

  it('DOCX con una imagen incrustada → marcador [IMAGEN_0] + bloques de imagen', async () => {
    const docxConImagenBytes = readFileSync(
      join(fixturesDir, 'sample-con-imagen.docx'),
    )
    const { bloques, imagenes } = await extraerBloquesDocumento({
      data: docxConImagenBytes,
      mime: MIME_DOCX,
    })

    expect(imagenes).toHaveLength(1)
    expect(imagenes[0].indice).toBe(0)
    expect(imagenes[0].mediaType).toBe('image/png')

    const textoBloque = bloques[0] as BloqueTexto
    expect(textoBloque.text).toContain('[IMAGEN_0]')

    expect(bloques).toHaveLength(3)
    expect((bloques[1] as BloqueTexto).text).toBe('Imagen 0:')
    const imagenBloque = bloques[2] as BloqueImagen
    expect(imagenBloque.type).toBe('image')
    expect(imagenBloque.source.media_type).toBe('image/png')
    expect(imagenBloque.source.data).toBe(imagenes[0].base64)
  })

  it('DOCX con content-type de imagen no estándar (p. ej. "image/png;base64") igual se reconoce', async () => {
    // Reproduce un bug real: algunas herramientas de banco de preguntas
    // declaran el content-type de la imagen con un sufijo no estándar
    // ("image/png;base64" en vez de "image/png"), lo que antes hacía que se
    // descartaran TODAS las imágenes del documento (comparación exacta fallida).
    const docxBytes = readFileSync(
      join(fixturesDir, 'sample-con-imagen-content-type-raro.docx'),
    )
    const { imagenes } = await extraerBloquesDocumento({
      data: docxBytes,
      mime: MIME_DOCX,
    })

    expect(imagenes).toHaveLength(1)
    expect(imagenes[0].mediaType).toBe('image/png')
  })
})
