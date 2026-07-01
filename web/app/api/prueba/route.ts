import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colegios, usuarios } from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'
import { getImageStream, uploadImage } from '@/lib/storage/blob'
import {
  construirPruebaPdf,
  idsDesde,
  nombreArchivo,
  PruebaSinPreguntasError,
} from '@/lib/pdf/construir'

export const runtime = 'nodejs'

/**
 * Genera el PDF de una prueba a partir de una selección de preguntas (y,
 * opcionalmente, textos) del usuario autenticado, más las opciones de
 * encabezado. Responde con `application/pdf` y `Content-Disposition: attachment`
 * para una descarga limpia. Generación puntual (sin persistir); las pruebas
 * guardadas se generan desde `/api/mis-pruebas/[id]/pdf`.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return new Response('No autorizado', { status: 401 })
  }
  const userId = Number(session.user.id)

  const form = await request.formData()

  const asignatura = (form.get('asignatura') ?? '').toString().trim()
  if (!asignatura) {
    return new Response('Falta la asignatura', { status: 400 })
  }

  // Datos del colegio del usuario (para logo automático y auto-guardado).
  const [filaUsuario] = await db
    .select({ colegioId: usuarios.colegioId, role: usuarios.role })
    .from(usuarios)
    .where(eq(usuarios.id, userId))
    .limit(1)
  const userColegioId = filaUsuario?.colegioId ?? null
  const userRole = filaUsuario?.role ?? 'teacher'

  // Logo: si el usuario sube uno, se usa ese; si no, se carga el del colegio.
  const logoEntry = form.get('logo')
  let logo: Buffer | null = null
  if (logoEntry instanceof File && logoEntry.size > 0) {
    logo = Buffer.from(await logoEntry.arrayBuffer())
    // Auto-guardar el logo al colegio si el usuario es school_admin.
    if (userColegioId && (userRole === 'school_admin' || userRole === 'global_admin')) {
      try {
        const key = await uploadImage(logoEntry)
        await db.update(colegios).set({ logo: key }).where(eq(colegios.id, userColegioId))
      } catch {
        // El guardado falla silenciosamente; el PDF igual se genera.
      }
    }
  } else if (userColegioId) {
    // Sin logo subido: intentar usar el logo guardado del colegio.
    const [filaColegio] = await db
      .select({ logo: colegios.logo })
      .from(colegios)
      .where(eq(colegios.id, userColegioId))
      .limit(1)
    if (filaColegio?.logo) {
      const img = await getImageStream(filaColegio.logo)
      if (img) {
        const chunks: Buffer[] = []
        for await (const chunk of img.stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        logo = Buffer.concat(chunks)
      }
    }
  }

  let pdf: Buffer
  try {
    pdf = await construirPruebaPdf(userId, {
      asignatura,
      titulo: (form.get('titulo') ?? '').toString(),
      colegio: (form.get('colegio') ?? '').toString(),
      profesor: (form.get('profesor') ?? '').toString(),
      instrucciones: (form.get('instrucciones') ?? '').toString(),
      formulas: form
        .getAll('formula')
        .map((f) => f.toString())
        .filter((f) => f.trim()),
      preguntasIds: idsDesde(form.getAll('pregunta')),
      textosIds: idsDesde(form.getAll('texto')),
      logo,
    })
  } catch (err) {
    if (err instanceof PruebaSinPreguntasError) {
      return new Response(err.message, { status: 400 })
    }
    console.error('Error al generar la prueba PDF:', err)
    return new Response(
      'No se pudo generar la prueba. Inténtalo de nuevo en unos minutos.',
      { status: 500 },
    )
  }

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombreArchivo(asignatura)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
