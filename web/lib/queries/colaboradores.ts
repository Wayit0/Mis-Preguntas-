import { and, asc, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colaboraciones, usuarios } from '@/lib/db/schema'

/** Un colega tal como se muestra en las listas de colaboración. */
export interface Colega {
  id: number
  nombre: string
  email: string
}

/**
 * Colegas a los que el usuario invitó: pueden ver sus preguntas compartidas.
 *
 * Espejo de `cargar_colaboradores` (app.py): filas de `colaboraciones` con
 * `from_user_id = userId`, devolviendo el usuario `to` (semántica "from comparte
 * con to"). Es la lista de la pestaña «Quién me puede ver a mí». Orden por
 * nombre, igual que el MVP.
 */
export async function cargarColaboradores(userId: number): Promise<Colega[]> {
  return db
    .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email })
    .from(usuarios)
    .innerJoin(colaboraciones, eq(colaboraciones.toUserId, usuarios.id))
    .where(eq(colaboraciones.fromUserId, userId))
    .orderBy(asc(usuarios.nombre))
}

/**
 * Colegas que invitaron al usuario: le dieron acceso a sus preguntas
 * compartidas (las que aparecen en el Banco Compartido).
 *
 * Espejo de `cargar_quienes_me_invitaron` (app.py): filas de `colaboraciones`
 * con `to_user_id = userId`, devolviendo el usuario `from`. Misma semántica que
 * `cargarBancoCompartido`/`getDashboardStats.compartidasConmigo`
 * (`from_user_id = autor AND to_user_id = userId`). Es la lista de la pestaña
 * «Colegas que puedo ver». Orden por nombre.
 */
export async function cargarQuienesMeInvitaron(
  userId: number,
): Promise<Colega[]> {
  return db
    .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email })
    .from(usuarios)
    .innerJoin(colaboraciones, eq(colaboraciones.fromUserId, usuarios.id))
    .where(eq(colaboraciones.toUserId, userId))
    .orderBy(asc(usuarios.nombre))
}

/**
 * Busca un usuario por email exacto, excluyendo a `excludeId` (uno mismo).
 * Espejo de `buscar_usuario_por_email` (app.py). Devuelve `null` si no existe.
 * El email se compara tal cual; quien llama debe normalizarlo (better-auth
 * almacena los emails en minúsculas).
 */
export async function buscarUsuarioPorEmail(
  email: string,
  excludeId: number,
): Promise<Colega | null> {
  const [u] = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email })
    .from(usuarios)
    .where(and(eq(usuarios.email, email), ne(usuarios.id, excludeId)))
    .limit(1)
  return u ?? null
}
