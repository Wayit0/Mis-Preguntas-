'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { carpetas, preguntas, pruebas, textos } from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'
import {
  rutaCarpeta,
  carpetaYDescendientes,
  type TipoContenido,
} from '@/lib/queries/carpetas'

export type ResultadoCarpeta = { error: string } | { id: number }
export type ResultadoAccion = { error: string } | { ok: true }

// Profundidad máxima de anidación (la raíz cuenta como nivel 1).
const MAX_PROFUNDIDAD = 6
const MAX_NOMBRE = 60

function normalizarNombre(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const n = valor.trim()
  if (n.length === 0 || n.length > MAX_NOMBRE) return null
  return n
}

const RUTAS = ['/preguntas', '/mis-pruebas', '/textos']
function revalidarListas() {
  for (const r of RUTAS) revalidatePath(r)
}

/** Crea una carpeta del usuario, opcionalmente dentro de `parentId`. */
export async function crearCarpeta(
  nombre: string,
  parentId: number | null = null,
): Promise<ResultadoCarpeta> {
  const session = await getSession()
  if (!session) return { error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)

  const nombreLimpio = normalizarNombre(nombre)
  if (!nombreLimpio) return { error: 'El nombre de la carpeta no es válido.' }

  if (parentId != null) {
    const ruta = await rutaCarpeta(userId, parentId)
    if (ruta.length === 0) return { error: 'La carpeta destino no existe.' }
    if (ruta.length >= MAX_PROFUNDIDAD) {
      return { error: 'Alcanzaste el máximo de niveles de carpetas.' }
    }
  }

  const [fila] = await db
    .insert(carpetas)
    .values({ userId, nombre: nombreLimpio, parentId: parentId ?? null })
    .returning({ id: carpetas.id })

  revalidarListas()
  return { id: fila.id }
}

/** Renombra una carpeta del usuario (guard de propiedad). */
export async function renombrarCarpeta(
  id: number,
  nombre: string,
): Promise<ResultadoAccion> {
  const session = await getSession()
  if (!session) return { error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)
  if (!Number.isFinite(id)) return { error: 'Carpeta no encontrada.' }

  const nombreLimpio = normalizarNombre(nombre)
  if (!nombreLimpio) return { error: 'El nombre de la carpeta no es válido.' }

  const res = await db
    .update(carpetas)
    .set({ nombre: nombreLimpio })
    .where(and(eq(carpetas.id, id), eq(carpetas.userId, userId)))
    .returning({ id: carpetas.id })
  if (res.length === 0) return { error: 'No tienes permiso para editar esta carpeta.' }

  revalidarListas()
  return { ok: true }
}

/**
 * Mueve una carpeta bajo otra (o a la raíz con `nuevoParentId = null`). Evita
 * ciclos (no se puede mover una carpeta dentro de sí misma ni de un descendiente)
 * y respeta el máximo de profundidad.
 */
export async function moverCarpeta(
  id: number,
  nuevoParentId: number | null,
): Promise<ResultadoAccion> {
  const session = await getSession()
  if (!session) return { error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)
  if (!Number.isFinite(id)) return { error: 'Carpeta no encontrada.' }

  const propia = await rutaCarpeta(userId, id)
  if (propia.length === 0) return { error: 'La carpeta no existe.' }

  if (nuevoParentId != null) {
    if (nuevoParentId === id) return { error: 'No puedes mover una carpeta dentro de sí misma.' }
    const descendientes = await carpetaYDescendientes(userId, id)
    if (descendientes.includes(nuevoParentId)) {
      return { error: 'No puedes mover una carpeta dentro de una subcarpeta suya.' }
    }
    const rutaDestino = await rutaCarpeta(userId, nuevoParentId)
    if (rutaDestino.length === 0) return { error: 'La carpeta destino no existe.' }
    if (rutaDestino.length >= MAX_PROFUNDIDAD) {
      return { error: 'Alcanzaste el máximo de niveles de carpetas.' }
    }
  }

  await db
    .update(carpetas)
    .set({ parentId: nuevoParentId })
    .where(and(eq(carpetas.id, id), eq(carpetas.userId, userId)))

  revalidarListas()
  return { ok: true }
}

/**
 * Elimina una carpeta del usuario. NUNCA borra contenido: sus subcarpetas y sus
 * ítems (preguntas/pruebas/textos) suben a la carpeta padre (o a la raíz si la
 * borrada estaba en la raíz). Todo en una transacción.
 */
export async function eliminarCarpeta(id: number): Promise<ResultadoAccion> {
  const session = await getSession()
  if (!session) return { error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)
  if (!Number.isFinite(id)) return { error: 'Carpeta no encontrada.' }

  const [carpeta] = await db
    .select({ id: carpetas.id, parentId: carpetas.parentId })
    .from(carpetas)
    .where(and(eq(carpetas.id, id), eq(carpetas.userId, userId)))
    .limit(1)
  if (!carpeta) return { error: 'No tienes permiso para eliminar esta carpeta.' }

  const destino = carpeta.parentId // null = raíz

  await db.transaction(async (tx) => {
    // Reubica subcarpetas e ítems al padre de la carpeta borrada.
    await tx
      .update(carpetas)
      .set({ parentId: destino })
      .where(and(eq(carpetas.parentId, id), eq(carpetas.userId, userId)))
    for (const tabla of [preguntas, pruebas, textos]) {
      await tx
        .update(tabla)
        .set({ carpetaId: destino })
        .where(and(eq(tabla.carpetaId, id), eq(tabla.userId, userId)))
    }
    await tx
      .delete(carpetas)
      .where(and(eq(carpetas.id, id), eq(carpetas.userId, userId)))
  })

  revalidarListas()
  return { ok: true }
}

const TABLA = { preguntas, pruebas, textos } as const

/**
 * Mueve uno o varios ítems (del mismo tipo) a una carpeta, o los saca de toda
 * carpeta con `carpetaId = null`. El WHERE acota a los ítems del propio usuario,
 * así que ids ajenos simplemente no se tocan.
 */
export async function moverItems(
  tipo: TipoContenido,
  ids: number[],
  carpetaId: number | null,
): Promise<ResultadoAccion> {
  const session = await getSession()
  if (!session) return { error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)

  const idsValidos = ids.filter((n) => Number.isFinite(n))
  if (idsValidos.length === 0) return { error: 'No hay elementos para mover.' }

  if (carpetaId != null) {
    const ruta = await rutaCarpeta(userId, carpetaId)
    if (ruta.length === 0) return { error: 'La carpeta destino no existe.' }
  }

  const tabla = TABLA[tipo]
  await db
    .update(tabla)
    .set({ carpetaId })
    .where(and(eq(tabla.userId, userId), inArray(tabla.id, idsValidos)))

  revalidarListas()
  return { ok: true }
}
