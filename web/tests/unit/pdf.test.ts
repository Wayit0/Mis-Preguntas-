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
})
