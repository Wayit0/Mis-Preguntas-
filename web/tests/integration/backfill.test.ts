import { describe, it, expect } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, accounts } from '@/lib/db/schema'
import { backfillAccounts } from '@/lib/migration/backfill'

// Integración contra el Postgres docker (mismo patrón que el resto de
// tests/integration). Verifica que backfillAccounts crea el account credential
// legacy por usuario sin él y que es idempotente (no duplica).
describe('backfillAccounts (idempotente contra Postgres)', () => {
  it('crea un account credential legacy por usuario migrado y no duplica', async () => {
    const email = `bf-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
    const [u] = await db
      .insert(usuarios)
      .values({ nombre: 'Backfill', email, passwordHash: 'deadbeef' })
      .returning()

    // Primer pase: inserta el account legacy del usuario recién creado.
    const r1 = await backfillAccounts(db)
    expect(r1.inserted).toBeGreaterThanOrEqual(1)

    const accs1 = await db
      .select()
      .from(accounts)
      .where(
        and(eq(accounts.userId, u.id), eq(accounts.providerId, 'credential')),
      )
    expect(accs1.length).toBe(1)
    expect(accs1[0].password).toBe('legacy-sha256:deadbeef')
    expect(accs1[0].accountId).toBe(String(u.id))

    // Segundo pase: idempotente — el usuario ya tiene credential, no se duplica.
    await backfillAccounts(db)
    const accs2 = await db
      .select()
      .from(accounts)
      .where(
        and(eq(accounts.userId, u.id), eq(accounts.providerId, 'credential')),
      )
    expect(accs2.length).toBe(1)
  })

  it('omite usuarios sin password_hash (no crea credential vacío)', async () => {
    const email = `bf-empty-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
    const [u] = await db
      .insert(usuarios)
      .values({ nombre: 'Sin hash', email, passwordHash: '' })
      .returning()

    await backfillAccounts(db)

    const accs = await db
      .select()
      .from(accounts)
      .where(
        and(eq(accounts.userId, u.id), eq(accounts.providerId, 'credential')),
      )
    expect(accs.length).toBe(0)
  })
})
