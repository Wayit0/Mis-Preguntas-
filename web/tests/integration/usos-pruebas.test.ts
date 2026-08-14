import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { usuarios, preguntas, textos, pruebas } from '@/lib/db/schema'
import { contarUsosEnPruebas } from '@/lib/queries/pruebas'

async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

async function crearPregunta(userId: number, textoId: number | null = null) {
  const [p] = await db
    .insert(preguntas)
    .values({ userId, asignatura: 'Física', pregunta: 'enunciado', textoId })
    .returning()
  return p
}

async function crearPrueba(
  userId: number,
  preguntasIds: number[],
  textosIds: number[] = [],
) {
  const [pr] = await db
    .insert(pruebas)
    .values({ userId, asignatura: 'Física', preguntasIds, textosIds })
    .returning()
  return pr
}

describe('contarUsosEnPruebas (contra Postgres)', () => {
  it('cuenta en cuántas pruebas propias aparece cada pregunta directa', async () => {
    const u = await crearUsuario('usos-directo')
    const p1 = await crearPregunta(u.id)
    const p2 = await crearPregunta(u.id)
    const p3 = await crearPregunta(u.id) // sin uso

    await crearPrueba(u.id, [p1.id, p2.id])
    await crearPrueba(u.id, [p1.id])

    const usos = await contarUsosEnPruebas(u.id)
    expect(usos.get(p1.id)).toBe(2)
    expect(usos.get(p2.id)).toBe(1)
    expect(usos.get(p3.id) ?? 0).toBe(0)
  })

  it('cuenta las preguntas incluidas vía texto de comprensión, sin duplicar si además va directa', async () => {
    const u = await crearUsuario('usos-texto')
    const [t] = await db
      .insert(textos)
      .values({ userId: u.id, asignatura: 'Física', titulo: 'Lectura', contenido: 'x' })
      .returning()
    const pTexto = await crearPregunta(u.id, t.id)

    // Prueba 1: incluye el texto (y con él la pregunta asociada).
    await crearPrueba(u.id, [], [t.id])
    // Prueba 2: incluye el texto Y la pregunta directa — debe contar UNA vez.
    await crearPrueba(u.id, [pTexto.id], [t.id])

    const usos = await contarUsosEnPruebas(u.id)
    expect(usos.get(pTexto.id)).toBe(2)
  })

  it('no cuenta pruebas de otros usuarios', async () => {
    const a = await crearUsuario('usos-a')
    const b = await crearUsuario('usos-b')
    const pA = await crearPregunta(a.id)

    // B guarda una prueba que (a mano) referencia la pregunta de A.
    await crearPrueba(b.id, [pA.id])

    const usos = await contarUsosEnPruebas(a.id)
    expect(usos.get(pA.id) ?? 0).toBe(0)
  })
})
