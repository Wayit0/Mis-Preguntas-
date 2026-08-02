import { describe, it, expect } from 'vitest'

import {
  generarParamsSchema,
  preguntaGeneradaValidaSchema,
  NIVELES_GENERADOR,
  MAX_PREGUNTAS_GENERAR,
} from '@/lib/validation/generar'

describe('validation/generar', () => {
  const paramsOk = {
    asignatura: 'Física',
    nivel: '2° Medio',
    tema: 'Leyes de Newton',
    queEvaluar: 'Aplicar la segunda ley en problemas con roce',
    tipo: 'seleccion_multiple',
    cantidad: 3,
  }

  it('acepta parámetros válidos', () => {
    const r = generarParamsSchema.safeParse(paramsOk)
    expect(r.success).toBe(true)
  })

  it('rechaza cantidad fuera de rango y campos vacíos', () => {
    expect(
      generarParamsSchema.safeParse({ ...paramsOk, cantidad: MAX_PREGUNTAS_GENERAR + 1 })
        .success,
    ).toBe(false)
    expect(generarParamsSchema.safeParse({ ...paramsOk, cantidad: 0 }).success).toBe(false)
    expect(generarParamsSchema.safeParse({ ...paramsOk, tema: '  ' }).success).toBe(false)
    expect(
      generarParamsSchema.safeParse({ ...paramsOk, tipo: 'verdadero_falso' }).success,
    ).toBe(false)
  })

  it('la criba exige enunciado no vacío', () => {
    expect(
      preguntaGeneradaValidaSchema.safeParse({ pregunta: '   ' }).success,
    ).toBe(false)
    expect(
      preguntaGeneradaValidaSchema.safeParse({
        pregunta: '¿Cuánto es $2+2$?',
        A: '3',
        B: '4',
        C: '5',
        D: '6',
        E: null,
        correcta: 'B',
        explicacion: 'Suma directa.',
      }).success,
    ).toBe(true)
  })

  it('incluye cursos chilenos', () => {
    expect(NIVELES_GENERADOR).toContain('8° Básico')
    expect(NIVELES_GENERADOR).toContain('4° Medio')
    expect(NIVELES_GENERADOR).toContain('Otro')
  })
})
