import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { usuarios, colaboraciones } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  cargarColaboradores,
  cargarQuienesMeInvitaron,
  buscarUsuarioPorEmail,
} from '@/lib/queries/colaboradores'

// Crea un usuario con email único (los tests comparten la base Postgres docker).
// El email se guarda en minúsculas, como hace better-auth en el alta real.
async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}@x.cl`.toLowerCase()
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

// Reproduce la lógica de la server action `agregarColaborador` sin depender de
// `getSession()` (que requiere cookies/headers de una request). El `from` es el
// usuario que invita; el `to` se resuelve por email. Devuelve el mismo shape que
// la action: { error } | { ok, nombre }.
async function agregar(fromUserId: number, fromEmail: string, toEmail: string) {
  const email = toEmail.trim().toLowerCase()
  if (!email) return { error: 'Escribe el email del colega que quieres agregar.' }
  if (email === fromEmail.trim().toLowerCase()) {
    return { error: 'No puedes agregarte a ti mismo como colaborador.' }
  }
  const colega = await buscarUsuarioPorEmail(email, fromUserId)
  if (!colega) {
    return { error: 'No encontramos a ningún colega registrado con ese email.' }
  }
  await db
    .insert(colaboraciones)
    .values({ fromUserId, toUserId: colega.id })
    .onConflictDoNothing()
  return { ok: true as const, nombre: colega.nombre }
}

async function quitar(fromUserId: number, toUserId: number) {
  await db
    .delete(colaboraciones)
    .where(
      and(
        eq(colaboraciones.fromUserId, fromUserId),
        eq(colaboraciones.toUserId, toUserId),
      ),
    )
}

describe('Colaboradores (contra Postgres)', () => {
  it('A agrega a B por email → B en colaboradores de A y A en "quienes me invitaron" de B', async () => {
    const a = await crearUsuario('A-invita')
    const b = await crearUsuario('B-invitado')

    const res = await agregar(a.id, a.email, b.email)
    expect('ok' in res && res.ok).toBe(true)
    if ('ok' in res) expect(res.nombre).toBe(b.nombre)

    // B aparece entre los colaboradores de A (gente que puede ver a A).
    const colabsDeA = await cargarColaboradores(a.id)
    expect(colabsDeA.map((c) => c.id)).toContain(b.id)

    // A aparece entre quienes invitaron a B (gente que B puede ver).
    const invitaronAB = await cargarQuienesMeInvitaron(b.id)
    expect(invitaronAB.map((c) => c.id)).toContain(a.id)

    // La relación es direccional: A no figura como colaborador de B, ni B ha
    // invitado a A.
    const colabsDeB = await cargarColaboradores(b.id)
    expect(colabsDeB.map((c) => c.id)).not.toContain(a.id)
  })

  it('agregar un email inexistente falla con un mensaje legible', async () => {
    const a = await crearUsuario('A-busca')
    const res = await agregar(a.id, a.email, `no-existe-${Date.now()}@x.cl`)
    expect('error' in res).toBe(true)
    if ('error' in res) {
      expect(res.error).toMatch(/no encontramos/i)
    }
    // No se creó ninguna colaboración.
    expect((await cargarColaboradores(a.id)).length).toBe(0)
  })

  it('no se puede agregar a uno mismo', async () => {
    const a = await crearUsuario('A-solo')
    const res = await agregar(a.id, a.email, a.email)
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error).toMatch(/ti mismo/i)
    expect((await cargarColaboradores(a.id)).length).toBe(0)
  })

  it('es idempotente: agregar dos veces no duplica', async () => {
    const a = await crearUsuario('A-dup')
    const b = await crearUsuario('B-dup')

    await agregar(a.id, a.email, b.email)
    await agregar(a.id, a.email, b.email)

    const colabs = await cargarColaboradores(a.id)
    expect(colabs.filter((c) => c.id === b.id).length).toBe(1)
  })

  it('quitar colaborador funciona', async () => {
    const a = await crearUsuario('A-quita')
    const b = await crearUsuario('B-quita')

    await agregar(a.id, a.email, b.email)
    expect((await cargarColaboradores(a.id)).map((c) => c.id)).toContain(b.id)

    await quitar(a.id, b.id)
    expect((await cargarColaboradores(a.id)).map((c) => c.id)).not.toContain(
      b.id,
    )
    // Y B ya no ve a A entre quienes lo invitaron.
    expect(
      (await cargarQuienesMeInvitaron(b.id)).map((c) => c.id),
    ).not.toContain(a.id)
  })

  it('buscarUsuarioPorEmail excluye al propio usuario', async () => {
    const a = await crearUsuario('A-self')
    // Buscar su propio email excluyéndose a sí mismo → null.
    expect(await buscarUsuarioPorEmail(a.email, a.id)).toBeNull()
    // Buscado por otro id, sí se encuentra.
    const otro = await crearUsuario('Otro')
    const hallado = await buscarUsuarioPorEmail(a.email, otro.id)
    expect(hallado?.id).toBe(a.id)
  })
})
