'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ASIGNATURAS } from './subjects'

const TODAS = '📚 Todas las asignaturas'

// Selector global de asignatura. Al elegir una, actualiza el searchParam
// `?asignatura=` conservando la ruta actual (y el resto de params).
export function SubjectSwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const actual = searchParams.get('asignatura')
  const activa = ASIGNATURAS.find((a) => a.nombre === actual)

  function seleccionar(nombre: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (nombre) {
      params.set('asignatura', nombre)
    } else {
      params.delete('asignatura')
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Cambiar asignatura"
        className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted aria-expanded:bg-muted"
      >
        <span className="truncate">
          {activa ? `${activa.emoji} ${activa.nombre}` : TODAS}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
          Asignatura
        </div>
        <DropdownMenuItem onClick={() => seleccionar(null)}>
          {TODAS}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {ASIGNATURAS.map((a) => (
          <DropdownMenuItem key={a.nombre} onClick={() => seleccionar(a.nombre)}>
            <span aria-hidden>{a.emoji}</span>
            <span>{a.nombre}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
