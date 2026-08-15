'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

/** Botón "Cerrar sesión" del shell de estudiante (mismo patrón que SignOutButton). */
export function CerrarSesion() {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)

  async function onClick() {
    setCargando(true)
    await signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <Button variant="outline" onClick={onClick} disabled={cargando}>
      {cargando ? 'Cerrando…' : 'Cerrar sesión'}
    </Button>
  )
}
