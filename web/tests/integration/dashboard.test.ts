import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import {
  usuarios,
  preguntas,
  textos,
  colaboraciones,
} from '@/lib/db/schema'
import { getDashboardStats } from '@/lib/queries/dashboard'

// Crea un usuario con email único (los tests comparten la base Postgres docker).
async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

describe('getDashboardStats (contra Postgres)', () => {
  it('cuenta preguntas y textos propios, con y sin filtro de asignatura', async () => {
    const u = await crearUsuario('dash')

    // 3 preguntas de Física + 2 de Química.
    await db.insert(preguntas).values([
      { userId: u.id, asignatura: 'Física', pregunta: 'p1' },
      { userId: u.id, asignatura: 'Física', pregunta: 'p2' },
      { userId: u.id, asignatura: 'Física', pregunta: 'p3' },
      { userId: u.id, asignatura: 'Química', pregunta: 'p4' },
      { userId: u.id, asignatura: 'Química', pregunta: 'p5' },
    ])

    // 2 textos de Física + 1 de Química.
    await db.insert(textos).values([
      { userId: u.id, asignatura: 'Física', titulo: 't1', contenido: 'c' },
      { userId: u.id, asignatura: 'Física', titulo: 't2', contenido: 'c' },
      { userId: u.id, asignatura: 'Química', titulo: 't3', contenido: 'c' },
    ])

    const todas = await getDashboardStats(u.id)
    expect(todas.misPreguntas).toBe(5)
    expect(todas.misTextos).toBe(3)
    expect(todas.compartidasConmigo).toBe(0)
    expect(todas.colaboradores).toBe(0)

    const fisica = await getDashboardStats(u.id, 'Física')
    expect(fisica.misPreguntas).toBe(3)
    expect(fisica.misTextos).toBe(2)

    const quimica = await getDashboardStats(u.id, 'Química')
    expect(quimica.misPreguntas).toBe(2)
    expect(quimica.misTextos).toBe(1)
  })

  it('cuenta compartidasConmigo (autor que me invitó) y colaboradores propios', async () => {
    const yo = await crearUsuario('yo')
    const autor = await crearUsuario('autor') // me invita y comparte
    const otro = await crearUsuario('otro') // comparte pero NO me invitó

    // El autor me invitó: from_user_id = autor, to_user_id = yo → veo sus compartidas.
    await db
      .insert(colaboraciones)
      .values({ fromUserId: autor.id, toUserId: yo.id })
    // Yo invité a "otro": cuenta como colaborador mío (from_user_id = yo).
    await db
      .insert(colaboraciones)
      .values({ fromUserId: yo.id, toUserId: otro.id })

    // Autor: 2 compartidas de Física + 1 de Química, y 1 NO compartida (no cuenta).
    await db.insert(preguntas).values([
      { userId: autor.id, asignatura: 'Física', pregunta: 'a1', compartida: 1 },
      { userId: autor.id, asignatura: 'Física', pregunta: 'a2', compartida: 1 },
      { userId: autor.id, asignatura: 'Física', pregunta: 'a3', compartida: 0 },
      { userId: autor.id, asignatura: 'Química', pregunta: 'a4', compartida: 1 },
    ])
    // "otro" comparte una pregunta pero no me invitó → no debe aparecer.
    await db
      .insert(preguntas)
      .values({ userId: otro.id, asignatura: 'Física', pregunta: 'o1', compartida: 1 })

    const todas = await getDashboardStats(yo.id)
    expect(todas.compartidasConmigo).toBe(3) // 2 Física + 1 Química del autor
    expect(todas.colaboradores).toBe(1) // yo → otro

    const fisica = await getDashboardStats(yo.id, 'Física')
    expect(fisica.compartidasConmigo).toBe(2) // sólo las de Física del autor
    expect(fisica.colaboradores).toBe(1) // colaboradores es global, no por asignatura
  })
})
