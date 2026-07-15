import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { validarFirmaMp } from '@/lib/suscripciones/webhook'

// Formato oficial de MP: header `x-signature: ts=<ts>,v1=<hmac>` donde
// v1 = HMAC-SHA256(secret, `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`).
describe('validarFirmaMp', () => {
  const secret = 'secreto-mp'
  const dataId = 'pre-123'
  const requestId = 'req-abc'
  const ts = '1700000000'
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex')

  it('acepta una firma válida', () => {
    expect(
      validarFirmaMp({
        xSignature: `ts=${ts},v1=${v1}`, xRequestId: requestId, dataId, secret,
      }),
    ).toBe(true)
  })

  it('rechaza firma alterada, header ausente o malformado', () => {
    expect(
      validarFirmaMp({ xSignature: `ts=${ts},v1=${'0'.repeat(64)}`, xRequestId: requestId, dataId, secret }),
    ).toBe(false)
    expect(validarFirmaMp({ xSignature: null, xRequestId: requestId, dataId, secret })).toBe(false)
    expect(validarFirmaMp({ xSignature: 'basura', xRequestId: requestId, dataId, secret })).toBe(false)
  })
})
