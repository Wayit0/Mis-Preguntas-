import { AuthCard } from '@/components/auth/auth-card'
import { proveedoresSocialesHabilitados } from '@/lib/auth-social'
import { mensajeErrorAuth } from '@/lib/auth-errors'

// Dinámico: los proveedores sociales dependen de variables de entorno de runtime
// (credenciales OAuth inyectadas por Key Vault en prod). Si la página se
// prerenderizara en build, los botones quedarían fijos según el entorno de
// build (sin credenciales) y nunca aparecerían.
export const dynamic = 'force-dynamic'

// El login social vuelve aquí con ?error=<código> cuando algo falla (lo fija
// `errorCallbackURL` en los botones sociales). En Next 16 `searchParams` es una
// Promise, hay que esperarla.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <AuthCard
      modoInicial="login"
      proveedores={proveedoresSocialesHabilitados()}
      errorInicial={error ? mensajeErrorAuth(error) : null}
    />
  )
}
