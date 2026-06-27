import { describe, it, expect } from 'vitest'
import { uploadImage, safeImageResponseHeaders } from '@/lib/storage/blob'

describe('uploadImage: whitelist de tipos', () => {
  it('rechaza SVG (vector de XSS) antes de tocar Azure', async () => {
    const svg = new File(['<svg onload="alert(1)"></svg>'], 'evil.svg', {
      type: 'image/svg+xml',
    })
    await expect(uploadImage(svg)).rejects.toThrow(/no permitido/i)
  })

  it('rechaza HTML disfrazado de imagen', async () => {
    const html = new File(['<script>alert(1)</script>'], 'x.html', {
      type: 'text/html',
    })
    await expect(uploadImage(html)).rejects.toThrow(/no permitido/i)
  })

  it('rechaza una extensión .svg aunque el content-type venga vacío', async () => {
    const svg = new File(['<svg></svg>'], 'logo.svg', { type: '' })
    await expect(uploadImage(svg)).rejects.toThrow(/no permitido/i)
  })
})

describe('safeImageResponseHeaders: servir blobs', () => {
  it('sirve PNG inline con cabeceras de defensa', () => {
    const h = safeImageResponseHeaders('image/png')
    expect(h['Content-Type']).toBe('image/png')
    expect(h['Content-Disposition']).toBe('inline')
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['Content-Security-Policy']).toContain("default-src 'none'")
    expect(h['Content-Security-Policy']).toContain('sandbox')
  })

  it('degrada un SVG almacenado a descarga octet-stream (no lo renderiza)', () => {
    const h = safeImageResponseHeaders('image/svg+xml')
    expect(h['Content-Type']).toBe('application/octet-stream')
    expect(h['Content-Disposition']).toBe('attachment')
    expect(h['X-Content-Type-Options']).toBe('nosniff')
  })

  it('degrada text/html a descarga', () => {
    const h = safeImageResponseHeaders('text/html')
    expect(h['Content-Type']).toBe('application/octet-stream')
    expect(h['Content-Disposition']).toBe('attachment')
  })
})
