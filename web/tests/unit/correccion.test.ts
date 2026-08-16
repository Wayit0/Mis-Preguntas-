import { describe, it, expect } from 'vitest'
import {
  aplanarPreguntas,
  corregir,
  sinRespuestas,
  type ContenidoAsignacion,
  type PreguntaSnapshot,
} from '@/lib/tareas/contenido'

function sm(id: number, correcta: string | null): PreguntaSnapshot {
  return {
    preguntaId: id, tipo: 'seleccion_multiple', enunciado: `p${id}`,
    A: 'a', B: 'b', C: 'c', D: null, E: null,
    correcta, explicacion: 'porque sí',
    imagenPregunta: null, imagenA: null, imagenB: null, imagenC: null,
    imagenD: null, imagenE: null, imagenTamano: 'mediano',
  }
}

const contenido: ContenidoAsignacion = {
  textos: [{ titulo: 'Lectura', contenido: 'texto', preguntas: [sm(10, 'A')] }],
  preguntas: [sm(20, 'B'), { ...sm(30, null), tipo: 'desarrollo_corto' }, sm(40, 'C')],
}

describe('aplanarPreguntas', () => {
  it('textos primero, luego sueltas, en orden', () => {
    expect(aplanarPreguntas(contenido).map((p) => p.preguntaId)).toEqual([10, 20, 30, 40])
  })
})

describe('corregir', () => {
  it('cuenta solo selección múltiple con correcta; compara case-insensitive', () => {
    const r = corregir(contenido, { '0': 'a', '1': 'B ', '2': 'mi ensayo', '3': 'A' })
    expect(r).toEqual({ puntaje: 2, total: 3 }) // 10 y 20 buenas; 40 mala; 30 no puntúa
  })
  it('sin responder cuenta como mala', () => {
    expect(corregir(contenido, {})).toEqual({ puntaje: 0, total: 3 })
  })
  it('prueba 100% desarrollo: total 0', () => {
    const soloDes: ContenidoAsignacion = {
      textos: [], preguntas: [{ ...sm(1, null), tipo: 'desarrollo_largo' }],
    }
    expect(corregir(soloDes, { '0': 'x' })).toEqual({ puntaje: 0, total: 0 })
  })
})

describe('sinRespuestas', () => {
  it('elimina correcta y explicacion de todas las preguntas', () => {
    const s = sinRespuestas(contenido)
    const todas = [...s.textos.flatMap((t) => t.preguntas), ...s.preguntas]
    for (const p of todas) {
      expect('correcta' in p).toBe(false)
      expect('explicacion' in p).toBe(false)
    }
    expect(s.textos[0].titulo).toBe('Lectura')
  })
})
