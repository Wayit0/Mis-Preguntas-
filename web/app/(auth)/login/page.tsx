import { AuthCard } from '@/components/auth/auth-card'
import { proveedoresSocialesHabilitados } from '@/lib/auth-social'

// Dinámico: los proveedores sociales dependen de variables de entorno de runtime
// (credenciales OAuth inyectadas por Key Vault en prod). Si la página se
// prerenderizara en build, los botones quedarían fijos según el entorno de
// build (sin credenciales) y nunca aparecerían.
export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <AuthCard modoInicial="login" proveedores={proveedoresSocialesHabilitados()} />
  )
}
