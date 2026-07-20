import { and, count, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colegios, suscripciones, usosIa, usuarios } from '@/lib/db/schema'
import { lanzamientoGratis } from '@/lib/suscripciones/lanzamiento'

// ---------------------------------------------------------------------------
// Derivación de entitlements. Ser "Pro" NUNCA es una columna: se calcula aquí
// a partir de la suscripción propia (MercadoPago o cortesía) O de la licencia
// vigente del colegio del usuario. Ver spec 2026-07-15-modelo-suscripcion.
// ---------------------------------------------------------------------------

export const LIMITE_IMPORTACIONES = { free: 3, pro: 100 } as const
export const DIAS_GRACIA_MOROSA = 7

export type Suscripcion = typeof suscripciones.$inferSelect
export type OrigenPro = 'suscripcion' | 'cortesia' | 'colegio' | 'lanzamiento'

export interface PlanEfectivo {
  plan: 'free' | 'pro'
  origen: OrigenPro | null
  suscripcion: Suscripcion | null
}

const masDias = (fecha: Date, dias: number) =>
  new Date(fecha.getTime() + dias * 86_400_000)

/** Regla pura: ¿esta suscripción otorga Pro en `ahora`? */
export function esProSuscripcion(s: Suscripcion, ahora = new Date()): boolean {
  switch (s.estado) {
    case 'trial': {
      // Si el webhook que cierra el trial se pierde, un trial vencido converge
      // a free tras la misma gracia que la morosidad (nada de Pro eterno por
      // cache desactualizado). Sin fecha conocida se asume vigente.
      if (!s.trialTerminaEl) return true
      return ahora < masDias(s.trialTerminaEl, DIAS_GRACIA_MOROSA)
    }
    case 'activa':
      // Las cortesías siempre tienen vencimiento; MP 'activa' es Pro sin más
      // (el vencimiento real lo gobierna MercadoPago con sus cobros).
      return s.origen === 'cortesia'
        ? s.periodoHasta != null && s.periodoHasta > ahora
        : true
    case 'morosa': {
      // Gracia de 7 días manteniendo Pro mientras MP reintenta el cobro.
      const base = s.periodoHasta ?? s.updatedAt
      return ahora < masDias(base, DIAS_GRACIA_MOROSA)
    }
    case 'cancelada':
      // Conserva Pro hasta el fin del período ya pagado.
      return s.periodoHasta != null && ahora < s.periodoHasta
    default:
      return false // 'pendiente' u otro
  }
}

export async function planEfectivo(userId: number): Promise<PlanEfectivo> {
  const [s] = await db
    .select()
    .from(suscripciones)
    .where(eq(suscripciones.userId, userId))
    .limit(1)
  if (s && esProSuscripcion(s)) {
    return {
      plan: 'pro',
      origen: s.origen === 'cortesia' ? 'cortesia' : 'suscripcion',
      suscripcion: s,
    }
  }
  const [fila] = await db
    .select({ licenciaHasta: colegios.licenciaHasta })
    .from(usuarios)
    .leftJoin(colegios, eq(usuarios.colegioId, colegios.id))
    .where(eq(usuarios.id, userId))
    .limit(1)
  if (fila?.licenciaHasta && fila.licenciaHasta > new Date()) {
    return { plan: 'pro', origen: 'colegio', suscripcion: s ?? null }
  }
  // Último recurso antes de free: durante el lanzamiento nadie paga y todos
  // tienen los límites Pro. Va al final para que quien SÍ tiene suscripción,
  // cortesía o licencia siga viendo su origen real en /cuenta y en el admin.
  if (lanzamientoGratis()) {
    return { plan: 'pro', origen: 'lanzamiento', suscripcion: s ?? null }
  }
  return { plan: 'free', origen: null, suscripcion: s ?? null }
}

// Inicio del mes calendario actual en America/Santiago, expresado como el
// timestamp naive-UTC con que se comparan los created_at (que Postgres guarda
// sin zona). Todo el cálculo ocurre en SQL para no reimplementar zonas en JS.
const INICIO_MES_SANTIAGO_SQL = sql`(date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago') at time zone 'UTC'`

export interface CuotaImportaciones {
  plan: 'free' | 'pro'
  limite: number
  usadas: number
  restantes: number
}

export async function cuotaImportaciones(userId: number): Promise<CuotaImportaciones> {
  const { plan } = await planEfectivo(userId)
  const limite = LIMITE_IMPORTACIONES[plan]
  const [fila] = await db
    .select({ usadas: count() })
    .from(usosIa)
    .where(
      and(
        eq(usosIa.userId, userId),
        eq(usosIa.accion, 'importar_documento'),
        gte(usosIa.createdAt, INICIO_MES_SANTIAGO_SQL),
      ),
    )
  const usadas = Number(fila?.usadas ?? 0)
  return { plan, limite, usadas, restantes: Math.max(0, limite - usadas) }
}
