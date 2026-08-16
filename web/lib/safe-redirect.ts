/**
 * Sanitiza un `next` de query param antes de usarlo como destino de
 * redirección post-login/registro: solo rutas internas. Rechaza URLs
 * absolutas y protocol-relative (`//evil.com`) para evitar un open redirect.
 */
export function rutaSegura(next: string | null | undefined): string | null {
  if (!next) return null
  if (!next.startsWith('/') || next.startsWith('//')) return null
  return next
}
