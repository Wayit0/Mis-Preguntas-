import { asc, count, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colegios, usosIa, usuarios } from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// Lecturas para la administración global (Parte E.2). Son funciones puras: el
// único consumidor es el server component /admin, que YA impone el guard
// requireRole(['global_admin']). No las llames desde un contexto sin verificar
// el rol (mismo patrón que lib/queries/colegio.ts).
// ---------------------------------------------------------------------------

/** Un colegio con el número de profesores asociados, para la lista de admin. */
export interface ColegioAdmin {
  id: number
  nombre: string
  logo: string | null
  joinCode: string
  createdAt: Date | null
  profesores: number
}

/**
 * Todos los colegios con el conteo de usuarios asociados, ordenados por nombre.
 * `leftJoin` + `count(usuarios.id)` cuenta 0 para colegios sin profesores
 * (count ignora los NULL del lado derecho del left join).
 */
export async function listarColegios(): Promise<ColegioAdmin[]> {
  return db
    .select({
      id: colegios.id,
      nombre: colegios.nombre,
      logo: colegios.logo,
      joinCode: colegios.joinCode,
      createdAt: colegios.createdAt,
      profesores: count(usuarios.id),
    })
    .from(colegios)
    .leftJoin(usuarios, eq(usuarios.colegioId, colegios.id))
    .groupBy(colegios.id)
    .orderBy(asc(colegios.nombre))
}

/** Un usuario con su rol y el nombre de su colegio (null si no tiene). */
export interface UsuarioAdmin {
  id: number
  nombre: string
  email: string
  role: string
  colegioId: number | null
  colegioNombre: string | null
}

/**
 * Todos los usuarios con su rol y colegio (vía leftJoin con colegios), ordenados
 * por nombre. Alimenta la pestaña «Usuarios» del panel de administración.
 */
export async function listarUsuarios(): Promise<UsuarioAdmin[]> {
  return db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      email: usuarios.email,
      role: usuarios.role,
      colegioId: usuarios.colegioId,
      colegioNombre: colegios.nombre,
    })
    .from(usuarios)
    .leftJoin(colegios, eq(colegios.id, usuarios.colegioId))
    .orderBy(asc(usuarios.nombre))
}

// ---------------------------------------------------------------------------
// Costos de IA (pestaña «Costos de IA» del panel de administración).
// ---------------------------------------------------------------------------

/** Un uso de IA con los datos del usuario que lo originó. */
export interface UsoIaAdmin {
  id: number
  usuarioNombre: string | null
  usuarioEmail: string | null
  accion: string
  modelo: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  costoMicroUsd: number
  detalle: Record<string, unknown>
  createdAt: Date | null
}

/** Totales agregados de costos de IA. */
export interface ResumenUsosIa {
  totalMicroUsd: number
  mesMicroUsd: number
  totalUsos: number
}

/** Últimos usos de IA (más recientes primero), con nombre/email del usuario. */
export async function listarUsosIa(limite = 100): Promise<UsoIaAdmin[]> {
  const filas = await db
    .select({
      id: usosIa.id,
      usuarioNombre: usuarios.nombre,
      usuarioEmail: usuarios.email,
      accion: usosIa.accion,
      modelo: usosIa.modelo,
      inputTokens: usosIa.inputTokens,
      outputTokens: usosIa.outputTokens,
      cacheCreationTokens: usosIa.cacheCreationTokens,
      cacheReadTokens: usosIa.cacheReadTokens,
      costoMicroUsd: usosIa.costoMicroUsd,
      detalle: usosIa.detalle,
      createdAt: usosIa.createdAt,
    })
    .from(usosIa)
    .leftJoin(usuarios, eq(usuarios.id, usosIa.userId))
    .orderBy(desc(usosIa.createdAt), desc(usosIa.id))
    .limit(limite)
  return filas
}

/** Total gastado (histórico y mes en curso) + número de usos. */
export async function resumenUsosIa(): Promise<ResumenUsosIa> {
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const [total] = await db
    .select({
      micro: sql<number>`coalesce(sum(${usosIa.costoMicroUsd}), 0)`,
      usos: sql<number>`count(*)`,
    })
    .from(usosIa)
  const [mes] = await db
    .select({ micro: sql<number>`coalesce(sum(${usosIa.costoMicroUsd}), 0)` })
    .from(usosIa)
    .where(gte(usosIa.createdAt, inicioMes))

  return {
    totalMicroUsd: Number(total?.micro ?? 0),
    mesMicroUsd: Number(mes?.micro ?? 0),
    totalUsos: Number(total?.usos ?? 0),
  }
}
