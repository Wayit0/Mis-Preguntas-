import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { suscripciones, pagosSuscripcion, usuarios, colegios, usosIa } from '@/lib/db/schema'
import {
  esProSuscripcion,
  planEfectivo,
  cuotaImportaciones,
  DIAS_GRACIA_MOROSA,
} from '@/lib/suscripciones/entitlements'
import {
  estadoDesdeMp,
  sincronizarPreapproval,
  registrarPagoAutorizado,
} from '@/lib/suscripciones/sync'
import type { MpPreapproval } from '@/lib/suscripciones/mercadopago'
import { procesarEventoMp } from '@/lib/suscripciones/webhook'

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

describe('lanzamiento gratis', () => {
  const previo = process.env.LANZAMIENTO_GRATIS
  beforeEach(() => {
    delete process.env.LANZAMIENTO_GRATIS // encendido por defecto
  })
  afterEach(() => {
    process.env.LANZAMIENTO_GRATIS = previo
  })

  it('libera Pro y sus 100 importaciones a una cuenta sin suscripción', async () => {
    const u = await crearUsuario('lanz-libre')
    const plan = await planEfectivo(u.id)
    expect(plan.plan).toBe('pro')
    expect(plan.origen).toBe('lanzamiento')
    expect((await cuotaImportaciones(u.id)).limite).toBe(100)
  })

  it('no tapa el origen real de quien ya tiene Pro', async () => {
    const u = await crearUsuario('lanz-cortesia')
    await db.insert(suscripciones).values({
      userId: u.id, origen: 'cortesia', estado: 'activa', periodoHasta: enDias(30),
    })
    expect((await planEfectivo(u.id)).origen).toBe('cortesia')
  })

  it('apagado, la misma cuenta vuelve a free', async () => {
    process.env.LANZAMIENTO_GRATIS = 'false'
    const u = await crearUsuario('lanz-off')
    expect((await planEfectivo(u.id)).plan).toBe('free')
  })
})

describe('sincronización con MercadoPago', () => {
  it('estadoDesdeMp mapea los estados de MP', () => {
    const futuro = enDias(10)
    const pasado = enDias(-1)
    expect(estadoDesdeMp('pending', null)).toBe('pendiente')
    expect(estadoDesdeMp('authorized', futuro)).toBe('trial')
    expect(estadoDesdeMp('authorized', pasado)).toBe('activa')
    expect(estadoDesdeMp('authorized', null)).toBe('activa')
    expect(estadoDesdeMp('paused', null)).toBe('morosa')
    expect(estadoDesdeMp('cancelled', null)).toBe('cancelada')
  })

  it('sincronizarPreapproval crea la fila vía external_reference y marca el trial', async () => {
    const u = await crearUsuario('sync-alta')
    const pre: MpPreapproval = {
      id: `pre-${Date.now()}`,
      status: 'authorized',
      external_reference: String(u.id),
      next_payment_date: enDias(15).toISOString(),
      auto_recurring: {
        frequency: 1, frequency_type: 'months', transaction_amount: 3490,
        currency_id: 'CLP', start_date: enDias(15).toISOString(),
      },
    }
    await sincronizarPreapproval(pre)

    const [s] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s.estado).toBe('trial')
    expect(s.origen).toBe('mercadopago')
    expect(s.periodicidad).toBe('mensual')
    expect(s.mpPreapprovalId).toBe(pre.id)
    expect(s.periodoHasta).toBeInstanceOf(Date)

    const [u2] = await db.select().from(usuarios).where(eq(usuarios.id, u.id))
    expect(u2.trialUsadoEl).toBeInstanceOf(Date)

    // Reentrega del webhook con cancelación: actualiza la MISMA fila.
    await sincronizarPreapproval({ ...pre, status: 'cancelled' })
    const [s2] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s2.id).toBe(s.id)
    expect(s2.estado).toBe('cancelada')
  })

  it('registrarPagoAutorizado inserta idempotente y ajusta el estado (forma real de MP: payment.status anidado)', async () => {
    const u = await crearUsuario('sync-pago')
    const preId = `pre-pago-${Date.now()}`
    await db.insert(suscripciones).values({
      userId: u.id, origen: 'mercadopago', estado: 'activa', mpPreapprovalId: preId,
    })
    // El status de nivel superior describe el scheduling de MP ('processed'),
    // NO el resultado del cobro: eso vive en payment.status.
    const pagoRechazado = {
      id: `ap-${Date.now()}`, preapproval_id: preId, status: 'processed',
      transaction_amount: 3490,
      payment: { status: 'rejected', status_detail: 'cc_rejected_insufficient_amount' },
    }
    await registrarPagoAutorizado(pagoRechazado)
    await registrarPagoAutorizado(pagoRechazado) // reentrega del webhook

    const filas = await db
      .select()
      .from(pagosSuscripcion)
      .where(eq(pagosSuscripcion.mpPaymentId, String(pagoRechazado.id)))
    expect(filas.length).toBe(1)
    expect(filas[0].montoClp).toBe(3490)
    expect(filas[0].estado).toBe('rejected')

    const [s] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s.estado).toBe('morosa')

    const pagoAprobado = {
      ...pagoRechazado, id: `ap2-${Date.now()}`, status: 'processed',
      payment: { status: 'approved' },
    }
    await registrarPagoAutorizado(pagoAprobado)
    const [s2] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s2.estado).toBe('activa')
    const [filaAprobada] = await db
      .select()
      .from(pagosSuscripcion)
      .where(eq(pagosSuscripcion.mpPaymentId, String(pagoAprobado.id)))
    expect(filaAprobada.estado).toBe('approved')
  })

  it('registrarPagoAutorizado cae al status de nivel superior si no hay payment anidado', async () => {
    const u = await crearUsuario('sync-pago-fallback')
    const preId = `pre-pago-fb-${Date.now()}`
    await db.insert(suscripciones).values({
      userId: u.id, origen: 'mercadopago', estado: 'activa', mpPreapprovalId: preId,
    })
    const pago = {
      id: `ap-fb-${Date.now()}`, preapproval_id: preId, status: 'rejected',
      transaction_amount: 3490,
    }
    await registrarPagoAutorizado(pago)

    const [s] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s.estado).toBe('morosa')
    const [fila] = await db
      .select()
      .from(pagosSuscripcion)
      .where(eq(pagosSuscripcion.mpPaymentId, String(pago.id)))
    expect(fila.estado).toBe('rejected')
  })

  it('sincronizarPreapproval no baja una fila morosa a activa mientras MP reintenta el cobro', async () => {
    const u = await crearUsuario('sync-morosa')
    const preId = `pre-morosa-${Date.now()}`
    const periodoHastaInicial = enDias(-2)
    await db.insert(suscripciones).values({
      userId: u.id, origen: 'mercadopago', estado: 'morosa',
      mpPreapprovalId: preId, periodoHasta: periodoHastaInicial,
    })

    const pre: MpPreapproval = {
      id: preId, status: 'authorized', external_reference: String(u.id),
      next_payment_date: periodoHastaInicial.toISOString(),
    }
    // MP sigue "authorized" mientras reintenta el cobro fallido: el
    // next_payment_date no avanzó, así que la fila debe seguir 'morosa'.
    await sincronizarPreapproval(pre)
    let [s] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s.estado).toBe('morosa')

    // El próximo ciclo de cobro avanzó de verdad: ahora sí sale de morosa.
    await sincronizarPreapproval({
      ...pre,
      next_payment_date: new Date(periodoHastaInicial.getTime() + 30 * DIA).toISOString(),
    })
    ;[s] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s.estado).toBe('activa')
  })
})

describe('procesarEventoMp', () => {
  it('subscription_preapproval consulta MP y sincroniza', async () => {
    const u = await crearUsuario('wh-pre')
    const pre: MpPreapproval = {
      id: `wh-${Date.now()}`, status: 'authorized', external_reference: String(u.id),
      next_payment_date: enDias(30).toISOString(),
    }
    await procesarEventoMp('subscription_preapproval', pre.id, {
      obtenerPreapproval: async () => pre,
      obtenerPagoAutorizado: async () => { throw new Error('no debe llamarse') },
    })
    const [s] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s.estado).toBe('activa')
  })
})
