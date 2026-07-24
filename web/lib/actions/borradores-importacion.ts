'use server'

import { and, eq } from 'drizzle-orm'

import { getSession } from '@/lib/get-session'
import { db } from '@/lib/db'
import { borradoresImportacion } from '@/lib/db/schema'
import type { ResultadoBorrador } from '@/lib/import/borradores'
import {
  edicionBorradorSchema,
  type PreguntaEditableBorrador,
} from '@/lib/validation/import'

// ---------------------------------------------------------------------------
// Server actions de los borradores de importación. Todas exigen sesión y
// acotan cada consulta por (id, userId): un borrador ajeno y uno inexistente
// devuelven el MISMO error (no filtramos existencia). La creación NO vive
// aquí: la hace el route handler /api/importar (server-side, best-effort).
// ---------------------------------------------------------------------------

/** Tope del payload de edición: 14 imágenes reales caben con holgura. */
const MAX_BYTES_EDICION = 25 * 1024 * 1024

const NO_ENCONTRADO = 'El borrador ya no existe (fue completado o eliminado).'

/** Borrador completo para retomar la revisión. */
export interface BorradorParaRetomar {
  id: number
  asignatura: string
  nombreArchivo: string
  resultado: ResultadoBorrador
  edicion: PreguntaEditableBorrador[] | null
}

export async function obtenerBorradorImportacion(
  id: number,
): Promise<{ ok: true; borrador: BorradorParaRetomar } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)

  const [fila] = await db
    .select()
    .from(borradoresImportacion)
    .where(and(eq(borradoresImportacion.id, id), eq(borradoresImportacion.userId, userId)))
  if (!fila) return { ok: false, error: NO_ENCONTRADO }

  return {
    ok: true,
    borrador: {
      id: fila.id,
      asignatura: fila.asignatura,
      nombreArchivo: fila.nombreArchivo,
      resultado: fila.resultado as unknown as ResultadoBorrador,
      // La edición se validó al escribirse; al leer se confía en la BD.
      edicion: (fila.edicion as PreguntaEditableBorrador[] | null) ?? null,
    },
  }
}

export async function actualizarBorradorImportacion(
  id: number,
  edicion: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)

  // Tope de tamaño ANTES de validar forma (el stringify es más barato que un
  // parse de zod sobre un payload gigante malicioso).
  if (JSON.stringify(edicion).length > MAX_BYTES_EDICION) {
    return { ok: false, error: 'El borrador es demasiado grande para guardarse.' }
  }
  const parsed = edicionBorradorSchema.safeParse(edicion)
  if (!parsed.success) {
    return { ok: false, error: 'La edición del borrador no es válida.' }
  }

  const actualizadas = await db
    .update(borradoresImportacion)
    .set({ edicion: parsed.data, updatedAt: new Date() })
    .where(and(eq(borradoresImportacion.id, id), eq(borradoresImportacion.userId, userId)))
    .returning({ id: borradoresImportacion.id })
  if (actualizadas.length === 0) return { ok: false, error: NO_ENCONTRADO }
  return { ok: true }
}

export async function descartarBorradorImportacion(
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)

  const eliminadas = await db
    .delete(borradoresImportacion)
    .where(and(eq(borradoresImportacion.id, id), eq(borradoresImportacion.userId, userId)))
    .returning({ id: borradoresImportacion.id })
  if (eliminadas.length === 0) return { ok: false, error: NO_ENCONTRADO }
  return { ok: true }
}
