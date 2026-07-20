import { describe, it, expect, afterEach } from 'vitest'
import { lanzamientoGratis } from '@/lib/suscripciones/lanzamiento'

const previo = process.env.LANZAMIENTO_GRATIS
afterEach(() => {
  process.env.LANZAMIENTO_GRATIS = previo
})

describe('lanzamientoGratis', () => {
  it('viene encendido mientras nadie lo apague', () => {
    delete process.env.LANZAMIENTO_GRATIS
    expect(lanzamientoGratis()).toBe(true)
  })

  it('se apaga solo con el valor exacto "false"', () => {
    process.env.LANZAMIENTO_GRATIS = 'false'
    expect(lanzamientoGratis()).toBe(false)
    process.env.LANZAMIENTO_GRATIS = 'true'
    expect(lanzamientoGratis()).toBe(true)
  })
})
