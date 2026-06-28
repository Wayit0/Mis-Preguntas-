import { describe, it, expect } from 'vitest'
import { legacyAccountRow } from '@/lib/migration/backfill'
import { LEGACY } from '@/lib/auth-password'

describe('legacyAccountRow', () => {
  it('construye la fila account legacy esperada', () => {
    const row = legacyAccountRow({
      id: 7,
      email: 'prof@x.cl',
      password_hash: 'abc',
    })

    expect(row.password).toBe('legacy-sha256:abc')
    expect(row.providerId).toBe('credential')
    expect(row.userId).toBe(7)
    // El id del usuario se usa como accountId (paridad con accounts nativos).
    expect(row.accountId).toBe('7')
  })

  it('usa el prefijo que entiende el verificador (auth-password)', () => {
    const row = legacyAccountRow({
      id: 1,
      email: 'a@x.cl',
      password_hash: 'deadbeef',
    })
    expect(row.password.startsWith(LEGACY)).toBe(true)
    expect(row.password).toBe(LEGACY + 'deadbeef')
  })
})
