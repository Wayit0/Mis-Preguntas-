import { describe, it, expect } from 'vitest'

import { latexToPng } from '@/lib/latex/render'

/** Firma de un archivo PNG: bytes 0x89 'P' 'N' 'G'. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47])

function esPng(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).equals(PNG_SIGNATURE)
}

describe('latex/render', () => {
  it('latexToPng("x^2+1") retorna un Buffer PNG no vacío', async () => {
    const png = await latexToPng('x^2+1')

    expect(Buffer.isBuffer(png)).toBe(true)
    expect(png.length).toBeGreaterThan(0)
    expect(esPng(png)).toBe(true)
  })

  it('latexToPng con una fracción ("\\frac{1}{2}") retorna un PNG válido', async () => {
    const png = await latexToPng('\\frac{1}{2}')

    expect(esPng(png)).toBe(true)
    expect(png.length).toBeGreaterThan(0)
  })

  it('respeta el color y la escala sin romper la firma PNG', async () => {
    const png = await latexToPng('a+b', { color: '#10b981', scale: 3 })

    expect(esPng(png)).toBe(true)
    expect(png.length).toBeGreaterThan(0)
  })

  it('no lanza ante TeX inválido: devuelve igualmente un PNG', async () => {
    const png = await latexToPng('\\frac{1}{')

    expect(esPng(png)).toBe(true)
  })
})
