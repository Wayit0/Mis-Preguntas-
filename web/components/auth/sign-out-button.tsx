'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

export function SignOutButton() {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)

  async function onClick() {
    setCargando(true)
    await authClient.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <Button variant="outline" onClick={onClick} disabled={cargando}>
      {cargando ? 'Cerrando…' : 'Cerrar sesión'}
    </Button>
  )
}
