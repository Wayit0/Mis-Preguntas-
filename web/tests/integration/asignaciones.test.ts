import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, preguntas, pruebas, cursos, asignaciones, entregas } from '@/lib/db/schema'

let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { asignarPruebaACurso, eliminarAsignacion } = await import('@/lib/actions/asignaciones')

async function crearUsuario(prefijo: string, role = 'teacher') {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db.insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x', role }).returning()
  return u
}

async function fixtures() {
  const prof = await crearUsuario('asig-prof')
  const [p] = await db.insert(preguntas)
    .values({ userId: prof.id, asignatura: 'Física', pregunta: 'original', correcta: 'A', A: 'x' })
    .returning()
  const [prueba] = await db.insert(pruebas)
    .values({ userId: prof.id, asignatura: 'Física', titulo: 'Prueba 1', preguntasIds: [p.id], textosIds: [] })
    .returning()
  const [curso] = await db.insert(cursos)
    .values({ userId: prof.id, nombre: '8°A', joinCode: `jc-${Date.now()}-${Math.random()}` })
    .returning()
  return { prof, p, prueba, curso }
}

beforeEach(() => { currentUserId = 0 })

describe('asignarPruebaACurso (contra Postgres)', () => {
  it('congela el snapshot: editar y borrar la prueba original no afecta la asignación', async () => {
    const { prof, p, prueba, curso } = await fixtures()
    currentUserId = prof.id
    const res = await asignarPruebaACurso({ pruebaId: prueba.id, cursoId: curso.id })
    expect('ok' in res).toBe(true)
    const asigId = 'ok' in res ? res.id : 0

    await db.update(preguntas).set({ pregunta: 'EDITADA' }).where(eq(preguntas.id, p.id))
    await db.delete(pruebas).where(eq(pruebas.id, prueba.id))

    const [asig] = await db.select().from(asignaciones).where(eq(asignaciones.id, asigId))
    expect(asig.contenido.preguntas[0].enunciado).toBe('original')
    expect(asig.titulo).toBe('Prueba 1')
  })

  it('rechaza curso ajeno y prueba ajena', async () => {
    const { prueba, curso } = await fixtures()
    const otro = await crearUsuario('asig-otro')
    currentUserId = otro.id
    expect('error' in (await asignarPruebaACurso({ pruebaId: prueba.id, cursoId: curso.id }))).toBe(true)
  })

  it('eliminarAsignacion borra también las entregas', async () => {
    const { prof, prueba, curso } = await fixtures()
    const est = await crearUsuario('asig-est', 'student')
    currentUserId = prof.id
    const res = await asignarPruebaACurso({ pruebaId: prueba.id, cursoId: curso.id })
    const asigId = 'ok' in res ? res.id : 0
    await db.insert(entregas).values({
      asignacionId: asigId, estudianteId: est.id, respuestas: { '0': 'A' }, puntaje: 1, total: 1,
    })

    expect(await eliminarAsignacion(asigId)).toEqual({ ok: true })
    expect(await db.select().from(entregas).where(eq(entregas.asignacionId, asigId))).toHaveLength(0)
  })
})
