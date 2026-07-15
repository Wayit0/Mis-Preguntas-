import { and, count, desc, eq, gte, sql, sum } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colegios, pagosSuscripcion, suscripciones, usuarios } from '@/lib/db/schema'

const INICIO_MES_SANTIAGO_SQL = sql`(date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago') at time zone 'UTC'`

export async function listarSuscripcionesAdmin() {
  return db
    .select({
      id: suscripciones.id,
      userId: suscripciones.userId,
      usuario: usuarios.nombre,
      email: usuarios.email,
      origen: suscripciones.origen,
      periodicidad: suscripciones.periodicidad,
      estado: suscripciones.estado,
      periodoHasta: suscripciones.periodoHasta,
      nota: suscripciones.nota,
      createdAt: suscripciones.createdAt,
    })
    .from(suscripciones)
    .leftJoin(usuarios, eq(suscripciones.userId, usuarios.id))
    .orderBy(desc(suscripciones.updatedAt))
    .limit(200)
}

export async function resumenSuscripciones() {
  const porEstado = async (estado: string) => {
    const [r] = await db
      .select({ n: count() })
      .from(suscripciones)
      .where(eq(suscripciones.estado, estado))
    return Number(r?.n ?? 0)
  }
  const [ingreso] = await db
    .select({ total: sum(pagosSuscripcion.montoClp) })
    .from(pagosSuscripcion)
    .where(
      and(
        eq(pagosSuscripcion.estado, 'approved'),
        gte(pagosSuscripcion.createdAt, INICIO_MES_SANTIAGO_SQL),
      ),
    )
  return {
    activas: await porEstado('activa'),
    enTrial: await porEstado('trial'),
    morosas: await porEstado('morosa'),
    ingresoMesClp: Number(ingreso?.total ?? 0),
  }
}

export async function pagosDeUsuario(userId: number) {
  return db
    .select()
    .from(pagosSuscripcion)
    .where(eq(pagosSuscripcion.userId, userId))
    .orderBy(desc(pagosSuscripcion.createdAt))
    .limit(50)
}

export async function listarLicencias() {
  return db
    .select({
      id: colegios.id,
      nombre: colegios.nombre,
      licenciaHasta: colegios.licenciaHasta,
      licenciaNota: colegios.licenciaNota,
    })
    .from(colegios)
    .orderBy(colegios.nombre)
}
