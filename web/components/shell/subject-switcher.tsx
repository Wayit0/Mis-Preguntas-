'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ASIGNATURAS, fijarCookieAsignatura } from './subjects'

const TODAS = '📚 Todas las asignaturas'

// Selector global de asignatura, en el menú lateral. Persiste la elección en una
// cookie de un año (la última seleccionada se mantiene entre navegaciones y
// recargas) y refresca los server components para que las listas y formularios
// tomen la nueva asignatura. El valor actual llega ya resuelto desde el servidor
// (`asignaturaActual`): cookie o, en su defecto, la asignatura más usada.
export function SubjectSwitcher({
  asignaturaActual,
}: {
  asignaturaActual: string
}) {
  const router = useRouter()
  // Estado optimista: refleja la elección al instante. Se resincroniza con el
  // valor del servidor ajustando el estado DURANTE el render (patrón recomendado
  // por React), no en un efecto, para evitar renders en cascada.
  const [sel, setSel] = useState(asignaturaActual)
  const [prev, setPrev] = useState(asignaturaActual)
  if (asignaturaActual !== prev) {
    setPrev(asignaturaActual)
    setSel(asignaturaActual)
  }

  const activa = ASIGNATURAS.find((a) => a.nombre === sel)

  function seleccionar(nombre: string | null) {
    setSel(nombre ?? '')
    fijarCookieAsignatura(nombre)
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Cambiar asignatura"
        className="inline-flex w-full items-center justify-between gap-1.5 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent aria-expanded:bg-sidebar-accent"
      >
        <span className="truncate">
          {activa ? `${activa.emoji} ${activa.nombre}` : TODAS}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
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
