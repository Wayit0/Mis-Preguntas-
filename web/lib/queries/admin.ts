import { asc, count, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colegios, usuarios } from '@/lib/db/schema'

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
