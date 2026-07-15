import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { suscripciones, pagosSuscripcion, usuarios, colegios, usosIa } from '@/lib/db/schema'
import {
  esProSuscripcion,
  planEfectivo,
  cuotaImportaciones,
  DIAS_GRACIA_MOROSA,
} from '@/lib/suscripciones/entitlements'

async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

const DIA = 86_400_000
const enDias = (n: number) => new Date(Date.now() + n * DIA)

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

describe('entitlements', () => {
  it('esProSuscripcion cubre los 5 estados', () => {
    const base = {
      id: 1, userId: 1, origen: 'mercadopago', periodicidad: 'mensual',
      mpPreapprovalId: 'x', trialTerminaEl: null, periodoHasta: null, nota: null,
      createdAt: new Date(), updatedAt: new Date(),
    }
    expect(esProSuscripcion({ ...base, estado: 'pendiente' } as never)).toBe(false)
    expect(esProSuscripcion({ ...base, estado: 'trial' } as never)).toBe(true)
    // trial con fecha: vigente, vencido dentro de la gracia, vencido más allá
    expect(
      esProSuscripcion({ ...base, estado: 'trial', trialTerminaEl: enDias(10) } as never),
    ).toBe(true)
    expect(
      esProSuscripcion({ ...base, estado: 'trial', trialTerminaEl: enDias(-3) } as never),
    ).toBe(true)
    expect(
      esProSuscripcion({
        ...base, estado: 'trial', trialTerminaEl: enDias(-(DIAS_GRACIA_MOROSA + 1)),
      } as never),
    ).toBe(false)
    expect(esProSuscripcion({ ...base, estado: 'activa' } as never)).toBe(true)
    // morosa: gracia de 7 días desde periodoHasta
    expect(
      esProSuscripcion({ ...base, estado: 'morosa', periodoHasta: enDias(-3) } as never),
    ).toBe(true)
    expect(
      esProSuscripcion({
        ...base, estado: 'morosa', periodoHasta: enDias(-(DIAS_GRACIA_MOROSA + 1)),
      } as never),
    ).toBe(false)
    // cancelada: Pro hasta el fin del período pagado
    expect(
      esProSuscripcion({ ...base, estado: 'cancelada', periodoHasta: enDias(10) } as never),
    ).toBe(true)
    expect(
      esProSuscripcion({ ...base, estado: 'cancelada', periodoHasta: enDias(-1) } as never),
    ).toBe(false)
    // cortesía vigente/vencida (estado 'activa' + periodoHasta obligatorio)
    expect(
      esProSuscripcion({ ...base, origen: 'cortesia', estado: 'activa', periodoHasta: enDias(30) } as never),
    ).toBe(true)
    expect(
      esProSuscripcion({ ...base, origen: 'cortesia', estado: 'activa', periodoHasta: enDias(-1) } as never),
    ).toBe(false)
  })

  it('planEfectivo deriva Pro por licencia del colegio', async () => {
    const [c] = await db
      .insert(colegios)
      .values({
        nombre: 'Colegio Lic', joinCode: `lic-${Date.now()}`, licenciaHasta: enDias(30),
      })
      .returning()
    const u = await crearUsuario('ent-colegio')
    await db.update(usuarios).set({ colegioId: c.id }).where(eq(usuarios.id, u.id))

    const plan = await planEfectivo(u.id)
    expect(plan.plan).toBe('pro')
    expect(plan.origen).toBe('colegio')

    await db.update(colegios).set({ licenciaHasta: enDias(-1) }).where(eq(colegios.id, c.id))
    const plan2 = await planEfectivo(u.id)
    expect(plan2.plan).toBe('free')
  })

  it('cuotaImportaciones cuenta solo importar_documento del usuario en el mes', async () => {
    const u = await crearUsuario('ent-cuota')
    const otro = await crearUsuario('ent-cuota-otro')
    const uso = { modelo: 'claude-x', inputTokens: 1, outputTokens: 1 }
    await db.insert(usosIa).values([
      { userId: u.id, accion: 'importar_documento', ...uso },
      { userId: u.id, accion: 'importar_documento', ...uso },
      { userId: u.id, accion: 'otra_cosa', ...uso },
      { userId: otro.id, accion: 'importar_documento', ...uso },
      // Fuera del mes actual: no cuenta.
      { userId: u.id, accion: 'importar_documento', ...uso, createdAt: new Date('2020-01-15') },
    ])
    const cuota = await cuotaImportaciones(u.id)
    expect(cuota.plan).toBe('free')
    expect(cuota.limite).toBe(3)
    expect(cuota.usadas).toBe(2)
    expect(cuota.restantes).toBe(1)

    // Con Pro (cortesía) el límite sube a 100.
    await db.insert(suscripciones).values({
      userId: u.id, origen: 'cortesia', estado: 'activa', periodoHasta: enDias(30),
    })
    const cuotaPro = await cuotaImportaciones(u.id)
    expect(cuotaPro.limite).toBe(100)
    expect(cuotaPro.restantes).toBe(98)
  })
})
