'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  asignarRol,
  asignarColegio,
  designarAdminColegio,
} from '@/lib/actions/admin'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { UsuarioAdmin } from '@/lib/queries/admin'

const ETIQUETA_ROL: Record<string, string> = {
  global_admin: 'Admin global',
  school_admin: 'Admin colegio',
  teacher: 'Profesor',
}

// Clase para los <select> nativos (más robustos para acciones inmediatas y
// pruebas E2E que un combobox custom), alineados con el tema Esmeralda/grafito.
const SELECT_CLASS =
  'h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Fila de usuario en el panel de administración global: muestra rol y colegio
 * actuales y permite cambiar el rol, asignar/quitar colegio y designar al
 * usuario como administrador del colegio seleccionado. Cada control llama a su
 * server action (que re-verifica el rol global) y refresca. Los `aria-label`
 * incluyen el email para que cada control sea único (UI y pruebas).
 */
export function FilaUsuario({
  usuario,
  colegios,
}: {
  usuario: UsuarioAdmin
  colegios: { id: number; nombre: string }[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)
  // Colegio seleccionado en el <select> (controla también «Designar admin»).
  const [colegioSel, setColegioSel] = useState<string>(
    usuario.colegioId != null ? String(usuario.colegioId) : '',
  )

  async function ejecutar(accion: () => Promise<{ error: string } | { ok: true }>) {
    setError(null)
    setPendiente(true)
    try {
      const r = await accion()
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo aplicar el cambio.')
    } finally {
      setPendiente(false)
    }
  }

  function onCambiarRol(e: React.ChangeEvent<HTMLSelectElement>) {
    void ejecutar(() => asignarRol(usuario.id, e.target.value))
  }

  function onCambiarColegio(e: React.ChangeEvent<HTMLSelectElement>) {
    const valor = e.target.value
    setColegioSel(valor)
    const colegioId = valor === '' ? null : Number(valor)
    void ejecutar(() => asignarColegio(usuario.id, colegioId))
  }

  function onDesignarAdmin() {
    if (colegioSel === '') return
    void ejecutar(() => designarAdminColegio(usuario.id, Number(colegioSel)))
  }

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">
            👤 {usuario.nombre}
            <Badge variant="secondary" className="ml-2 align-middle">
              {ETIQUETA_ROL[usuario.role] ?? usuario.role}
            </Badge>
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {usuario.email}
            {usuario.colegioNombre ? ` · ${usuario.colegioNombre}` : ' · sin colegio'}
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <select
            aria-label={`Rol de ${usuario.email}`}
            value={usuario.role}
            onChange={onCambiarRol}
            disabled={pendiente}
            className={SELECT_CLASS}
          >
            <option value="teacher">Profesor</option>
            <option value="school_admin">Admin colegio</option>
            <option value="global_admin">Admin global</option>
          </select>

          <select
            aria-label={`Colegio de ${usuario.email}`}
            value={colegioSel}
            onChange={onCambiarColegio}
            disabled={pendiente}
            className={SELECT_CLASS}
          >
            <option value="">Sin colegio</option>
            {colegios.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.nombre}
              </option>
            ))}
          </select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDesignarAdmin}
            disabled={pendiente || colegioSel === ''}
            aria-label={`Designar administrador de ${usuario.email}`}
          >
            Designar admin
          </Button>
        </div>

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
