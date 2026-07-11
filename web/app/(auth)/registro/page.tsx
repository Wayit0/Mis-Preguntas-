import { AuthCard } from '@/components/auth/auth-card'
import { proveedoresSocialesHabilitados } from '@/lib/auth-social'

// Dinámico: ver nota en login/page.tsx (los botones sociales dependen de env de
// runtime, no de build).
export const dynamic = 'force-dynamic'

export default function RegistroPage() {
  return (
    <AuthCard
      modoInicial="registro"
      proveedores={proveedoresSocialesHabilitados()}
    />
  )
}
