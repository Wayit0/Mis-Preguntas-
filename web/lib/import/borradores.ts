import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { borradoresImportacion } from '@/lib/db/schema'
import type { ImagenExtraida } from '@/lib/docparse/extract'
import type { PreguntaAnalizada } from '@/lib/validation/import'

// ---------------------------------------------------------------------------
// Helpers de BD para los borradores de importación. SIN validación de sesión:
// el route handler ya conoce el userId autenticado y las server actions
// (lib/actions/borradores-importacion.ts) validan la suya. Diseño en
// docs/superpowers/specs/2026-07-24-borradores-importacion-design.md.
// ---------------------------------------------------------------------------

/** Máximo de borradores por usuario: al crear uno más se elimina el más antiguo. */
export const MAX_BORRADORES_POR_USUARIO = 10
/** Días sin tocar tras los cuales un borrador se limpia (limpieza perezosa). */
export const DIAS_RETENCION_BORRADOR = 30

/** Módulo dueño de un borrador. */
export type OrigenBorrador = 'importar' | 'generar'

/** Resumen para la tarjeta «Importaciones en curso». */
export interface BorradorResumen {
  id: number
  nombreArchivo: string
  asignatura: string
  numPreguntas: number
  /** ISO 8601 (los server components serializan props a JSON). */
  actualizadoEn: string
}

/** El resultado crudo del análisis, tal como se persiste en `resultado`. */
export interface ResultadoBorrador {
  preguntas: PreguntaAnalizada[]
  imagenes: ImagenExtraida[]
}

/**
 * Limpieza perezosa: elimina los borradores del usuario no tocados en
 * `DIAS_RETENCION_BORRADOR`. Se invoca al crear y al listar — sin cron.
 */
async function limpiarExpirados(userId: number): Promise<void> {
  const limite = new Date(Date.now() - DIAS_RETENCION_BORRADOR * 24 * 60 * 60 * 1000)
  await db
    .delete(borradoresImportacion)
    .where(
      and(
        eq(borradoresImportacion.userId, userId),
        lt(borradoresImportacion.updatedAt, limite),
      ),
    )
}

/**
 * Crea un borrador con el resultado crudo del análisis y devuelve su id.
 * Aplica la limpieza perezosa y el tope por usuario (elimina los más antiguos
 * por `updatedAt` hasta dejar espacio). Puede lanzar: el route handler lo
 * trata como best-effort (la importación nunca falla por el borrador).
 */
export async function crearBorrador(
  userId: number,
  datos: {
    asignatura: string
    nombreArchivo: string
    resultado: ResultadoBorrador
    origen: OrigenBorrador
  },
): Promise<number> {
  await limpiarExpirados(userId)

  const existentes = await db
    .select({ id: borradoresImportacion.id })
    .from(borradoresImportacion)
    .where(eq(borradoresImportacion.userId, userId))
    .orderBy(asc(borradoresImportacion.updatedAt))
  const sobran = existentes.length - (MAX_BORRADORES_POR_USUARIO - 1)
  const idsAEliminar = existentes.slice(0, Math.max(0, sobran)).map((b) => b.id)
  if (idsAEliminar.length > 0) {
    await db
      .delete(borradoresImportacion)
      .where(inArray(borradoresImportacion.id, idsAEliminar))
  }

  const [fila] = await db
    .insert(borradoresImportacion)
    .values({
      userId,
      asignatura: datos.asignatura,
      nombreArchivo: datos.nombreArchivo,
      resultado: datos.resultado as unknown as Record<string, unknown>,
      origen: datos.origen,
    })
    .returning({ id: borradoresImportacion.id })
  return fila.id
}

/**
 * Lista los borradores del usuario, más reciente primero. Aplica limpieza.
 * No trae los jsonb completos (`resultado`/`edicion` pueden pesar varios MB
 * por las imágenes en base64): sólo columnas escalares y el largo del arreglo
 * de preguntas, calculado en SQL.
 */
export async function listarBorradores(
  userId: number,
  origen: OrigenBorrador = 'importar',
): Promise<BorradorResumen[]> {
  await limpiarExpirados(userId)
  const filas = await db
    .select({
      id: borradoresImportacion.id,
      nombreArchivo: borradoresImportacion.nombreArchivo,
      asignatura: borradoresImportacion.asignatura,
      updatedAt: borradoresImportacion.updatedAt,
      // Largo de la edición (si existe) o de las preguntas del resultado, sin
      // transferir los jsonb completos (imágenes en base64, varios MB).
      numPreguntas: sql<number>`coalesce(
        jsonb_array_length(${borradoresImportacion.edicion}),
        jsonb_array_length(${borradoresImportacion.resultado}->'preguntas')
      )`,
    })
    .from(borradoresImportacion)
    .where(
      and(
        eq(borradoresImportacion.userId, userId),
        eq(borradoresImportacion.origen, origen),
      ),
    )
    .orderBy(desc(borradoresImportacion.updatedAt))
  return filas.map((f) => ({
    id: f.id,
    nombreArchivo: f.nombreArchivo,
    asignatura: f.asignatura,
    numPreguntas: Number(f.numPreguntas ?? 0),
    actualizadoEn: f.updatedAt.toISOString(),
  }))
}
