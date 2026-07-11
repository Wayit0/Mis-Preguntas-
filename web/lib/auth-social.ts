/**
 * Proveedores de login social habilitados. Módulo liviano (sin dependencias de
 * DB ni de la config de better-auth) para que lo importen las páginas de auth y
 * la UI sin arrastrar el servidor. Un proveedor está habilitado sólo si su par
 * de credenciales (id + secret) está presente en el entorno — la misma condición
 * con que `lib/auth.ts` arma `socialProviders`.
 */
export type ProveedorSocial = 'google' | 'microsoft'

export function proveedoresSocialesHabilitados(): ProveedorSocial[] {
  const habilitados: ProveedorSocial[] = []
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    habilitados.push('google')
  }
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    habilitados.push('microsoft')
  }
  return habilitados
}
