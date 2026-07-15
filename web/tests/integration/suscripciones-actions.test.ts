import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { suscripciones, usuarios } from '@/lib/db/schema'

let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const mpCrearPreapproval = vi.fn()
const mpCancelarPreapproval = vi.fn()
const mpObtenerPreapproval = vi.fn()
vi.mock('@/lib/suscripciones/mercadopago', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  mpHabilitado: () => true,
  mpCrearPreapproval: (...a: unknown[]) => mpCrearPreapproval(...a),
  mpCancelarPreapproval: (...a: unknown[]) => mpCancelarPreapproval(...a),
  mpObtenerPreapproval: (...a: unknown[]) => mpObtenerPreapproval(...a),
}))

const { iniciarSuscripcion, cancelarMiSuscripcion, reconciliarMiSuscripcion } =
  await import('@/lib/actions/suscripciones')

async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

beforeAll(async () => {
  // Los ids de preapproval de este archivo son fijos; limpia restos de corridas
  // anteriores para no chocar con el unique de mp_preapproval_id.
  await db.delete(suscripciones).where(
    inArray(suscripciones.mpPreapprovalId, ['pre-nuevo', 'pre-2', 'pre-cancel', 'pre-reconciliar']),
  )
})

beforeEach(() => {
  mpCrearPreapproval.mockReset()
  mpCancelarPreapproval.mockReset()
  mpObtenerPreapproval.mockReset()
})

describe('iniciarSuscripcion', () => {
  it('crea el preapproval con trial (primera vez) y guarda la fila pendiente', async () => {
    const u = await crearUsuario('act-inicio')
    currentUserId = u.id
    mpCrearPreapproval.mockResolvedValue({
      id: 'pre-nuevo', status: 'pending', init_point: 'https://mp/checkout',
      auto_recurring: { start_date: new Date(Date.now() + 15 * 86_400_000).toISOString() },
    })

    const r = await iniciarSuscripcion('mensual')
    expect(r).toEqual({ initPoint: 'https://mp/checkout' })
    expect(mpCrearPreapproval).toHaveBeenCalledWith(
      expect.objectContaining({ userId: u.id, periodicidad: 'mensual', conTrial: true }),
    )
    const [s] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s.estado).toBe('pendiente')
    expect(s.mpPreapprovalId).toBe('pre-nuevo')
  })

  it('sin trial si trialUsadoEl ya está marcado; error si ya es Pro', async () => {
    const u = await crearUsuario('act-retrial')
    await db.update(usuarios).set({ trialUsadoEl: new Date() }).where(eq(usuarios.id, u.id))
    currentUserId = u.id
    mpCrearPreapproval.mockResolvedValue({ id: 'pre-2', status: 'pending', init_point: 'https://mp/2' })

    await iniciarSuscripcion('anual')
    expect(mpCrearPreapproval).toHaveBeenCalledWith(
      expect.objectContaining({ conTrial: false, periodicidad: 'anual' }),
    )

    // Ya Pro → error, sin llamar a MP de nuevo.
    await db
      .update(suscripciones)
      .set({ estado: 'activa' })
      .where(eq(suscripciones.userId, u.id))
    mpCrearPreapproval.mockClear()
    const r = await iniciarSuscripcion('mensual')
    expect('error' in r).toBe(true)
    expect(mpCrearPreapproval).not.toHaveBeenCalled()
  })
})

describe('cancelarMiSuscripcion', () => {
  it('cancela en MP y sincroniza el estado local', async () => {
    const u = await crearUsuario('act-cancel')
    currentUserId = u.id
    await db.insert(suscripciones).values({
      userId: u.id, origen: 'mercadopago', estado: 'activa',
      mpPreapprovalId: 'pre-cancel', periodoHasta: new Date(Date.now() + 10 * 86_400_000),
    })
    mpCancelarPreapproval.mockResolvedValue({
      id: 'pre-cancel', status: 'cancelled', external_reference: String(u.id),
    })
    const r = await cancelarMiSuscripcion()
    expect(r).toEqual({ ok: true })
    const [s] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s.estado).toBe('cancelada')
    // Conserva Pro hasta periodoHasta (no se borra).
    expect(s.periodoHasta).toBeInstanceOf(Date)
  })

  it('error si no hay suscripción de MP', async () => {
    const u = await crearUsuario('act-cancel-nada')
    currentUserId = u.id
    const r = await cancelarMiSuscripcion()
    expect('error' in r).toBe(true)
  })
})

describe('reconciliarMiSuscripcion', () => {
  it('nunca lanza aunque MP falle', async () => {
    const u = await crearUsuario('act-reconciliar')
    currentUserId = u.id
    await db.insert(suscripciones).values({
      userId: u.id, origen: 'mercadopago', estado: 'activa',
      mpPreapprovalId: 'pre-reconciliar',
    })
    mpObtenerPreapproval.mockRejectedValue(new Error('mp caído'))
    await expect(reconciliarMiSuscripcion()).resolves.toBeUndefined()
    expect(mpObtenerPreapproval).toHaveBeenCalledWith('pre-reconciliar')
  })
})
