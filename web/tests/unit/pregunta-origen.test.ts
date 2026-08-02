import { describe, it, expect } from 'vitest'

import { origenDeFormData } from '@/lib/actions/pregunta-fields'

describe('origenDeFormData', () => {
  it("default 'manual' cuando el campo falta o trae basura", () => {
    expect(origenDeFormData(new FormData())).toBe('manual')
    const fd = new FormData()
    fd.set('origen', 'hackeado')
    expect(origenDeFormData(fd)).toBe('manual')
  })

  it('acepta los orígenes válidos', () => {
    for (const origen of ['manual', 'importada', 'ia'] as const) {
      const fd = new FormData()
      fd.set('origen', origen)
      expect(origenDeFormData(fd)).toBe(origen)
    }
  })
})
