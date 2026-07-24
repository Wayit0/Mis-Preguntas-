import { and, asc, desc, eq, lt } from 'drizzle-orm'

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
  datos: { asignatura: string; nombreArchivo: string; resultado: ResultadoBorrador },
): Promise<number> {
  await limpiarExpirados(userId)

  const existentes = await db
    .select({ id: borradoresImportacion.id })
    .from(borradoresImportacion)
    .where(eq(borradoresImportacion.userId, userId))
    .orderBy(asc(borradoresImportacion.updatedAt))
  const sobran = existentes.length - (MAX_BORRADORES_POR_USUARIO - 1)
  for (const b of existentes.slice(0, Math.max(0, sobran))) {
    await db.delete(borradoresImportacion).where(eq(borradoresImportacion.id, b.id))
  }

  const [fila] = await db
    .insert(borradoresImportacion)
    .values({
      userId,
      asignatura: datos.asignatura,
      nombreArchivo: datos.nombreArchivo,
      resultado: datos.resultado as unknown as Record<string, unknown>,
    })
    .returning({ id: borradoresImportacion.id })
  return fila.id
}

/** Lista los borradores del usuario, más reciente primero. Aplica limpieza. */
export async function listarBorradores(userId: number): Promise<BorradorResumen[]> {
  await limpiarExpirados(userId)
  const filas = await db
    .select()
    .from(borradoresImportacion)
    .where(eq(borradoresImportacion.userId, userId))
    .orderBy(desc(borradoresImportacion.updatedAt))
  return filas.map((f) => {
    const resultado = f.resultado as unknown as ResultadoBorrador
    const edicion = f.edicion as unknown[] | null
    return {
      id: f.id,
      nombreArchivo: f.nombreArchivo,
      asignatura: f.asignatura,
      // Si hay edición, es la verdad más fresca (el usuario pudo... no: la
      // edición no agrega ni quita preguntas hoy, pero contar de ahí es igual
      // de correcto y refleja lo que verá al retomar).
      numPreguntas: edicion?.length ?? resultado.preguntas.length,
      actualizadoEn: f.updatedAt.toISOString(),
    }
  })
}
