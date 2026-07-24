import { describe, it, expect } from 'vitest'

import { parsearRecorte } from '@/lib/validation/import'

describe('validation/import parsearRecorte', () => {
  it('parsea una caja válida', () => {
    expect(parsearRecorte('25,25,50,50')).toEqual({ x: 25, y: 25, ancho: 50, alto: 50 })
  })

  it('tolera espacios alrededor de cada número', () => {
    expect(parsearRecorte(' 10 , 20 , 30 , 40 ')).toEqual({ x: 10, y: 20, ancho: 30, alto: 40 })
  })

  it('null, undefined y string vacío → null', () => {
    expect(parsearRecorte(null)).toBeNull()
    expect(parsearRecorte(undefined)).toBeNull()
    expect(parsearRecorte('')).toBeNull()
  })

  it('formatos malformados → null', () => {
    expect(parsearRecorte('a,b,c,d')).toBeNull()
    expect(parsearRecorte('10,20,30')).toBeNull()
    expect(parsearRecorte('10,20,30,40,50')).toBeNull()
    expect(parsearRecorte('10.5,20,30,40')).toBeNull()
    expect(parsearRecorte('-5,20,30,40')).toBeNull()
  })

  it('clampea ancho/alto que se salen de la imagen', () => {
    expect(parsearRecorte('90,90,50,50')).toEqual({ x: 90, y: 90, ancho: 10, alto: 10 })
  })

  it('caja degenerada (menos de 5% por lado tras el clamp) → null', () => {
    expect(parsearRecorte('98,0,50,50')).toBeNull()
    expect(parsearRecorte('0,0,100,3')).toBeNull()
  })

  it('origen fuera de la imagen → null', () => {
    expect(parsearRecorte('100,0,10,10')).toBeNull()
    expect(parsearRecorte('0,120,10,10')).toBeNull()
  })
})
