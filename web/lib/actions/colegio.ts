'use server'

import { randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import {
  colegios,
  invitacionesColegio,
  preguntas,
  pruebas,
  sessions,
  textos,
  usuarios,
} from '@/lib/db/schema'
import { uploadImage } from '@/lib/storage/blob'
import { getActor, esAdminDeColegio, type Actor } from '@/lib/authz'
import {
  contarAdminsColegio,
  obtenerColegio,
} from '@/lib/queries/colegio'

// ---------------------------------------------------------------------------
// Server actions de administración de colegio (Parte E.1).
//
// REGLA DE SEGURIDAD: cada action revalida la identidad y el rol con los helpers
// de authz (getActor/esAdminDeColegio). NUNCA confiamos en que la UI haya
// ocultado un botón. Las actions devuelven un resultado legible ({ error } | …)
// en lugar de redirigir, para que el cliente muestre el mensaje y los tests las
// puedan ejercitar directamente.
// ---------------------------------------------------------------------------

/** Resultado genérico de una mutación de colegio. */
export type ResultadoColegio = { error: string } | { ok: true }
/** Resultado de regenerar el código: además del ok, devuelve el nuevo código. */
export type ResultadoCodigo = { error: string } | { ok: true; codigo: string }

/** Genera un token/código aleatorio largo (secreto). */
function generarToken(bytes = 18): string {
  return randomBytes(bytes).toString('base64url')
}

/**
 * Genera un joinCode único reintentando ante colisión (la columna es UNIQUE).
 * Los códigos son largos y aleatorios: la probabilidad de colisión es ínfima,
 * pero el reintento la cubre formalmente.
 */
async function generarJoinCodeUnico(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const codigo = generarToken(12)
    const [existe] = await db
      .select({ id: colegios.id })
      .from(colegios)
      .where(eq(colegios.joinCode, codigo))
      .limit(1)
    if (!existe) return codigo
  }
  // Extremadamente improbable; añadimos entropía extra como último recurso.
  return generarToken(24)
}

/** Tipo del ejecutor de transacción de Drizzle (para helpers reutilizables). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Adopta al colegio el contenido personal del profesor que aún no tiene colegio
 * (`colegio_id` NULL): preguntas, textos y pruebas. Preserva el comportamiento
 * de "al unirte, tu banco pasa a estar en el colegio" y deja el contenido
 * anclado a `colegioId` (no re-mueve el que ya pertenece a otro colegio).
 */
async function adoptarContenidoAlColegio(
  tx: Tx,
  userId: number,
  colegioId: number,
): Promise<void> {
  await tx
    .update(preguntas)
    .set({ colegioId })
    .where(and(eq(preguntas.userId, userId), isNull(preguntas.colegioId)))
  await tx
    .update(textos)
    .set({ colegioId })
    .where(and(eq(textos.userId, userId), isNull(textos.colegioId)))
  await tx
    .update(pruebas)
    .set({ colegioId })
    .where(and(eq(pruebas.userId, userId), isNull(pruebas.colegioId)))
}

/**
 * joinByCode: el profesor actual ingresa un código. Si coincide con el joinCode
 * de un colegio y el usuario no tiene colegio, se asocia (set colegio_id).
 * Idempotente: si ya pertenece a ese mismo colegio devuelve ok sin tocar nada.
 * Si pertenece a OTRO colegio, se rechaza (debe salir primero). Los códigos son
 * secretos/largos, por eso la asociación es inmediata (sin aprobación).
 */
export async function joinByCode(code: string): Promise<ResultadoColegio> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }

  const codigo = (code ?? '').trim()
  if (!codigo) return { error: 'Ingresa el código de tu colegio.' }

  const [colegio] = await db
    .select({ id: colegios.id })
    .from(colegios)
    .where(eq(colegios.joinCode, codigo))
    .limit(1)
  if (!colegio) return { error: 'El código no corresponde a ningún colegio.' }

  // Idempotente: ya estaba en ese colegio.
  if (actor.colegioId === colegio.id) {
    revalidatePath('/cuenta')
    return { ok: true }
  }
  // Ya pertenece a otro colegio: no lo movemos en silencio.
  if (actor.colegioId !== null) {
    return { error: 'Ya perteneces a un colegio.' }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(usuarios)
      .set({ colegioId: colegio.id })
      .where(eq(usuarios.id, actor.userId))
    await adoptarContenidoAlColegio(tx, actor.userId, colegio.id)
  })

  revalidatePath('/cuenta')
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * invitarPorEmail: sólo el school_admin de SU colegio (o un global_admin que
 * administre ese colegio) crea una invitación pendiente con token. No envía
 * email real: la invitación queda disponible para aceptarse. Idempotente: si ya
 * existe una invitación pendiente para ese email en el colegio, no la duplica.
 */
export async function invitarPorEmail(
  email: string,
): Promise<ResultadoColegio> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }

  const colegioId = actor.colegioId
  if (colegioId === null || !esAdminDeColegio(actor, colegioId)) {
    return { error: 'No tienes permiso para invitar profesores.' }
  }

  const normalizado = (email ?? '').trim().toLowerCase()
  if (!normalizado || !normalizado.includes('@')) {
    return { error: 'Ingresa un email válido.' }
  }

  // Idempotente: no duplicar una invitación pendiente para el mismo email.
  const [existente] = await db
    .select({ id: invitacionesColegio.id })
    .from(invitacionesColegio)
    .where(
      and(
        eq(invitacionesColegio.colegioId, colegioId),
        eq(invitacionesColegio.email, normalizado),
        eq(invitacionesColegio.estado, 'pendiente'),
      ),
    )
    .limit(1)
  if (existente) {
    revalidatePath('/colegio')
    return { ok: true }
  }

  await db.insert(invitacionesColegio).values({
    colegioId,
    email: normalizado,
    token: generarToken(),
    estado: 'pendiente',
  })

  revalidatePath('/colegio')
  return { ok: true }
}

/**
 * aceptarInvitacion: el usuario invitado (su email coincide con la invitación)
 * la acepta. Asocia su colegio_id al de la invitación y marca estado=aceptada.
 * Verifica que la invitación exista, esté pendiente y sea para el email del
 * actor (no se puede aceptar una invitación ajena).
 */
export async function aceptarInvitacion(
  token: string,
): Promise<ResultadoColegio> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }

  const tk = (token ?? '').trim()
  if (!tk) return { error: 'Invitación inválida.' }

  const [inv] = await db
    .select()
    .from(invitacionesColegio)
    .where(eq(invitacionesColegio.token, tk))
    .limit(1)
  if (!inv || inv.estado !== 'pendiente') {
    return { error: 'La invitación no existe o ya fue utilizada.' }
  }
  if (inv.email.trim().toLowerCase() !== actor.email.trim().toLowerCase()) {
    return { error: 'Esta invitación no está dirigida a tu cuenta.' }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(usuarios)
      .set({ colegioId: inv.colegioId })
      .where(eq(usuarios.id, actor.userId))
    await tx
      .update(invitacionesColegio)
      .set({ estado: 'aceptada' })
      .where(eq(invitacionesColegio.id, inv.id))
    await adoptarContenidoAlColegio(tx, actor.userId, inv.colegioId)
  })

  revalidatePath('/cuenta')
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * quitarProfesor: el school_admin quita a un profesor de SU colegio (set
 * colegio_id null). Verifica que el objetivo pertenezca al colegio del actor. No
 * puede quitarse a sí mismo si es el único school_admin del colegio (dejaría al
 * colegio sin administrador).
 */
export async function quitarProfesor(
  userId: number,
): Promise<ResultadoColegio> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }

  const colegioId = actor.colegioId
  if (colegioId === null || !esAdminDeColegio(actor, colegioId)) {
    return { error: 'No tienes permiso para gestionar profesores.' }
  }
  if (!Number.isFinite(userId)) return { error: 'Profesor no encontrado.' }

  const [objetivo] = await db
    .select({
      id: usuarios.id,
      colegioId: usuarios.colegioId,
      role: usuarios.role,
    })
    .from(usuarios)
    .where(eq(usuarios.id, userId))
    .limit(1)
  if (!objetivo || objetivo.colegioId !== colegioId) {
    return { error: 'Ese profesor no pertenece a tu colegio.' }
  }

  // No dejar el colegio sin admin: si el objetivo es el propio actor y es el
  // único school_admin, se bloquea.
  if (objetivo.id === actor.userId && objetivo.role === 'school_admin') {
    const admins = await contarAdminsColegio(colegioId)
    if (admins <= 1) {
      return {
        error: 'No puedes quitarte: eres el único administrador del colegio.',
      }
    }
  }

  await db
    .update(usuarios)
    .set({ colegioId: null })
    .where(eq(usuarios.id, userId))

  revalidatePath('/colegio')
  return { ok: true }
}

/**
 * Guard compartido de suspender/reactivar: el actor debe administrar su colegio
 * y `userId` debe ser un profesor de ESE colegio. Devuelve el actor y el colegio,
 * o un error legible.
 */
async function guardGestionProfesor(
  userId: number,
): Promise<{ error: string } | { actor: Actor; colegioId: number }> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }

  const colegioId = actor.colegioId
  if (colegioId === null || !esAdminDeColegio(actor, colegioId)) {
    return { error: 'No tienes permiso para gestionar profesores.' }
  }
  if (!Number.isFinite(userId)) return { error: 'Profesor no encontrado.' }

  const [objetivo] = await db
    .select({ colegioId: usuarios.colegioId })
    .from(usuarios)
    .where(eq(usuarios.id, userId))
    .limit(1)
  if (!objetivo || objetivo.colegioId !== colegioId) {
    return { error: 'Ese profesor no pertenece a tu colegio.' }
  }
  return { actor, colegioId }
}

/**
 * suspenderProfesor: marca al profesor como suspendido (`banned = true`) → no
 * puede iniciar sesión ni navegar. Su contenido PERMANECE en el colegio (anclado
 * por `colegio_id`). No puedes suspenderte a ti mismo. Reversible con
 * `reactivarProfesor`.
 */
export async function suspenderProfesor(
  userId: number,
): Promise<ResultadoColegio> {
  const g = await guardGestionProfesor(userId)
  if ('error' in g) return { error: g.error }
  if (userId === g.actor.userId) {
    return { error: 'No puedes suspenderte a ti mismo.' }
  }

  await db
    .update(usuarios)
    .set({
      banned: true,
      banReason: 'Suspendido por el administrador del colegio',
      banExpires: null,
    })
    .where(eq(usuarios.id, userId))

  // Revocar de inmediato las sesiones vivas del profesor: al setear `banned`
  // directo en BD, better-auth no revoca sesiones, y getSession sólo bloquea en
  // la siguiente petición. Borrarlas cierra el acceso al instante.
  await db.delete(sessions).where(eq(sessions.userId, userId))

  revalidatePath('/colegio')
  return { ok: true }
}

/** reactivarProfesor: quita la suspensión (`banned = false`). */
export async function reactivarProfesor(
  userId: number,
): Promise<ResultadoColegio> {
  const g = await guardGestionProfesor(userId)
  if ('error' in g) return { error: g.error }

  await db
    .update(usuarios)
    .set({ banned: false, banReason: null, banExpires: null })
    .where(eq(usuarios.id, userId))

  revalidatePath('/colegio')
  return { ok: true }
}

/**
 * configurarColegio: el school_admin edita el nombre y (opcionalmente) el logo
 * de SU colegio. El logo se sube al blob storage; si no se envía archivo, se
 * conserva el actual. Recibe FormData (campo `nombre` y archivo `logo`).
 */
export async function configurarColegio(
  formData: FormData,
): Promise<ResultadoColegio> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }

  const colegioId = actor.colegioId
  if (colegioId === null || !esAdminDeColegio(actor, colegioId)) {
    return { error: 'No tienes permiso para configurar el colegio.' }
  }

  const nombre = (formData.get('nombre') ?? '').toString().trim()
  if (!nombre) return { error: 'El nombre del colegio es obligatorio.' }

  const cambios: { nombre: string; logo?: string } = { nombre }
  const archivo = formData.get('logo')
  if (archivo instanceof File && archivo.size > 0) {
    cambios.logo = await uploadImage(archivo)
  }

  await db.update(colegios).set(cambios).where(eq(colegios.id, colegioId))

  revalidatePath('/colegio')
  return { ok: true }
}

/**
 * regenerarCodigo: el school_admin genera un nuevo joinCode aleatorio para su
 * colegio (invalida el anterior). Devuelve el nuevo código para mostrarlo.
 */
export async function regenerarCodigo(): Promise<ResultadoCodigo> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }

  const colegioId = actor.colegioId
  if (colegioId === null || !esAdminDeColegio(actor, colegioId)) {
    return { error: 'No tienes permiso para regenerar el código.' }
  }
  if (!(await obtenerColegio(colegioId))) {
    return { error: 'Colegio no encontrado.' }
  }

  const codigo = await generarJoinCodeUnico()
  await db
    .update(colegios)
    .set({ joinCode: codigo })
    .where(eq(colegios.id, colegioId))

  revalidatePath('/colegio')
  return { ok: true, codigo }
}
