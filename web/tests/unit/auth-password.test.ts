import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { verifyPw, hashPw } from '@/lib/auth-password'

describe('auth-password', () => {
  it('acepta hash legacy sha256 correcto', async () => {
    const pw = 'secreto123'
    const legacy =
      'legacy-sha256:' + crypto.createHash('sha256').update(pw).digest('hex')
    expect(await verifyPw({ hash: legacy, password: pw })).toBe(true)
    expect(await verifyPw({ hash: legacy, password: 'malo' })).toBe(false)
  })

  it('verifica hash scrypt nuevo', async () => {
    const h = await hashPw('abc')
    expect(await verifyPw({ hash: h, password: 'abc' })).toBe(true)
    expect(await verifyPw({ hash: h, password: 'xyz' })).toBe(false)
  })
})
