/**
 * Registro de accesos (login). Inserta una fila en `accesos` por cada intento de
 * inicio de sesión, exitoso o fallido. Se invoca desde el after-hook de
 * better-auth (`lib/auth.ts`).
 *
 * Como el registro es SECUNDARIO al login, nunca debe tumbar el flujo: captura
 * cualquier error y sólo lo loguea (mismo patrón que `registrarUsoIa` en
 * `lib/import/analizar.ts`).
 */
import { db } from '@/lib/db'
import { accesos } from '@/lib/db/schema'

export type MetodoAcceso = 'password' | 'google' | 'microsoft'

export interface DatosAcceso {
  userId?: number | null
  email: string
  metodo: MetodoAcceso
  exito: boolean
  motivo?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

export async function registrarAcceso(datos: DatosAcceso): Promise<void> {
  try {
    await db.insert(accesos).values({
      userId: datos.userId ?? null,
      email: datos.email,
      metodo: datos.metodo,
      exito: datos.exito,
      motivo: datos.motivo ?? null,
      ipAddress: datos.ipAddress ?? null,
      userAgent: datos.userAgent ?? null,
    })
  } catch (err) {
    console.error('[accesos] no se pudo registrar el acceso:', err)
  }
}

/**
 * Extrae la primera IP de un header `x-forwarded-for` (formato "ip1, ip2, ...";
 * la primera es la del cliente real detrás del proxy de Azure). Devuelve null si
 * no hay valor.
 */
export function ipDeForwardedFor(valor: string | null | undefined): string | null {
  if (!valor) return null
  const primera = valor.split(',')[0]?.trim()
  return primera || null
}
