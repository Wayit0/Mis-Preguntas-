import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { suscripciones, pagosSuscripcion, usuarios, colegios } from '@/lib/db/schema'

async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

describe('schema de suscripciones', () => {
  it('inserta una suscripción y respeta el unique por usuario', async () => {
    const u = await crearUsuario('subs-schema')
    const [s] = await db
      .insert(suscripciones)
      .values({ userId: u.id, origen: 'mercadopago', estado: 'pendiente' })
      .returning()
    expect(s.id).toBeGreaterThan(0)
    expect(s.createdAt).toBeInstanceOf(Date)

    await expect(
      db.insert(suscripciones).values({ userId: u.id, origen: 'cortesia', estado: 'activa' }),
    ).rejects.toThrow()
  })

  it('pagos_suscripcion es idempotente por mp_payment_id (unique)', async () => {
    const u = await crearUsuario('subs-pago')
    const [s] = await db
      .insert(suscripciones)
      .values({ userId: u.id, origen: 'mercadopago', estado: 'activa' })
      .returning()
    const mpPaymentId = `pay-${Date.now()}`
    await db.insert(pagosSuscripcion).values({
      userId: u.id, suscripcionId: s.id, mpPaymentId, montoClp: 3490, estado: 'approved',
    })
    await db
      .insert(pagosSuscripcion)
      .values({ userId: u.id, suscripcionId: s.id, mpPaymentId, montoClp: 3490, estado: 'approved' })
      .onConflictDoNothing({ target: pagosSuscripcion.mpPaymentId })
    const filas = await db
      .select()
      .from(pagosSuscripcion)
      .where(eq(pagosSuscripcion.mpPaymentId, mpPaymentId))
    expect(filas.length).toBe(1)
  })

  it('usuarios.trialUsadoEl y colegios.licenciaHasta existen y son nullables', async () => {
    const u = await crearUsuario('subs-cols')
    expect(u.trialUsadoEl).toBeNull()
    const [c] = await db
      .insert(colegios)
      .values({ nombre: 'Colegio Subs', joinCode: `js-${Date.now()}` })
      .returning()
    expect(c.licenciaHasta).toBeNull()
    expect(c.licenciaNota).toBeNull()
  })
})
