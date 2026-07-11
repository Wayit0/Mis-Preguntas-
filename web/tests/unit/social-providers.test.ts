import { afterEach, describe, expect, it, vi } from 'vitest'
import { proveedoresSocialesHabilitados } from '@/lib/auth-social'

describe('proveedoresSocialesHabilitados', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('sin credenciales no habilita ningún proveedor', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
    vi.stubEnv('MICROSOFT_CLIENT_ID', '')
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', '')
    expect(proveedoresSocialesHabilitados()).toEqual([])
  })

  it('habilita google sólo cuando id y secret están presentes', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'gid')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'gsecret')
    vi.stubEnv('MICROSOFT_CLIENT_ID', '')
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', '')
    expect(proveedoresSocialesHabilitados()).toEqual(['google'])
  })

  it('no habilita google si falta el secret', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'gid')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
    vi.stubEnv('MICROSOFT_CLIENT_ID', '')
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', '')
    expect(proveedoresSocialesHabilitados()).not.toContain('google')
  })

  it('habilita ambos con sus credenciales', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'gid')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'gsecret')
    vi.stubEnv('MICROSOFT_CLIENT_ID', 'mid')
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'msecret')
    expect(proveedoresSocialesHabilitados()).toEqual(['google', 'microsoft'])
  })
})
