import { z } from 'zod'

// ---------------------------------------------------------------------------
// Validación de una prueba guardada ("Mis Pruebas"). Sólo valida el encabezado:
// la asignatura es obligatoria y el resto de campos de texto son opcionales. La
// selección de preguntas/textos y las fórmulas se extraen aparte en la action
// (campos repetidos del FormData), igual que hace el generador de PDF.
// ---------------------------------------------------------------------------

/** Formatos de PDF disponibles para una prueba. */
export const FORMATOS_PRUEBA = ['estandar', 'ib'] as const
export type FormatoPrueba = (typeof FORMATOS_PRUEBA)[number]

/** Etiquetas legibles para cada formato. */
export const ETIQUETA_FORMATO: Record<FormatoPrueba, string> = {
  estandar: 'Estándar',
  ib: 'IB (Bachillerato Internacional)',
}

export const pruebaSchema = z.object({
  asignatura: z.string().trim().min(1, 'La asignatura es obligatoria'),
  titulo: z.string().trim().default(''),
  colegio: z.string().trim().default(''),
  profesor: z.string().trim().default(''),
  instrucciones: z.string().trim().default(''),
  // Un valor desconocido (formularios antiguos sin el campo) cae a 'estandar'.
  formato: z.enum(FORMATOS_PRUEBA).catch('estandar').default('estandar'),
})

/** Input ya validado del encabezado de una prueba. */
export type PruebaInput = z.infer<typeof pruebaSchema>

/** Extrae los campos de encabezado del FormData para validarlos con Zod. */
export function extraerCamposPrueba(formData: FormData): Record<string, unknown> {
  const t = (k: string) => (formData.get(k) ?? '').toString()
  return {
    asignatura: t('asignatura'),
    titulo: t('titulo'),
    colegio: t('colegio'),
    profesor: t('profesor'),
    instrucciones: t('instrucciones'),
    formato: t('formato') || 'estandar',
  }
}

/** Devuelve el primer mensaje de error de un `safeParse` fallido. */
export function primerErrorPrueba(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Datos de la prueba no válidos'
}
