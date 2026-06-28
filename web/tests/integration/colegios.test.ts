import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, colegios, invitacionesColegio } from '@/lib/db/schema'

// Integración contra el Postgres docker (mismo patrón que el resto de
// tests/integration). Cubre la Parte C.1: colegios, roles en usuarios e
// invitaciones, incluyendo defaults y la FK colegio_id.

function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

describe('colegios + roles + invitaciones (Parte C.1)', () => {
  it('crea un colegio y lee sus campos (logo nullable)', async () => {
    const joinCode = uniq('JOIN')
    const [c] = await db
      .insert(colegios)
      .values({ nombre: 'Colegio Test', joinCode })
      .returning()

    expect(c.id).toBeGreaterThan(0)
    expect(c.nombre).toBe('Colegio Test')
    expect(c.joinCode).toBe(joinCode)
    // logo es nullable y no se proporcionó.
    expect(c.logo).toBeNull()
    expect(c.createdAt).toBeInstanceOf(Date)
  })

  it('joinCode es único (rechaza duplicado)', async () => {
    const joinCode = uniq('DUP')
    await db.insert(colegios).values({ nombre: 'Uno', joinCode })

    await expect(
      db.insert(colegios).values({ nombre: 'Dos', joinCode }),
    ).rejects.toThrow()
  })

  it('usuario nuevo recibe role=teacher por default y colegioId nulo', async () => {
    const email = `${uniq('teacher')}@x.cl`
    const [u] = await db
      .insert(usuarios)
      .values({ nombre: 'Profe', email, passwordHash: 'x' })
      .returning()

    expect(u.role).toBe('teacher')
    expect(u.colegioId).toBeNull()
    // Columnas del plugin admin de better-auth: nullables, sin valor.
    expect(u.banned).toBeNull()
    expect(u.banReason).toBeNull()
    expect(u.banExpires).toBeNull()
  })

  it('crea un usuario con role y colegioId que apunta a un colegio', async () => {
    const joinCode = uniq('SCHOOL')
    const [c] = await db
      .insert(colegios)
      .values({ nombre: 'Colegio FK', joinCode })
      .returning()

    const email = `${uniq('admin')}@x.cl`
    const [u] = await db
      .insert(usuarios)
      .values({
        nombre: 'Admin Colegio',
        email,
        passwordHash: 'x',
        role: 'school_admin',
        colegioId: c.id,
      })
      .returning()

    expect(u.role).toBe('school_admin')
    expect(u.colegioId).toBe(c.id)

    const [leido] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, u.id))
    expect(leido.colegioId).toBe(c.id)
  })

  it('rechaza colegioId inexistente (FK colegio_id)', async () => {
    const email = `${uniq('badfk')}@x.cl`
    await expect(
      db.insert(usuarios).values({
        nombre: 'FK rota',
        email,
        passwordHash: 'x',
        colegioId: 2_000_000_000,
      }),
    ).rejects.toThrow()
  })

  it('inserta una invitación con estado pendiente por default', async () => {
    const joinCode = uniq('INV')
    const [c] = await db
      .insert(colegios)
      .values({ nombre: 'Colegio Inv', joinCode })
      .returning()

    const token = uniq('tok')
    const [inv] = await db
      .insert(invitacionesColegio)
      .values({
        colegioId: c.id,
        email: `${uniq('invitado')}@x.cl`,
        token,
      })
      .returning()

    expect(inv.id).toBeGreaterThan(0)
    expect(inv.colegioId).toBe(c.id)
    expect(inv.token).toBe(token)
    expect(inv.estado).toBe('pendiente')
    expect(inv.createdAt).toBeInstanceOf(Date)
  })

  it('token de invitación es único (rechaza duplicado)', async () => {
    const joinCode = uniq('INVDUP')
    const [c] = await db
      .insert(colegios)
      .values({ nombre: 'Colegio Inv Dup', joinCode })
      .returning()

    const token = uniq('toktok')
    await db
      .insert(invitacionesColegio)
      .values({ colegioId: c.id, email: 'a@x.cl', token })

    await expect(
      db
        .insert(invitacionesColegio)
        .values({ colegioId: c.id, email: 'b@x.cl', token }),
    ).rejects.toThrow()
  })
})
