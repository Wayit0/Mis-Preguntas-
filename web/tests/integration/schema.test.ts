import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, accounts } from '@/lib/db/schema'

describe('schema (dominio + better-auth)', () => {
  it('inserta y lee un usuario', async () => {
    const email = `t${Date.now()}@x.cl`
    const [u] = await db
      .insert(usuarios)
      .values({ nombre: 'Test', email, passwordHash: 'x' })
      .returning()

    expect(u.id).toBeGreaterThan(0)
    expect(u.emailVerified).toBe(false)

    const [leido] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, u.id))

    expect(leido.email).toBe(email)
    expect(leido.nombre).toBe('Test')
  })

  it('inserta una account legacy asociada a un usuario', async () => {
    const email = `acc${Date.now()}@x.cl`
    const [u] = await db
      .insert(usuarios)
      .values({ nombre: 'Acc', email, passwordHash: 'abc' })
      .returning()

    const [acc] = await db
      .insert(accounts)
      .values({
        userId: u.id,
        accountId: String(u.id),
        providerId: 'credential',
        password: 'legacy-sha256:abc',
      })
      .returning()

    expect(acc.id).toBeGreaterThan(0)
    expect(acc.userId).toBe(u.id)
    expect(acc.providerId).toBe('credential')
    expect(acc.password).toBe('legacy-sha256:abc')
  })
})
