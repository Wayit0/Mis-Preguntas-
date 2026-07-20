import { describe, expect, it } from 'vitest'
import { mensajeErrorAuth, ERROR_GENERICO } from '@/lib/auth-errors'

// El login social no devuelve estos códigos por la API: los trae la URL de
// retorno (?error=account_not_linked), en minúsculas. Antes caían al mensaje
// genérico —y ni siquiera se mostraban, porque el retorno iba a la portada—.
describe('mensajeErrorAuth con los códigos del login social', () => {
  it('account_not_linked explica qué hacer, no un error genérico', () => {
    const msg = mensajeErrorAuth('account_not_linked')
    expect(msg).not.toBe(ERROR_GENERICO)
    expect(msg).toMatch(/contraseña/i)
  })

  it('traduce el resto de los códigos de retorno del proveedor', () => {
    for (const code of [
      'account_already_linked_to_different_user',
      'unable_to_link_account',
      'email_not_found',
      'invalid_code',
      'state_not_found',
    ]) {
      expect(mensajeErrorAuth(code)).not.toBe(ERROR_GENERICO)
    }
  })

  it('un código desconocido cae al mensaje genérico', () => {
    expect(mensajeErrorAuth('algo_que_no_existe')).toBe(ERROR_GENERICO)
  })
})
