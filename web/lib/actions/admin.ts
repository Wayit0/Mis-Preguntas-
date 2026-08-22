'use server'

import { randomBytes } from 'node:crypto'
import { headers } from 'next/headers'
import { eq, inArray, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import {
  asignaciones,
  borradoresImportacion,
  borradoresTarea,
  carpetas,
  colaboraciones,
  colegios,
  cursos,
  entregas,
  feedback,
  inscripciones,
  pagosSuscripcion,
  preguntas,
  pruebas,
  suscripciones,
  textos,
  usosIa,
  usuarios,
} from '@/lib/db/schema'
import { requireRole, type Rol } from '@/lib/authz'
import { auth } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Server actions de administración GLOBAL (Parte E.2).
//
// REGLA DE SEGURIDAD: TODAS llaman primero a requireRole(['global_admin']),
// que lee la fila de `usuarios` (no la sesión cacheada) y redirige si el actor
// no es admin global. NUNCA confiamos en que la UI haya ocultado un control: un
// cliente podría invocar la action directamente. Tras el guard de rol, las
// actions devuelven un resultado legible ({ error } | { ok }) para validaciones
// de entrada, de modo que la UI muestre el mensaje y los tests las ejerciten.
// ---------------------------------------------------------------------------

/** Resultado genérico de una mutación de administración. */
export type ResultadoAdmin = { error: string } | { ok: true }
/** Resultado de crear un colegio: además del ok, devuelve el colegio creado. */
export type ResultadoColegioCreado =
  | { error: string }
  | { ok: true; colegio: typeof colegios.$inferSelect }

const ROLES_VALIDOS: Rol[] = ['global_admin', 'school_admin', 'teacher']

/** Genera un token/código aleatorio largo (secreto). */
function generarToken(bytes = 12): string {
  return randomBytes(bytes).toString('base64url')
}

/**
 * joinCode único: reintenta ante colisión (la columna es UNIQUE). Los códigos
 * son largos y aleatorios, así que la colisión es ínfima; el reintento la cubre.
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

/** Verifica que un colegio exista (helper de validación para las actions). */
async function colegioExiste(colegioId: number): Promise<boolean> {
  const [c] = await db
    .select({ id: colegios.id })
    .from(colegios)
    .where(eq(colegios.id, colegioId))
    .limit(1)
  return !!c
}

// Roles que el admin puede asignar al CREAR un usuario. Excluye global_admin a
// propósito: escalar a admin global se hace después, con asignarRol sobre la
// fila (un paso extra y deliberado para un privilegio total).
const ROLES_CREABLES: Rol[] = ['teacher', 'school_admin', 'student']

/**
 * crearUsuario: alta manual de una cuenta desde el panel de administración.
 * Crea la cuenta vía better-auth (auth.api.signUpEmail, que hashea y guarda la
 * contraseña en accounts.password) y luego estampa rol y colegio. NO re-emite
 * cookies: la sesión del admin no cambia. Solo global_admin.
 */
export async function crearUsuario(input: {
  nombre: string
  email: string
  password: string
  role: string
  colegioId: number | null
}): Promise<ResultadoAdmin> {
  await requireRole(['global_admin'])

  const nombre = (input.nombre ?? '').trim()
  const email = (input.email ?? '').trim().toLowerCase()
  const password = input.password ?? ''

  if (!nombre) return { error: 'El nombre es obligatorio.' }
  if (!email.includes('@')) return { error: 'Ingresa un correo válido.' }
  if (password.length < 6) {
    return { error: 'La contraseña debe tener al menos 6 caracteres.' }
  }
  if (!ROLES_CREABLES.includes(input.role as Rol)) {
    return { error: 'Rol inválido.' }
  }
  if (input.colegioId !== null) {
    if (!Number.isFinite(input.colegioId)) return { error: 'Colegio inválido.' }
    if (!(await colegioExiste(input.colegioId))) {
      return { error: 'El colegio no existe.' }
    }
  }
  // Los estudiantes quedan fuera del modelo de colegios (spec cursos-y-tareas).
  const colegioId = input.role === 'student' ? null : input.colegioId

  try {
    const res = await auth.api.signUpEmail({
      body: { name: nombre, email, password },
    })
    const userId = Number(res.user.id)
    if (!Number.isFinite(userId)) {
      return { error: 'No se pudo crear la cuenta. Inténtalo de nuevo.' }
    }
    await db
      .update(usuarios)
      .set({ role: input.role, colegioId })
      .where(eq(usuarios.id, userId))
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/exist/i.test(msg)) {
      return { error: 'Ya existe una cuenta con ese correo.' }
    }
    console.error('[admin] crearUsuario', e)
    return { error: 'No se pudo crear la cuenta. Inténtalo de nuevo.' }
  }

  revalidatePath('/admin')
  return { ok: true }
}

/**
 * crearColegio: genera un joinCode aleatorio único y crea el colegio. Devuelve
 * el colegio creado. Solo global_admin (guard requireRole).
 */
export async function crearColegio(
  nombre: string,
  logo?: string,
): Promise<ResultadoColegioCreado> {
  await requireRole(['global_admin'])

  const limpio = (nombre ?? '').trim()
  if (!limpio) return { error: 'El nombre del colegio es obligatorio.' }

  const joinCode = await generarJoinCodeUnico()
  const [colegio] = await db
    .insert(colegios)
    .values({ nombre: limpio, joinCode, logo: logo ?? null })
    .returning()

  revalidatePath('/admin')
  return { ok: true, colegio }
}

/**
 * editarColegio: actualiza el nombre (y, si se pasa, el logo) de un colegio.
 * Solo global_admin.
 */
export async function editarColegio(
  id: number,
  nombre: string,
  logo?: string,
): Promise<ResultadoAdmin> {
  await requireRole(['global_admin'])

  if (!Number.isFinite(id)) return { error: 'Colegio no encontrado.' }
  const limpio = (nombre ?? '').trim()
  if (!limpio) return { error: 'El nombre del colegio es obligatorio.' }

  const cambios: { nombre: string; logo?: string } = { nombre: limpio }
  if (logo !== undefined) cambios.logo = logo

  await db.update(colegios).set(cambios).where(eq(colegios.id, id))

  revalidatePath('/admin')
  revalidatePath('/colegio')
  return { ok: true }
}

/**
 * asignarRol: cambia el rol global de un usuario (teacher | school_admin |
 * global_admin). Solo global_admin. Valida que el rol esté en la lista.
 */
export async function asignarRol(
  userId: number,
  role: string,
): Promise<ResultadoAdmin> {
  await requireRole(['global_admin'])

  if (!Number.isFinite(userId)) return { error: 'Usuario no encontrado.' }
  if (!ROLES_VALIDOS.includes(role as Rol)) return { error: 'Rol inválido.' }

  await db.update(usuarios).set({ role }).where(eq(usuarios.id, userId))

  revalidatePath('/admin')
  return { ok: true }
}

/**
 * asignarColegio: asocia (o desasocia, con null) un usuario a un colegio. Solo
 * global_admin. Verifica que el colegio exista cuando no es null.
 */
export async function asignarColegio(
  userId: number,
  colegioId: number | null,
): Promise<ResultadoAdmin> {
  await requireRole(['global_admin'])

  if (!Number.isFinite(userId)) return { error: 'Usuario no encontrado.' }
  if (colegioId !== null) {
    if (!Number.isFinite(colegioId)) return { error: 'Colegio inválido.' }
    if (!(await colegioExiste(colegioId))) {
      return { error: 'El colegio no existe.' }
    }
  }

  await db.update(usuarios).set({ colegioId }).where(eq(usuarios.id, userId))

  revalidatePath('/admin')
  return { ok: true }
}

/**
 * designarAdminColegio: marca a un usuario como school_admin de un colegio
 * concreto (set role=school_admin + colegio_id). Solo global_admin. Verifica que
 * el colegio exista.
 */
export async function designarAdminColegio(
  userId: number,
  colegioId: number,
): Promise<ResultadoAdmin> {
  await requireRole(['global_admin'])

  if (!Number.isFinite(userId)) return { error: 'Usuario no encontrado.' }
  if (!Number.isFinite(colegioId)) return { error: 'Selecciona un colegio.' }
  if (!(await colegioExiste(colegioId))) {
    return { error: 'El colegio no existe.' }
  }

  await db
    .update(usuarios)
    .set({ role: 'school_admin', colegioId })
    .where(eq(usuarios.id, userId))

  revalidatePath('/admin')
  revalidatePath('/colegio')
  return { ok: true }
}

/**
 * eliminarUsuario: borra la cuenta y TODO su contenido — irreversible. Solo
 * global_admin; no se puede eliminar a sí mismo (evita quedarse sin sesión de
 * admin a mitad de la operación).
 *
 * Cascada manual en una transacción (sin FK formal en el dominio, así que
 * nada de esto lo hace la base de datos sola):
 *  - Si es profesor con cursos propios: sus entregas/borradores de
 *    tarea/asignaciones/inscripciones y los cursos mismos (el curso completo
 *    desaparece con su dueño).
 *  - Sus propias entregas/borradores de tarea/inscripciones como estudiante
 *    (en cursos de OTROS).
 *  - Su contenido: preguntas, textos, pruebas, carpetas, usos de IA,
 *    borradores de importación, feedback enviado, colaboraciones (en
 *    cualquiera de los dos sentidos) y suscripción/pagos.
 *  - Al final, auth.api.removeUser: borra sessions + accounts + la fila de
 *    usuarios (better-auth, ver internal-adapter.mjs).
 *
 * Lo que NO se toca a propósito: `accesos` (bitácora de accesos, queda con el
 * userId huérfano) e `invitaciones_colegio` (van por email, no por userId).
 */
export async function eliminarUsuario(userId: number): Promise<ResultadoAdmin> {
  const actor = await requireRole(['global_admin'])

  if (!Number.isFinite(userId)) return { error: 'Usuario no encontrado.' }
  if (userId === actor.userId) {
    return { error: 'No puedes eliminar tu propia cuenta desde aquí.' }
  }

  const [existe] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.id, userId))
    .limit(1)
  if (!existe) return { error: 'Usuario no encontrado.' }

  await db.transaction(async (tx) => {
    const cursosPropios = await tx
      .select({ id: cursos.id })
      .from(cursos)
      .where(eq(cursos.userId, userId))
    const cursoIds = cursosPropios.map((c) => c.id)

    if (cursoIds.length > 0) {
      const asignacionesPropias = await tx
        .select({ id: asignaciones.id })
        .from(asignaciones)
        .where(inArray(asignaciones.cursoId, cursoIds))
      const asignacionIds = asignacionesPropias.map((a) => a.id)

      if (asignacionIds.length > 0) {
        await tx.delete(entregas).where(inArray(entregas.asignacionId, asignacionIds))
        await tx
          .delete(borradoresTarea)
          .where(inArray(borradoresTarea.asignacionId, asignacionIds))
        await tx.delete(asignaciones).where(inArray(asignaciones.id, asignacionIds))
      }
      await tx.delete(inscripciones).where(inArray(inscripciones.cursoId, cursoIds))
      await tx.delete(cursos).where(inArray(cursos.id, cursoIds))
    }

    // Su propia participación como estudiante en cursos de otros.
    await tx.delete(entregas).where(eq(entregas.estudianteId, userId))
    await tx.delete(borradoresTarea).where(eq(borradoresTarea.estudianteId, userId))
    await tx.delete(inscripciones).where(eq(inscripciones.estudianteId, userId))

    await tx.delete(usosIa).where(eq(usosIa.userId, userId))
    await tx.delete(borradoresImportacion).where(eq(borradoresImportacion.userId, userId))
    await tx.delete(feedback).where(eq(feedback.userId, userId))
    await tx
      .delete(colaboraciones)
      .where(or(eq(colaboraciones.fromUserId, userId), eq(colaboraciones.toUserId, userId)))
    await tx.delete(pagosSuscripcion).where(eq(pagosSuscripcion.userId, userId))
    await tx.delete(suscripciones).where(eq(suscripciones.userId, userId))

    // Preguntas antes que textos: preguntas.textoId apunta a textos (sin FK
    // formal, pero evita dejar el orden invertido sin motivo).
    await tx.delete(preguntas).where(eq(preguntas.userId, userId))
    await tx.delete(textos).where(eq(textos.userId, userId))
    await tx.delete(pruebas).where(eq(pruebas.userId, userId))
    await tx.delete(carpetas).where(eq(carpetas.userId, userId))
  })

  // Fuera de la transacción de arriba: better-auth usa su propio adaptador
  // (mismo pool, pero sin unirse a esa transacción). Va al final, cuando el
  // contenido del dominio ya está limpio.
  //
  // `removeUser` corre tras `adminMiddleware`, que exige una sesión admin
  // autenticada (lee ctx.context.session.user.role) — a diferencia de
  // signUpEmail (público), acá SÍ hay que reenviar los headers de la petición
  // actual para que vea la cookie de sesión del global_admin que llama esto.
  await auth.api.removeUser({
    body: { userId: String(userId) },
    headers: await headers(),
  })

  revalidatePath('/admin')
  return { ok: true }
}
