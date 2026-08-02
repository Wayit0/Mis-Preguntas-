import { generarPreguntas } from '@/lib/ai/generar'
import { registrarUsoIa } from '@/lib/ai/uso'
import type {
  GenerarParams,
  PreguntaGenerada,
  ResultadoGeneracion,
} from '@/lib/validation/generar'
import type { PreguntaAnalizada } from '@/lib/validation/import'

// ---------------------------------------------------------------------------
// Núcleo de "Crear preguntas con IA". Módulo normal (no server action) porque
// lo consume el route handler de streaming /api/generar: la generación puede
// acercarse al corte de ~230 s del front-end de Azure. Espejo de
// lib/import/analizar.ts.
// ---------------------------------------------------------------------------

/**
 * Normaliza una pregunta generada a la forma `PreguntaAnalizada` de /importar,
 * estampando tipo/materia/nivel desde los parámetros del formulario. Con esta
 * forma, la revisión, el borrador y el guardado reutilizan el código de
 * /importar sin cambios (los campos de imagen quedan en null: v1 no genera
 * imágenes).
 */
function normalizar(
  params: GenerarParams,
  p: PreguntaGenerada,
): PreguntaAnalizada {
  return {
    pregunta: p.pregunta,
    A: p.A ?? null,
    B: p.B ?? null,
    C: p.C ?? null,
    D: p.D ?? null,
    E: p.E ?? null,
    correcta: p.correcta ?? null,
    explicacion: p.explicacion ?? null,
    materia: params.tema,
    nivel: params.nivel,
    tipo: params.tipo,
    imagenPreguntaIndice: null,
    imagenesAlternativas: null,
    imagenPreguntaRecorte: null,
  }
}

/** Genera, normaliza y registra el uso. Todos los errores → {ok:false}. */
export async function ejecutarGeneracion(
  params: GenerarParams,
  userId: number,
): Promise<ResultadoGeneracion> {
  const inicio = Date.now()
  console.log(
    `[generar] inicio: asignatura=${params.asignatura} nivel="${params.nivel}" ` +
      `tipo=${params.tipo} cantidad=${params.cantidad}`,
  )

  try {
    const { preguntas, uso } = await generarPreguntas(params)
    const duracionSegundos = Number(((Date.now() - inicio) / 1000).toFixed(1))
    console.log(
      `[generar] fin OK: preguntas=${preguntas.length} en ${duracionSegundos}s`,
    )
    if (uso) {
      await registrarUsoIa(userId, 'generar_preguntas', uso, {
        asignatura: params.asignatura,
        nivel: params.nivel,
        tema: params.tema,
        tipo: params.tipo,
        cantidadPedida: params.cantidad,
        preguntas: preguntas.length,
        duracionSegundos,
      })
    }
    if (preguntas.length === 0) {
      return {
        ok: false,
        error:
          'La IA no pudo generar preguntas con esa descripción. Prueba ' +
          'reformulando el tema o lo que quieres evaluar.',
      }
    }
    return { ok: true, preguntas: preguntas.map((p) => normalizar(params, p)) }
  } catch (err) {
    console.error('[generar] generarPreguntas falló:', err)
    // Misma distinción que /importar: clave de Anthropic ausente/ inválida
    // (config) vs fallo transitorio.
    const status = (err as { status?: number } | null)?.status
    const mensaje = err instanceof Error ? err.message.toLowerCase() : ''
    const esProblemaDeClave =
      status === 401 ||
      status === 403 ||
      mensaje.includes('api key') ||
      mensaje.includes('anthropic_api_key')
    if (esProblemaDeClave) {
      return {
        ok: false,
        error:
          'La generación con IA no está configurada: falta o es inválida la ' +
          'clave de Anthropic. Avísale al administrador del sitio.',
      }
    }
    return {
      ok: false,
      error: 'La IA no pudo generar las preguntas. Inténtalo de nuevo.',
    }
  }
}
