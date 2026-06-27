import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { usuarios, preguntas, colaboraciones } from '@/lib/db/schema'
import { cargarBancoCompartido } from '@/lib/queries/compartido'

// Crea un usuario con email único (los tests comparten la base Postgres docker).
async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

describe('cargarBancoCompartido (contra Postgres)', () => {
  it('A (colaborador) ve la pregunta compartida de B; un tercero no-colaborador no la ve; filtra por asignatura', async () => {
    const a = await crearUsuario('A-lector')
    const b = await crearUsuario('B-autor')
    const c = await crearUsuario('C-ajeno')

    // B me invitó: from_user_id = B, to_user_id = A → A puede ver las
    // compartidas de B (misma semántica que compartidasConmigo).
    await db
      .insert(colaboraciones)
      .values({ fromUserId: b.id, toUserId: a.id })

    // B: 1 compartida de Física, 1 privada de Física (no debe verse) y 1
    // compartida de Química.
    const [compFisica] = await db
      .insert(preguntas)
      .values({
        userId: b.id,
        asignatura: 'Física',
        materia: 'Mecánica',
        pregunta: 'compartida-fisica',
        compartida: 1,
      })
      .returning()
    const [privFisica] = await db
      .insert(preguntas)
      .values({
        userId: b.id,
        asignatura: 'Física',
        pregunta: 'privada-fisica',
        compartida: 0,
      })
      .returning()
    const [compQuimica] = await db
      .insert(preguntas)
      .values({
        userId: b.id,
        asignatura: 'Química',
        pregunta: 'compartida-quimica',
        compartida: 1,
      })
      .returning()

    // A ve las compartidas de B (Física + Química), con el nombre del autor.
    const vistasPorA = await cargarBancoCompartido(a.id)
    const idsDeB = vistasPorA.filter((p) => p.userId === b.id).map((p) => p.id)
    expect(idsDeB).toContain(compFisica.id)
    expect(idsDeB).toContain(compQuimica.id)
    // La privada de B nunca aparece.
    expect(idsDeB).not.toContain(privFisica.id)
    // Nombre del autor presente en la tarjeta.
    const tarjeta = vistasPorA.find((p) => p.id === compFisica.id)
    expect(tarjeta?.autor).toBe('B-autor')

    // C no es colaborador de B → no ve ninguna pregunta de B.
    const vistasPorC = await cargarBancoCompartido(c.id)
    expect(vistasPorC.some((p) => p.userId === b.id)).toBe(false)

    // Filtro por asignatura: A pide Física → ve la compartida de Física de B,
    // pero no la de Química, y todo lo devuelto es de Física.
    const fisicaDeA = await cargarBancoCompartido(a.id, 'Física')
    const idsFisicaDeB = fisicaDeA
      .filter((p) => p.userId === b.id)
      .map((p) => p.id)
    expect(idsFisicaDeB).toContain(compFisica.id)
    expect(idsFisicaDeB).not.toContain(compQuimica.id)
    expect(fisicaDeA.every((p) => p.asignatura === 'Física')).toBe(true)
  })
})
