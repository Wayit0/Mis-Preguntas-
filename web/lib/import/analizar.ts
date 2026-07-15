import {
  contarPaginasPdf,
  esTipoSoportado,
  extraerBloquesDocumento,
  MIME_PDF,
  type DocumentoExtraido,
  type ImagenExtraida,
} from '@/lib/docparse/extract'
import { detectarPreguntas, type UsoDeteccion } from '@/lib/ai/import'
import { calcularCostoMicroUsd } from '@/lib/ai/costos'
import { db } from '@/lib/db'
import { usosIa } from '@/lib/db/schema'
import { MAX_PAGINAS_PDF, type PreguntaDetectada } from '@/lib/validation/import'

// ---------------------------------------------------------------------------
// Núcleo del análisis de "Importar Documento con IA".
//
// Vive como módulo normal (no server action) porque lo consume el route
// handler de streaming `/api/importar`: el análisis con Opus puede superar los
// 230 s que el front-end de Azure App Service tolera por petición, así que la
// respuesta se emite en streaming con pings de keepalive — algo que una server
// action no puede hacer. No persiste nada: devuelve las preguntas para revisar.
// ---------------------------------------------------------------------------

/** Resultado del análisis de un documento. */
export type ResultadoAnalisis =
  | { ok: true; preguntas: PreguntaDetectada[]; imagenes: ImagenExtraida[] }
  | { ok: false; error: string; sinCupo?: boolean }

/**
 * Valida el archivo, lo convierte a content blocks y detecta las preguntas con
 * la IA. Todos los caminos de error devuelven `{ ok: false, error }` legible;
 * cada intento deja traza en los logs (un "inicio" sin su "fin" delata una
 * petición cortada por infraestructura).
 */
/**
 * Registra el uso de IA en `usos_ia` para el panel de costos del admin. Nunca
 * lanza: un fallo al registrar no debe romper el análisis que ya funcionó.
 */
async function registrarUsoIa(
  userId: number,
  accion: string,
  uso: UsoDeteccion,
  detalle: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(usosIa).values({
      userId,
      accion,
      modelo: uso.modelo,
      inputTokens: uso.inputTokens,
      outputTokens: uso.outputTokens,
      cacheCreationTokens: uso.cacheCreationTokens,
      cacheReadTokens: uso.cacheReadTokens,
      costoMicroUsd: calcularCostoMicroUsd(uso.modelo, uso),
      detalle,
    })
  } catch (err) {
    console.error('[importar] no se pudo registrar el uso de IA:', err)
  }
}

export async function analizarArchivo(
  archivo: File,
  asignatura: string,
  /** Usuario que originó el análisis (para el registro de costos). */
  userId: number,
): Promise<ResultadoAnalisis> {
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: 'Sube un documento (PDF, DOCX o imagen).' }
  }
  if (!asignatura) {
    return { ok: false, error: 'Selecciona una asignatura.' }
  }
  if (!esTipoSoportado(archivo.type)) {
    return {
      ok: false,
      error: 'Tipo de archivo no soportado. Usa PDF, Word (DOCX) o una imagen.',
    }
  }

  const inicio = Date.now()
  console.log(
    `[importar] inicio: archivo="${archivo.name}" tipo=${archivo.type} ` +
      `tamaño=${(archivo.size / 1024).toFixed(0)}KB asignatura=${asignatura}`,
  )

  // Límite de páginas para PDF: corta ANTES de llamar a la IA, con un mensaje
  // accionable. Si el PDF no se puede parsear (contarPaginasPdf → null), se
  // deja pasar: la extracción/IA darán su propio error si está dañado.
  if (archivo.type === MIME_PDF) {
    const paginas = await contarPaginasPdf(
      new Uint8Array(await archivo.arrayBuffer()),
    )
    console.log(`[importar] pdf: paginas=${paginas ?? 'ilegible'}`)
    if (paginas !== null && paginas > MAX_PAGINAS_PDF) {
      return {
        ok: false,
        error:
          `El PDF tiene ${paginas} páginas y el máximo es ${MAX_PAGINAS_PDF}. ` +
          'Divide el documento e impórtalo por partes.',
      }
    }
  }

  let documento: DocumentoExtraido
  try {
    documento = await extraerBloquesDocumento(archivo)
  } catch {
    return {
      ok: false,
      error: 'No pudimos leer el documento. Verifica que no esté dañado.',
    }
  }
  console.log(
    `[importar] extraído: bloques=${documento.bloques.length} ` +
      `imágenes=${documento.imagenes.length}`,
  )

  try {
    const { preguntas, uso } = await detectarPreguntas(documento.bloques, asignatura)
    const duracionSegundos = Number(((Date.now() - inicio) / 1000).toFixed(1))
    console.log(
      `[importar] fin OK: preguntas=${preguntas.length} en ${duracionSegundos}s`,
    )
    if (uso) {
      await registrarUsoIa(userId, 'importar_documento', uso, {
        archivo: archivo.name,
        tipo: archivo.type,
        tamanoKb: Math.round(archivo.size / 1024),
        asignatura,
        imagenes: documento.imagenes.length,
        preguntas: preguntas.length,
        duracionSegundos,
      })
    }
    return { ok: true, preguntas, imagenes: documento.imagenes }
  } catch (err) {
    // Log con detalle para poder diagnosticar en los logs del servidor (Azure App
    // Service / Application Insights) qué falló realmente: el mensaje que ve el
    // profesor es genérico a propósito, pero acá sí queremos el detalle.
    console.error('[importar] detectarPreguntas falló:', err)

    // Distingue un problema de configuración (clave de Anthropic ausente o
    // inválida) de un fallo transitorio, para dar un mensaje accionable en vez
    // de pedir "inténtalo de nuevo" sobre algo que nunca va a funcionar.
    // - Clave INVÁLIDA → la API responde 401/403 (`err.status`).
    // - Clave AUSENTE → el SDK lanza ANTES de llamar a la API (sin `.status`),
    //   con un mensaje que menciona la API key.
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
          'La importación con IA no está configurada: falta o es inválida la ' +
          'clave de Anthropic. Avísale al administrador del sitio.',
      }
    }
    return {
      ok: false,
      error: 'La IA no pudo procesar el documento. Inténtalo de nuevo.',
    }
  }
}
