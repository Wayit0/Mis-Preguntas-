'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, KeyRound, LogOut, Menu } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SubjectSwitcher } from './subject-switcher'
import { useMobileNav } from './mobile-nav'

interface TopbarProps {
  user: { name: string; email: string }
}

export function Topbar({ user }: TopbarProps) {
  const router = useRouter()
  const { abrir } = useMobileNav()
  const [cerrando, setCerrando] = useState(false)

  async function cerrarSesion() {
    setCerrando(true)
    await authClient.signOut()
    router.push('/login')
    router.refresh()
  }

  const inicial = user.name.trim().charAt(0).toUpperCase() || 'U'

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={abrir}
          aria-label="Abrir menú"
          className="rounded-md p-1.5 text-foreground hover:bg-muted md:hidden"
        >
          <Menu className="size-5" />
        </button>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-bold text-primary"
        >
          <span aria-hidden className="text-lg leading-none">
            📚
          </span>
          <span className="hidden sm:inline">EduBox</span>
        </Link>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <SubjectSwitcher />

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Abrir menú de perfil"
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted aria-expanded:bg-muted"
          >
            <Avatar size="sm">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {inicial}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-[10rem] truncate text-sm font-medium text-foreground sm:inline">
              {user.name}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="flex flex-col px-1.5 py-1.5">
              <span className="text-sm font-medium text-foreground">
                {user.name}
              </span>
              {user.email && (
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/cuenta" />}>
              <KeyRound />
              Cambiar contraseña
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={cerrando}
              closeOnClick={false}
              onClick={cerrarSesion}
            >
              <LogOut />
              {cerrando ? 'Cerrando…' : 'Cerrar sesión'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
