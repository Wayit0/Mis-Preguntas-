import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, cursos, inscripciones } from '@/lib/db/schema'

let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { crearCurso, quitarAlumno, inscribirConCodigo } = await import('@/lib/actions/cursos')
const { listarCursosPropios, cargarCursoPorId } = await import('@/lib/queries/cursos')

async function crearUsuario(prefijo: string, role = 'teacher') {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db.insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x', role })
    .returning()
  return u
}

beforeEach(() => { currentUserId = 0 })

describe('cursos e inscripciones (contra Postgres)', () => {
  it('el profesor crea un curso con joinCode y lo lista', async () => {
    const prof = await crearUsuario('curso-prof')
    currentUserId = prof.id
    const res = await crearCurso('8°A Física')
    expect('ok' in res).toBe(true)
    const lista = await listarCursosPropios(prof.id)
    expect(lista).toHaveLength(1)
    expect(lista[0].nombre).toBe('8°A Física')
    expect(lista[0].joinCode.length).toBeGreaterThan(8)
    expect(lista[0].nAlumnos).toBe(0)
  })

  it('un estudiante no puede crear cursos', async () => {
    const est = await crearUsuario('curso-est', 'student')
    currentUserId = est.id
    const res = await crearCurso('Curso pirata')
    expect('error' in res).toBe(true)
  })

  it('inscribirConCodigo: inscribe, es idempotente y rechaza códigos inválidos', async () => {
    const prof = await crearUsuario('insc-prof')
    currentUserId = prof.id
    const curso = await crearCurso('1°B')
    const cursoId = 'ok' in curso ? curso.id : 0
    const [fila] = await db.select().from(cursos).where(eq(cursos.id, cursoId))

    const est = await crearUsuario('insc-est', 'student')
    currentUserId = est.id
    expect(await inscribirConCodigo(fila.joinCode)).toEqual({ ok: true, cursoId })
    expect(await inscribirConCodigo(fila.joinCode)).toEqual({ ok: true, cursoId }) // idempotente
    const insc = await db.select().from(inscripciones).where(eq(inscripciones.estudianteId, est.id))
    expect(insc).toHaveLength(1)
    expect('error' in (await inscribirConCodigo('no-existe'))).toBe(true)
  })

  it('un profesor no puede inscribirse como alumno', async () => {
    const prof = await crearUsuario('insc-prof2')
    currentUserId = prof.id
    const curso = await crearCurso('2°C')
    const cursoId = 'ok' in curso ? curso.id : 0
    const [fila] = await db.select().from(cursos).where(eq(cursos.id, cursoId))
    expect('error' in (await inscribirConCodigo(fila.joinCode))).toBe(true)
  })

  it('quitarAlumno: solo el dueño; borra la inscripción', async () => {
    const prof = await crearUsuario('quitar-prof')
    const otro = await crearUsuario('quitar-otro')
    const est = await crearUsuario('quitar-est', 'student')
    currentUserId = prof.id
    const curso = await crearCurso('3°D')
    const cursoId = 'ok' in curso ? curso.id : 0
    await db.insert(inscripciones).values({ cursoId, estudianteId: est.id })

    currentUserId = otro.id
    expect('error' in (await quitarAlumno(cursoId, est.id))).toBe(true)

    currentUserId = prof.id
    expect(await quitarAlumno(cursoId, est.id)).toEqual({ ok: true })
    const detalle = await cargarCursoPorId(cursoId, prof.id)
    expect(detalle?.alumnos).toEqual([])
  })

  it('cargarCursoPorId devuelve null para un curso ajeno', async () => {
    const prof = await crearUsuario('detalle-prof')
    const otro = await crearUsuario('detalle-otro')
    currentUserId = prof.id
    const curso = await crearCurso('4°E')
    const cursoId = 'ok' in curso ? curso.id : 0
    expect(await cargarCursoPorId(cursoId, otro.id)).toBeNull()
  })
})
