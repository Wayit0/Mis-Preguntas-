'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { colegios, pruebas, usuarios } from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'
import { deleteBlob, uploadImage } from '@/lib/storage/blob'
import { idsDesde } from '@/lib/pdf/construir'
import {
  extraerCamposPrueba,
  pruebaSchema,
  primerErrorPrueba,
} from '@/lib/validation/prueba'

/** Resultado de guardar/actualizar una prueba: error legible o el id afectado. */
export type ResultadoPrueba = { error: string } | { id: number }

/** '' → null para columnas de texto opcionales. */
function oNull(valor: string): string | null {
  const limpio = valor.trim()
  return limpio.length > 0 ? limpio : null
}

/**
 * Si el usuario es school_admin o global_admin, guarda la clave del logo
 * en la tabla `colegios` para que futuros PDFs lo encuentren como fallback.
 * Falla silenciosamente para no bloquear la operación principal.
 */
async function autoGuardarLogoEnColegio(userId: number, logoKey: string): Promise<void> {
  try {
    const [fila] = await db
      .select({ colegioId: usuarios.colegioId, role: usuarios.role })
      .from(usuarios)
      .where(eq(usuarios.id, userId))
      .limit(1)
    if (
      fila?.colegioId &&
      (fila.role === 'school_admin' || fila.role === 'global_admin')
    ) {
      await db
        .update(colegios)
        .set({ logo: logoKey })
        .where(eq(colegios.id, fila.colegioId))
    }
  } catch {
    // No bloquea la operación principal.
  }
}

/** Extrae la selección (fórmulas + ids de preguntas/textos) del FormData. */
function extraerSeleccion(formData: FormData) {
  return {
    formulas: formData
      .getAll('formula')
      .map((f) => f.toString())
      .filter((f) => f.trim()),
    preguntasIds: idsDesde(formData.getAll('pregunta')),
    textosIds: idsDesde(formData.getAll('texto')),
  }
}

/**
 * Crea una prueba del usuario autenticado. Valida el encabezado con Zod, sube el
 * logo si viene, e inserta la fila (sin PDF: se genera después desde la lista).
 * Devuelve el id de la prueba creada; la navegación la hace el cliente.
 */
export async function guardarPrueba(
  formData: FormData,
): Promise<ResultadoPrueba> {
  const session = await getSession()
  if (!session) return { error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)

  const parsed = pruebaSchema.safeParse(extraerCamposPrueba(formData))
  if (!parsed.success) return { error: primerErrorPrueba(parsed.error) }
  const data = parsed.data
  const seleccion = extraerSeleccion(formData)

  const logoEntry = formData.get('logo')
  let logo: string | null = null
  if (logoEntry instanceof File && logoEntry.size > 0) {
    logo = await uploadImage(logoEntry)
    await autoGuardarLogoEnColegio(userId, logo)
  }

  const [fila] = await db
    .insert(pruebas)
    .values({
      userId,
      asignatura: data.asignatura,
      titulo: oNull(data.titulo),
      colegio: oNull(data.colegio),
      profesor: oNull(data.profesor),
      instrucciones: oNull(data.instrucciones),
      formulas: seleccion.formulas,
      preguntasIds: seleccion.preguntasIds,
      textosIds: seleccion.textosIds,
      logo,
    })
    .returning({ id: pruebas.id })

  revalidatePath('/mis-pruebas')
  return { id: fila.id }
}

/**
 * Actualiza una prueba del usuario (guard de propiedad). Reemplaza el logo sólo
 * si se subió uno nuevo. INVALIDA el PDF cacheado: al cambiar el contenido, se
 * borra el blob del PDF y se ponen a NULL `pdfKey`/`pdfGeneradoEn`, de modo que
 * el usuario deba regenerarlo (así la descarga siempre coincide con lo guardado).
 */
export async function actualizarPrueba(
  id: number,
  formData: FormData,
): Promise<ResultadoPrueba> {
  const session = await getSession()
  if (!session) return { error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)
  if (!Number.isFinite(id)) return { error: 'Prueba no encontrada.' }

  const [existente] = await db
    .select({ id: pruebas.id, pdfKey: pruebas.pdfKey })
    .from(pruebas)
    .where(and(eq(pruebas.id, id), eq(pruebas.userId, userId)))
    .limit(1)
  if (!existente) return { error: 'No tienes permiso para editar esta prueba.' }

  const parsed = pruebaSchema.safeParse(extraerCamposPrueba(formData))
  if (!parsed.success) return { error: primerErrorPrueba(parsed.error) }
  const data = parsed.data
  const seleccion = extraerSeleccion(formData)

  const logoEntry = formData.get('logo')
  let logoNuevo: string | null = null
  if (logoEntry instanceof File && logoEntry.size > 0) {
    logoNuevo = await uploadImage(logoEntry)
    await autoGuardarLogoEnColegio(userId, logoNuevo)
  }

  // Invalidar el PDF cacheado: borrar el blob previo (si existía).
  if (existente.pdfKey) await deleteBlob(existente.pdfKey)

  await db
    .update(pruebas)
    .set({
      asignatura: data.asignatura,
      titulo: oNull(data.titulo),
      colegio: oNull(data.colegio),
      profesor: oNull(data.profesor),
      instrucciones: oNull(data.instrucciones),
      formulas: seleccion.formulas,
      preguntasIds: seleccion.preguntasIds,
      textosIds: seleccion.textosIds,
      // Sólo se toca el logo si se subió uno nuevo.
      ...(logoNuevo ? { logo: logoNuevo } : {}),
      pdfKey: null,
      pdfGeneradoEn: null,
      updatedAt: new Date(),
    })
    .where(and(eq(pruebas.id, id), eq(pruebas.userId, userId)))

  revalidatePath('/mis-pruebas')
  return { id }
}

/**
 * Elimina una prueba del usuario (guard de propiedad). Borra también el blob del
 * PDF cacheado y el del logo para no dejar huérfanos en el storage.
 */
export async function eliminarPrueba(id: number): Promise<void> {
  const session = await getSession()
  if (!session) return
  const userId = Number(session.user.id)
  if (!Number.isFinite(id)) return

  const [existente] = await db
    .select({ id: pruebas.id, pdfKey: pruebas.pdfKey, logo: pruebas.logo })
    .from(pruebas)
    .where(and(eq(pruebas.id, id), eq(pruebas.userId, userId)))
    .limit(1)
  if (!existente) return

  if (existente.pdfKey) await deleteBlob(existente.pdfKey)
  if (existente.logo) await deleteBlob(existente.logo)

  await db.delete(pruebas).where(and(eq(pruebas.id, id), eq(pruebas.userId, userId)))

  revalidatePath('/mis-pruebas')
}
