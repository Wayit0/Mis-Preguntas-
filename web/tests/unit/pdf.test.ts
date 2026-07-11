import { describe, it, expect } from 'vitest'

import { generarPruebaPdf } from '@/lib/pdf/prueba'

// Smoke test del generador de PDF: con 2 preguntas (una de selección múltiple y
// una de desarrollo), SIN imágenes ni fórmulas, `generarPruebaPdf` debe devolver
// un Buffer que empieza con la firma `%PDF` y pesa más de 1 KB. No requiere
// Postgres ni Blob (no se descargan imágenes ni se rasterizan fórmulas).

describe('pdf/prueba', () => {
  it('genera un PDF (%PDF) > 1 KB con 2 preguntas sin imágenes', async () => {
    const buffer = await generarPruebaPdf({
      titulo: 'Prueba N°1 — Cinemática',
      asignatura: 'Física',
      colegio: 'Colegio de Prueba',
      profesor: 'Profe Test',
      instrucciones: 'Lee atentamente y responde todas las preguntas.',
      preguntas: [
        {
          enunciado: '¿Cuál es la unidad de la aceleración en el SI?',
          tipo: 'seleccion_multiple',
          A: 'm/s',
          B: 'm/s²',
          C: 'kg·m',
          D: 'N',
          E: 'J',
          correcta: 'B',
        },
        {
          enunciado: 'Explica con tus palabras el principio de inercia.',
          tipo: 'desarrollo_corto',
        },
      ],
    })

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.length).toBeGreaterThan(1024)
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF')
  })

  it('genera un PDF válido en formato IB (A4, Times, caja de instrucciones)', async () => {
    const buffer = await generarPruebaPdf({
      titulo: 'Prueba de Física — Nivel Medio',
      asignatura: 'Física',
      colegio: 'Colegio de Prueba',
      profesor: 'Profe Test',
      instrucciones:
        'No abras esta prueba hasta que se te indique.\nResponde todas las preguntas.',
      formato: 'ib',
      preguntas: [
        {
          enunciado: '¿Cuál es la unidad de la aceleración en el SI?',
          tipo: 'seleccion_multiple',
          A: 'm/s',
          B: 'm/s²',
          C: 'kg·m',
          correcta: 'B',
        },
        {
          enunciado: 'Explica el principio de inercia.',
          tipo: 'desarrollo_largo',
        },
      ],
    })

    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF')
    // El PDF IB usa Times (serif), no Helvetica: la fuente debe aparecer en el
    // catálogo del documento.
    const contenido = buffer.toString('latin1')
    expect(contenido).toContain('Times-Roman')
    expect(contenido).toContain('Times-Bold')
  })

  it('renderiza fórmulas $...$ en enunciado y alternativas (fórmula → PNG embebido)', async () => {
    const base = {
      titulo: 'Prueba',
      asignatura: 'Física',
      preguntas: [
        {
          enunciado: 'Si $v_0 = 2\\,m/s$, ¿cuál es la energía cinética?',
          tipo: 'seleccion_multiple',
          A: '$\\frac{1}{2}mv^2$',
          B: '$mgh$',
          C: 'No se puede saber',
          correcta: 'A',
        },
      ],
    }
    const conFormulas = await generarPruebaPdf(base)
    const sinFormulas = await generarPruebaPdf({
      ...base,
      preguntas: [
        {
          ...base.preguntas[0],
          enunciado: 'Si v0 = 2 m/s, ¿cuál es la energía cinética?',
          A: '(1/2)mv2',
          B: 'mgh',
        },
      ],
    })

    expect(conFormulas.subarray(0, 4).toString('ascii')).toBe('%PDF')
    // Los PNG de las 3 fórmulas embebidas deben abultar el PDF notoriamente
    // frente a la misma prueba en texto plano.
    expect(conFormulas.length).toBeGreaterThan(sinFormulas.length + 2000)
  })
})
