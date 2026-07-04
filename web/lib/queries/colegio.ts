import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  colegios,
  invitacionesColegio,
  preguntas,
  textos,
  usuarios,
} from '@/lib/db/schema'
import type { Pregunta } from '@/lib/queries/preguntas'
import type { Texto } from '@/lib/queries/textos'

/** Una fila de la tabla `colegios` tal cual se lee de la base. */
export type Colegio = typeof colegios.$inferSelect

/** Un profesor del colegio tal como se muestra en la lista de gestión. */
export interface Profesor {
  id: number
  nombre: string
  email: string
  role: string
}

/** Una pregunta del banco del colegio junto con el nombre de su autor. */
export type PreguntaColegio = Pregunta & { autor: string }

/** Un texto del banco del colegio junto con el nombre de su autor. */
export type TextoColegio = Texto & { autor: string }

/** Banco del colegio: preguntas y textos de los profesores, con autor. */
export interface BancoColegio {
  preguntas: PreguntaColegio[]
  textos: TextoColegio[]
}

/** Una invitación pendiente que matchea el email del usuario actual. */
export interface InvitacionPendiente {
  id: number
  token: string
  colegioId: number
  colegioNombre: string
}

/**
 * Lee el colegio al que pertenece un usuario (null si no tiene colegio o si el
 * usuario no existe). Un solo JOIN evita dos queries separadas.
 */
export async function obtenerColegioPorUsuario(
  userId: number,
): Promise<Colegio | null> {
  if (!Number.isFinite(userId)) return null
  const [fila] = await db
    .select({ colegio: colegios })
    .from(colegios)
    .innerJoin(usuarios, eq(usuarios.colegioId, colegios.id))
    .where(eq(usuarios.id, userId))
    .limit(1)
  return fila?.colegio ?? null
}

/** Lee un colegio por id (null si no existe). Tolera ids no numéricos. */
export async function obtenerColegio(
  colegioId: number,
): Promise<Colegio | null> {
  if (!Number.isFinite(colegioId)) return null
  const [c] = await db
    .select()
    .from(colegios)
    .where(eq(colegios.id, colegioId))
    .limit(1)
  return c ?? null
}

/**
 * Profesores (y admins) del colegio, ordenados por nombre. Incluye el rol para
 * que la UI distinga al/los school_admin. Quien llama DEBE haber verificado que
 * el actor puede administrar este colegio (esAdminDeColegio).
 */
export async function listarProfesores(colegioId: number): Promise<Profesor[]> {
  if (!Number.isFinite(colegioId)) return []
  return db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      email: usuarios.email,
      role: usuarios.role,
    })
    .from(usuarios)
    .where(eq(usuarios.colegioId, colegioId))
    .orderBy(asc(usuarios.nombre))
}

/**
 * Cuenta cuántos school_admin tiene el colegio. Lo usa `quitarProfesor` para no
 * dejar un colegio sin administrador (no se puede quitar al único admin).
 */
export async function contarAdminsColegio(colegioId: number): Promise<number> {
  if (!Number.isFinite(colegioId)) return 0
  const filas = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(
      and(
        eq(usuarios.colegioId, colegioId),
        eq(usuarios.role, 'school_admin'),
      ),
    )
  return filas.length
}

/**
 * Banco del colegio: todas las preguntas y textos creados por los profesores del
 * colegio (autor.colegio_id = colegioId), con el nombre del autor. Orden por
 * autor y luego id, igual que el banco compartido. Quien llama DEBE haber
 * verificado que el actor puede administrar este colegio.
 */
export async function listarBancoColegio(
  colegioId: number,
): Promise<BancoColegio> {
  if (!Number.isFinite(colegioId)) return { preguntas: [], textos: [] }

  const filasPreguntas = await db
    .select({ pregunta: preguntas, autor: usuarios.nombre })
    .from(preguntas)
    .innerJoin(usuarios, eq(usuarios.id, preguntas.userId))
    .where(eq(preguntas.colegioId, colegioId))
    .orderBy(asc(usuarios.nombre), asc(preguntas.id))

  const filasTextos = await db
    .select({ texto: textos, autor: usuarios.nombre })
    .from(textos)
    .innerJoin(usuarios, eq(usuarios.id, textos.userId))
    .where(eq(textos.colegioId, colegioId))
    .orderBy(asc(usuarios.nombre), asc(textos.id))

  return {
    preguntas: filasPreguntas.map((f) => ({ ...f.pregunta, autor: f.autor })),
    textos: filasTextos.map((f) => ({ ...f.texto, autor: f.autor })),
  }
}

/**
 * Carga una pregunta del banco del colegio para editarla: sólo la devuelve si su
 * autor pertenece a `colegioId` (guard de "mismo colegio"). Devuelve null si no
 * existe o el autor no es del colegio. Tolera ids no numéricos.
 */
export async function cargarPreguntaDeColegio(
  id: number,
  colegioId: number,
): Promise<Pregunta | null> {
  if (!Number.isFinite(id) || !Number.isFinite(colegioId)) return null
  const [fila] = await db
    .select({ pregunta: preguntas })
    .from(preguntas)
    .where(and(eq(preguntas.id, id), eq(preguntas.colegioId, colegioId)))
    .limit(1)
  return fila?.pregunta ?? null
}

/**
 * Invitaciones pendientes cuyo email coincide con el del usuario (comparación en
 * minúsculas). Alimenta el bloque «Unirse a un colegio» para que el profesor
 * pueda aceptarlas. Excluye colegios al que ya pertenezca no es necesario: el
 * email sólo se invita una vez por colegio.
 */
export async function invitacionesPendientesPorEmail(
  email: string,
): Promise<InvitacionPendiente[]> {
  const normalizado = (email ?? '').trim().toLowerCase()
  if (!normalizado) return []
  return db
    .select({
      id: invitacionesColegio.id,
      token: invitacionesColegio.token,
      colegioId: invitacionesColegio.colegioId,
      colegioNombre: colegios.nombre,
    })
    .from(invitacionesColegio)
    .innerJoin(colegios, eq(colegios.id, invitacionesColegio.colegioId))
    .where(
      and(
        eq(invitacionesColegio.email, normalizado),
        eq(invitacionesColegio.estado, 'pendiente'),
      ),
    )
    .orderBy(asc(colegios.nombre))
}

/**
 * Invitaciones (pendientes y aceptadas) emitidas por un colegio, ordenadas por
 * fecha. Para mostrar en la pestaña de profesores el estado de las invitaciones.
 */
export async function listarInvitacionesColegio(colegioId: number) {
  if (!Number.isFinite(colegioId)) return []
  return db
    .select({
      id: invitacionesColegio.id,
      email: invitacionesColegio.email,
      estado: invitacionesColegio.estado,
      createdAt: invitacionesColegio.createdAt,
    })
    .from(invitacionesColegio)
    .where(eq(invitacionesColegio.colegioId, colegioId))
    .orderBy(asc(invitacionesColegio.email))
}
