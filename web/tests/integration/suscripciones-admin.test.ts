import { describe, it, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colegios, suscripciones, usuarios, pagosSuscripcion } from '@/lib/db/schema'

let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { concederCortesia, fijarLicenciaColegio, cancelarSuscripcionDeUsuario } =
  await import('@/lib/actions/suscripciones-admin')
const { resumenSuscripciones, pagosDeUsuario } = await import(
  '@/lib/queries/suscripciones-admin'
)
const { planEfectivo } = await import('@/lib/suscripciones/entitlements')

async function crearUsuario(prefijo: string, role = 'teacher') {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x', role })
    .returning()
  return u
}

describe('admin de suscripciones', () => {
  it('concederCortesia da Pro hasta la fecha indicada; teacher no puede', async () => {
    const admin = await crearUsuario('adm', 'global_admin')
    const profe = await crearUsuario('adm-profe')
    const hasta = new Date(Date.now() + 60 * 86_400_000).toISOString()

    currentUserId = profe.id
    expect('error' in (await concederCortesia(profe.email, hasta, 'piloto'))).toBe(true)

    currentUserId = admin.id
    const r = await concederCortesia(profe.email, hasta, 'piloto liceo A')
    expect(r).toEqual({ ok: true })
    const plan = await planEfectivo(profe.id)
    expect(plan.plan).toBe('pro')
    expect(plan.origen).toBe('cortesia')
  })

  it('no pisa una suscripción de MercadoPago vigente con una cortesía', async () => {
    const admin = await crearUsuario('adm2', 'global_admin')
    const profe = await crearUsuario('adm2-profe')
    await db.insert(suscripciones).values({
      userId: profe.id, origen: 'mercadopago', estado: 'activa', mpPreapprovalId: `p-${Date.now()}`,
    })
    currentUserId = admin.id
    const r = await concederCortesia(
      profe.email, new Date(Date.now() + 86_400_000).toISOString(), 'x',
    )
    expect('error' in r).toBe(true)
  })

  it('fijarLicenciaColegio activa y corta la licencia', async () => {
    const admin = await crearUsuario('adm3', 'global_admin')
    const [c] = await db
      .insert(colegios)
      .values({ nombre: 'Colegio Adm', joinCode: `adm-${Date.now()}` })
      .returning()
    currentUserId = admin.id
    const hasta = new Date(Date.now() + 365 * 86_400_000).toISOString()
    expect(await fijarLicenciaColegio(c.id, hasta, 'factura 123')).toEqual({ ok: true })
    let [fila] = await db.select().from(colegios).where(eq(colegios.id, c.id))
    expect(fila.licenciaHasta).toBeInstanceOf(Date)
    expect(fila.licenciaNota).toBe('factura 123')

    expect(await fijarLicenciaColegio(c.id, null, 'corte')).toEqual({ ok: true })
    ;[fila] = await db.select().from(colegios).where(eq(colegios.id, c.id))
    expect(fila.licenciaHasta).toBeNull()
  })

  it('cancelarSuscripcionDeUsuario termina una cortesía de inmediato', async () => {
    const admin = await crearUsuario('adm4', 'global_admin')
    const profe = await crearUsuario('adm4-profe')
    await db.insert(suscripciones).values({
      userId: profe.id, origen: 'cortesia', estado: 'activa',
      periodoHasta: new Date(Date.now() + 30 * 86_400_000),
    })
    currentUserId = admin.id
    expect(await cancelarSuscripcionDeUsuario(profe.id)).toEqual({ ok: true })
    expect((await planEfectivo(profe.id)).plan).toBe('free')
  })

  it('resumen y pagos por usuario', async () => {
    const profe = await crearUsuario('adm5-profe')
    const [s] = await db
      .insert(suscripciones)
      .values({ userId: profe.id, origen: 'mercadopago', estado: 'activa', mpPreapprovalId: `r-${Date.now()}` })
      .returning()
    await db.insert(pagosSuscripcion).values({
      userId: profe.id, suscripcionId: s.id, mpPaymentId: `pr-${Date.now()}`,
      montoClp: 3490, estado: 'approved',
    })
    const resumen = await resumenSuscripciones()
    expect(resumen.activas).toBeGreaterThanOrEqual(1)
    expect(resumen.ingresoMesClp).toBeGreaterThanOrEqual(3490)
    const pagos = await pagosDeUsuario(profe.id)
    expect(pagos.length).toBe(1)
  })
})
