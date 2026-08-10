import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, preguntas, colaboraciones } from '@/lib/db/schema'

// Igual que carpetas.test.ts: adoptarPreguntasCompartidas usa getSession() y
// revalidatePath(), ambos ligados al contexto de una petición Next.
let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { adoptarPreguntasCompartidas } = await import('@/lib/actions/preguntas')
const { crearCarpeta } = await import('@/lib/actions/carpetas')

async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

function idDe(r: { error: string } | { id: number }): number {
  if ('error' in r) throw new Error(r.error)
  return r.id
}

beforeEach(() => {
  currentUserId = 0
})

describe('adoptarPreguntasCompartidas (contra Postgres)', () => {
  it('A (colaborador) adopta la compartida de B como copia privada propia, clasificada en carpeta', async () => {
    const a = await crearUsuario('adopt-a')
    const b = await crearUsuario('adopt-b')

    await db.insert(colaboraciones).values({ fromUserId: b.id, toUserId: a.id })

    const [pB] = await db
      .insert(preguntas)
      .values({
        userId: b.id,
        asignatura: 'Física',
        materia: 'Mecánica',
        pregunta: '¿Cuál es la fórmula de la fuerza?',
        correcta: 'A',
        A: 'F=ma',
        compartida: 1,
      })
      .returning()

    currentUserId = a.id
    const carpetaId = idDe(await crearCarpeta('Adoptadas', null))

    const res = await adoptarPreguntasCompartidas([pB.id], carpetaId)
    expect(res).toEqual({ ok: true })

    const copias = await db
      .select()
      .from(preguntas)
      .where(eq(preguntas.userId, a.id))
    expect(copias).toHaveLength(1)
    const copia = copias[0]
    expect(copia.id).not.toBe(pB.id)
    expect(copia.compartida).toBe(0)
    expect(copia.carpetaId).toBe(carpetaId)
    expect(copia.pregunta).toBe(pB.pregunta)
    expect(copia.A).toBe(pB.A)
    expect(copia.colegioId).toBeNull()

    // La original de B no se ve afectada.
    const [original] = await db.select().from(preguntas).where(eq(preguntas.id, pB.id))
    expect(original.compartida).toBe(1)
    expect(original.userId).toBe(b.id)
  })

  it('un tercero no-colaborador no puede adoptar la pregunta de B aunque pase el id a mano', async () => {
    const b = await crearUsuario('adopt-b2')
    const c = await crearUsuario('adopt-c')

    const [pB] = await db
      .insert(preguntas)
      .values({ userId: b.id, asignatura: 'Física', pregunta: 'compartida', compartida: 1 })
      .returning()

    currentUserId = c.id
    const res = await adoptarPreguntasCompartidas([pB.id], null)
    expect('error' in res).toBe(true)

    const copias = await db.select().from(preguntas).where(eq(preguntas.userId, c.id))
    expect(copias).toHaveLength(0)
  })

  it('no permite "adoptar" una pregunta propia', async () => {
    const a = await crearUsuario('adopt-propia')
    const [propia] = await db
      .insert(preguntas)
      .values({ userId: a.id, asignatura: 'Física', pregunta: 'mía', compartida: 1 })
      .returning()

    currentUserId = a.id
    const res = await adoptarPreguntasCompartidas([propia.id], null)
    expect('error' in res).toBe(true)

    const total = await db.select().from(preguntas).where(eq(preguntas.userId, a.id))
    expect(total).toHaveLength(1) // sólo la original, ninguna copia extra
  })

  it('rechaza una carpeta destino ajena/inexistente', async () => {
    const a = await crearUsuario('adopt-carp-a')
    const b = await crearUsuario('adopt-carp-b')
    const otro = await crearUsuario('adopt-carp-otro')

    await db.insert(colaboraciones).values({ fromUserId: b.id, toUserId: a.id })
    const [pB] = await db
      .insert(preguntas)
      .values({ userId: b.id, asignatura: 'Física', pregunta: 'compartida', compartida: 1 })
      .returning()

    currentUserId = otro.id
    const carpetaAjena = idDe(await crearCarpeta('De otro', null))

    currentUserId = a.id
    const res = await adoptarPreguntasCompartidas([pB.id], carpetaAjena)
    expect('error' in res).toBe(true)

    const copias = await db.select().from(preguntas).where(eq(preguntas.userId, a.id))
    expect(copias).toHaveLength(0)
  })
})
