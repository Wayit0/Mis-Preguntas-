import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import { usuarios, preguntas, colaboraciones } from '@/lib/db/schema'
import { puedeVerImagen } from '@/lib/queries/uploads'

// IDs y claves únicos para ser robustos contra la BD de prueba compartida.
const sello = Date.now()
const kPropia = `propia-${sello}.png`
const kCompartida = `compartida-${sello}.png`
const kDesconocida = `desconocida-${sello}.png`

let autor: number // crea preguntas (una privada, una compartida)
let colega: number // autor lo invitó como colaborador
let tercero: number // sin relación con autor

beforeAll(async () => {
  const [a] = await db
    .insert(usuarios)
    .values({ nombre: 'Autor', email: `autor-${sello}@x.cl`, passwordHash: 'x' })
    .returning()
  const [b] = await db
    .insert(usuarios)
    .values({ nombre: 'Colega', email: `colega-${sello}@x.cl`, passwordHash: 'x' })
    .returning()
  const [c] = await db
    .insert(usuarios)
    .values({ nombre: 'Tercero', email: `tercero-${sello}@x.cl`, passwordHash: 'x' })
    .returning()
  autor = a.id
  colega = b.id
  tercero = c.id

  // autor invita a colega (from=autor, to=colega) → semántica del banco compartido
  await db
    .insert(colaboraciones)
    .values({ fromUserId: autor, toUserId: colega })

  // pregunta privada del autor con imagen en el enunciado
  await db.insert(preguntas).values({
    userId: autor,
    asignatura: 'Física',
    pregunta: 'privada',
    compartida: 0,
    imagenPregunta: kPropia,
  })
  // pregunta compartida del autor con imagen en la alternativa A
  await db.insert(preguntas).values({
    userId: autor,
    asignatura: 'Física',
    pregunta: 'compartida',
    compartida: 1,
    imagenA: kCompartida,
  })
})

describe('puedeVerImagen: autorización por dueño/colaborador', () => {
  it('el dueño ve su propia imagen', async () => {
    expect(await puedeVerImagen(kPropia, autor)).toBe(true)
  })

  it('un colaborador NO ve una imagen privada (compartida=0) del autor', async () => {
    expect(await puedeVerImagen(kPropia, colega)).toBe(false)
  })

  it('un colaborador SÍ ve una imagen de una pregunta compartida', async () => {
    expect(await puedeVerImagen(kCompartida, colega)).toBe(true)
  })

  it('el dueño ve su propia imagen compartida', async () => {
    expect(await puedeVerImagen(kCompartida, autor)).toBe(true)
  })

  it('un tercero sin relación NO ve la imagen compartida', async () => {
    expect(await puedeVerImagen(kCompartida, tercero)).toBe(false)
  })

  it('una clave no referenciada por ninguna pregunta no es visible', async () => {
    expect(await puedeVerImagen(kDesconocida, autor)).toBe(false)
  })
})
