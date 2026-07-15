import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('cliente MercadoPago', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubEnv('MP_ACCESS_TOKEN', 'TEST-token')
    vi.stubEnv('BETTER_AUTH_URL', 'https://qa.edubox.cl')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('mpCrearPreapproval arma el preapproval mensual con trial de 15 días', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'pre-1', status: 'pending', init_point: 'https://mp/x' })),
    )
    const { mpCrearPreapproval } = await import('@/lib/suscripciones/mercadopago')
    const pre = await mpCrearPreapproval({
      userId: 7, email: 'profe@x.cl', periodicidad: 'mensual', conTrial: true,
    })
    expect(pre.init_point).toBe('https://mp/x')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.mercadopago.com/preapproval')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.external_reference).toBe('7')
    expect(body.payer_email).toBe('profe@x.cl')
    expect(body.status).toBe('pending')
    expect(body.back_url).toBe('https://qa.edubox.cl/cuenta?suscripcion=retorno')
    expect(body.auto_recurring.transaction_amount).toBe(3490)
    expect(body.auto_recurring.frequency).toBe(1)
    expect(body.auto_recurring.currency_id).toBe('CLP')
    // Trial: primer cobro ~15 días en el futuro.
    const inicio = new Date(body.auto_recurring.start_date).getTime()
    expect(inicio).toBeGreaterThan(Date.now() + 14 * 86_400_000)
  })

  it('anual sin trial: frequency 12, monto 35880, sin start_date', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'pre-2', status: 'pending' })))
    const { mpCrearPreapproval } = await import('@/lib/suscripciones/mercadopago')
    await mpCrearPreapproval({ userId: 7, email: 'p@x.cl', periodicidad: 'anual', conTrial: false })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.auto_recurring.frequency).toBe(12)
    expect(body.auto_recurring.transaction_amount).toBe(35880)
    expect(body.auto_recurring.start_date).toBeUndefined()
  })

  it('propaga errores HTTP con contexto', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"bad"}', { status: 400 }))
    const { mpObtenerPreapproval } = await import('@/lib/suscripciones/mercadopago')
    await expect(mpObtenerPreapproval('pre-x')).rejects.toThrow(/MercadoPago 400/)
  })

  it('mpHabilitado depende de MP_ACCESS_TOKEN', async () => {
    const { mpHabilitado } = await import('@/lib/suscripciones/mercadopago')
    expect(mpHabilitado()).toBe(true)
    vi.stubEnv('MP_ACCESS_TOKEN', '')
    expect(mpHabilitado()).toBe(false)
  })
})
