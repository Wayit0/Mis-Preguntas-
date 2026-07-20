'use client'

import { useState, type ReactNode } from 'react'
import { authClient } from '@/lib/auth-client'
import { mensajeErrorAuth } from '@/lib/auth-errors'
import { Button } from '@/components/ui/button'
import type { ProveedorSocial } from '@/lib/auth-social'

function IconoGoogle() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

function IconoMicrosoft() {
  return (
    <svg viewBox="0 0 21 21" width="16" height="16" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}

const META: Record<ProveedorSocial, { etiqueta: string; icono: ReactNode }> = {
  google: { etiqueta: 'Continuar con Google', icono: <IconoGoogle /> },
  microsoft: { etiqueta: 'Continuar con Microsoft', icono: <IconoMicrosoft /> },
}

/**
 * Botones de login social. Sólo muestra los proveedores habilitados (los que
 * tienen credenciales en el entorno; ver `proveedoresSocialesHabilitados`). Al
 * hacer clic, better-auth redirige el navegador al proveedor; en `callbackURL`
 * vuelve a /dashboard. Un error (p. ej. proveedor mal configurado) se reporta
 * vía `onError` para mostrarlo en el formulario padre.
 */
export function BotonesSociales({
  proveedores,
  onError,
  deshabilitado,
}: {
  proveedores: ProveedorSocial[]
  onError?: (mensaje: string) => void
  deshabilitado?: boolean
}) {
  const [cargando, setCargando] = useState<ProveedorSocial | null>(null)

  if (proveedores.length === 0) return null

  async function ingresar(p: ProveedorSocial) {
    onError?.('')
    setCargando(p)
    const { error } = await authClient.signIn.social({
      provider: p,
      callbackURL: '/dashboard',
      // Si el proveedor o el enlace fallan, better-auth redirige el navegador a
      // esta URL con ?error=<código>. Sin esto aterrizaba en la portada, que no
      // lee ese parámetro: el usuario veía la home sin explicación alguna.
      errorCallbackURL: '/login',
    })
    // En éxito el navegador ya se redirige al proveedor; sólo manejamos el error.
    if (error) {
      onError?.(mensajeErrorAuth(error.code))
      setCargando(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {proveedores.map((p) => (
        <Button
          key={p}
          type="button"
          variant="outline"
          className="w-full gap-2"
          disabled={deshabilitado || cargando !== null}
          onClick={() => ingresar(p)}
        >
          {META[p].icono}
          {cargando === p ? 'Redirigiendo…' : META[p].etiqueta}
        </Button>
      ))}

      <div className="relative my-1 flex items-center">
        <span className="h-px flex-1 bg-border" />
        <span className="px-2 text-xs text-muted-foreground">o</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  )
}
