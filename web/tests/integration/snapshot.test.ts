import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { usuarios, preguntas, textos } from '@/lib/db/schema'
import { construirSnapshot } from '@/lib/tareas/snapshot'

async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db.insert(usuarios).values({ nombre: prefijo, email, passwordHash: 'x' }).returning()
  return u
}

describe('construirSnapshot (contra Postgres)', () => {
  it('copia preguntas sueltas y textos con sus preguntas, en orden', async () => {
    const u = await crearUsuario('snap')
    const [t] = await db.insert(textos)
      .values({ userId: u.id, asignatura: 'Física', titulo: 'Lectura', contenido: 'el texto' })
      .returning()
    const [pt] = await db.insert(preguntas)
      .values({ userId: u.id, asignatura: 'Física', pregunta: 'del texto', textoId: t.id, correcta: 'A', A: 'sí', explicacion: 'exp' })
      .returning()
    const [p2] = await db.insert(preguntas)
      .values({ userId: u.id, asignatura: 'Física', pregunta: 'suelta 2', correcta: 'B', A: 'x', B: 'y' })
      .returning()
    const [p1] = await db.insert(preguntas)
      .values({ userId: u.id, asignatura: 'Física', pregunta: 'suelta 1', tipo: 'desarrollo_corto' })
      .returning()

    // Orden pedido: p1 antes que p2 (no el orden de inserción).
    const snap = await construirSnapshot({ preguntasIds: [p1.id, p2.id], textosIds: [t.id], userId: u.id })

    expect(snap.textos).toHaveLength(1)
    expect(snap.textos[0].titulo).toBe('Lectura')
    expect(snap.textos[0].preguntas.map((p) => p.preguntaId)).toEqual([pt.id])
    expect(snap.textos[0].preguntas[0].correcta).toBe('A')
    expect(snap.textos[0].preguntas[0].explicacion).toBe('exp')
    expect(snap.preguntas.map((p) => p.preguntaId)).toEqual([p1.id, p2.id])
    expect(snap.preguntas[0].tipo).toBe('desarrollo_corto')
  })

  it('ignora ids ajenos o inexistentes', async () => {
    const a = await crearUsuario('snap-a')
    const b = await crearUsuario('snap-b')
    const [ajena] = await db.insert(preguntas)
      .values({ userId: b.id, asignatura: 'Física', pregunta: 'de b' })
      .returning()
    const snap = await construirSnapshot({ preguntasIds: [ajena.id, 999999], textosIds: [], userId: a.id })
    expect(snap.preguntas).toEqual([])
    expect(snap.textos).toEqual([])
  })
})
