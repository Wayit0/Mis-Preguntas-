'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { pruebas, usuarios } from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'
import { deleteBlob, uploadImage } from '@/lib/storage/blob'
import { colegioIdDeUsuario } from '@/lib/queries/visibilidad'
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
 * Sube el logo del FormData (si viene) y devuelve su clave de blob, o `null`.
 * El logo es POR PRUEBA (se guarda en `pruebas.logo`): no se comparte con el
 * colegio ni se aplica automáticamente a otros PDFs.
 */
async function subirLogo(formData: FormData): Promise<string | null> {
  const logoEntry = formData.get('logo')
  if (logoEntry instanceof File && logoEntry.size > 0) {
    return uploadImage(logoEntry)
  }
  return null
}

/** Casilla "Incluir el logo del colegio": true salvo que llegue '0'. */
function leerUsarLogoColegio(formData: FormData): boolean {
  return formData.get('usarLogoColegio') !== '0'
}

/**
 * Recuerda las instrucciones como default del usuario ("igual que el logo"):
 * al guardar una prueba con instrucciones, la siguiente prueba nueva las
 * pre-rellena. Guardar sin instrucciones no borra el default.
 */
async function recordarInstrucciones(
  userId: number,
  instrucciones: string | null,
): Promise<void> {
  if (!instrucciones) return
  await db
    .update(usuarios)
    .set({ instruccionesDefault: instrucciones })
    .where(eq(usuarios.id, userId))
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
 * Crea una prueba del usuario autenticado. Valida el encabezado con Zod e inserta
 * la fila (sin PDF: se genera después desde la lista).
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
  const logo = await subirLogo(formData)
  const colegioId = await colegioIdDeUsuario(userId)

  const [fila] = await db
    .insert(pruebas)
    .values({
      userId,
      colegioId,
      asignatura: data.asignatura,
      titulo: oNull(data.titulo),
      colegio: oNull(data.colegio),
      profesor: oNull(data.profesor),
      instrucciones: oNull(data.instrucciones),
      formulas: seleccion.formulas,
      preguntasIds: seleccion.preguntasIds,
      textosIds: seleccion.textosIds,
      logo,
      usarLogoColegio: leerUsarLogoColegio(formData),
    })
    .returning({ id: pruebas.id })

  await recordarInstrucciones(userId, oNull(data.instrucciones))

  revalidatePath('/mis-pruebas')
  return { id: fila.id }
}

/**
 * Actualiza una prueba del usuario (guard de propiedad). INVALIDA el PDF cacheado:
 * borra el blob del PDF y pone a NULL `pdfKey`/`pdfGeneradoEn`, de modo que
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
  // Logo nuevo (opcional): sólo se reemplaza si se subió un archivo.
  const logoNuevo = await subirLogo(formData)

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
      ...(logoNuevo ? { logo: logoNuevo } : {}),
      usarLogoColegio: leerUsarLogoColegio(formData),
      pdfKey: null,
      pdfGeneradoEn: null,
      updatedAt: new Date(),
    })
    .where(and(eq(pruebas.id, id), eq(pruebas.userId, userId)))

  await recordarInstrucciones(userId, oNull(data.instrucciones))

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
