import { describe, it, expect } from 'vitest'

import {
  feedbackSchema,
  MAX_LARGO_COMENTARIO_FEEDBACK,
} from '@/lib/validation/feedback'

describe('validation/feedback', () => {
  const base = { pagina: '/generar', puntaje: 5 }

  it('acepta un feedback mínimo (sin comentario ni contexto)', () => {
    const r = feedbackSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.comentario).toBe('')
  })

  it('acepta comentario y contexto pequeño', () => {
    const r = feedbackSchema.safeParse({
      ...base,
      puntaje: 1,
      comentario: '  Las preguntas salieron muy fáciles  ',
      contexto: { tema: 'Leyes de Newton', nivel: '2° Medio' },
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.comentario).toBe('Las preguntas salieron muy fáciles')
    }
  })

  it('rechaza puntaje fuera de 1–5 y página vacía', () => {
    expect(feedbackSchema.safeParse({ ...base, puntaje: 0 }).success).toBe(false)
    expect(feedbackSchema.safeParse({ ...base, puntaje: 6 }).success).toBe(false)
    expect(feedbackSchema.safeParse({ ...base, puntaje: 4.5 }).success).toBe(false)
    expect(
      feedbackSchema.safeParse({ pagina: '  ', puntaje: 3 }).success,
    ).toBe(false)
  })

  it('rechaza comentario y contexto sobre el tope', () => {
    expect(
      feedbackSchema.safeParse({
        ...base,
        comentario: 'x'.repeat(MAX_LARGO_COMENTARIO_FEEDBACK + 1),
      }).success,
    ).toBe(false)
    expect(
      feedbackSchema.safeParse({
        ...base,
        contexto: { relleno: 'x'.repeat(5000) },
      }).success,
    ).toBe(false)
  })
})
