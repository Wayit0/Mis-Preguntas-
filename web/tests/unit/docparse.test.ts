import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { describe, it, expect } from 'vitest'

import {
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
  it('DOCX → un bloque de texto con el texto esperado', async () => {
    const bloques = await extraerBloquesDocumento({ data: docxBytes, mime: MIME_DOCX })

    expect(bloques).toHaveLength(1)
    const bloque = bloques[0] as BloqueTexto
    expect(bloque.type).toBe('text')
    expect(bloque.text).toContain('Pregunta de prueba: ¿cuánto es 2 + 2?')
  })

  it('PNG → un bloque de imagen base64 con media_type correcto', async () => {
    const bloques = await extraerBloquesDocumento({ data: pngBytes, mime: 'image/png' })

    expect(bloques).toHaveLength(1)
    const bloque = bloques[0] as BloqueImagen
    expect(bloque.type).toBe('image')
    expect(bloque.source.type).toBe('base64')
    expect(bloque.source.media_type).toBe('image/png')
    // base64 sin saltos de línea y decodificable a los bytes originales.
    expect(bloque.source.data).not.toMatch(/\s/)
    expect(Buffer.from(bloque.source.data, 'base64').equals(pngBytes)).toBe(true)
  })

  it('PDF → un bloque document base64', async () => {
    // Un PDF mínimo válido basta: la función no parsea el PDF, lo codifica.
    const pdfBytes = Buffer.from('%PDF-1.4\n%mini\n', 'utf8')
    const bloques = await extraerBloquesDocumento({ data: pdfBytes, mime: MIME_PDF })

    expect(bloques).toHaveLength(1)
    const bloque = bloques[0] as BloqueDocumento
    expect(bloque.type).toBe('document')
    expect(bloque.source.type).toBe('base64')
    expect(bloque.source.media_type).toBe('application/pdf')
    expect(Buffer.from(bloque.source.data, 'base64').equals(pdfBytes)).toBe(true)
  })

  it('acepta un Blob/File (FormData) y usa su mime', async () => {
    const blob = new Blob([new Uint8Array(pngBytes)], { type: 'image/png' })
    const bloques = await extraerBloquesDocumento(blob)

    const bloque = bloques[0] as BloqueImagen
    expect(bloque.type).toBe('image')
    expect(bloque.source.media_type).toBe('image/png')
  })

  it('tipo no soportado lanza TipoArchivoNoSoportadoError', async () => {
    await expect(
      extraerBloquesDocumento({ data: Buffer.from('x'), mime: 'application/zip' }),
    ).rejects.toBeInstanceOf(TipoArchivoNoSoportadoError)
  })
})
