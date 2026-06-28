'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { configurarColegio, regenerarCodigo } from '@/lib/actions/colegio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { CopiarCodigo } from './copiar-codigo'

/* eslint-disable @next/next/no-img-element */

/**
 * Configuración del colegio: nombre, logo y regeneración del código de unión.
 * Las server actions imponen el guard (solo school_admin del colegio). El logo
 * se sube como archivo; si no se elige uno nuevo, se conserva el actual.
 */
export function ConfigurarColegio({
  nombreInicial,
  logoInicial,
  codigoInicial,
}: {
  nombreInicial: string
  logoInicial: string | null
  codigoInicial: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [codigo, setCodigo] = useState(codigoInicial)
  const [regenerando, setRegenerando] = useState(false)

  const logoSrc =
    logoPreview ?? (logoInicial ? `/api/uploads/${logoInicial}` : null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setExito(null)
    setPendiente(true)
    try {
      const formData = new FormData(e.currentTarget)
      const r = await configurarColegio(formData)
      if ('error' in r) {
        setError(r.error)
        return
      }
      setExito('✅ Configuración guardada.')
      router.refresh()
    } catch {
      setError('No se pudo guardar la configuración.')
    } finally {
      setPendiente(false)
    }
  }

  async function onRegenerar() {
    setError(null)
    setExito(null)
    setRegenerando(true)
    try {
      const r = await regenerarCodigo()
      if ('error' in r) {
        setError(r.error)
        return
      }
      setCodigo(r.codigo)
      setExito('✅ Código regenerado. El anterior ya no funciona.')
      router.refresh()
    } catch {
      setError('No se pudo regenerar el código.')
    } finally {
      setRegenerando(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nombre-colegio">Nombre del colegio</Label>
              <Input
                id="nombre-colegio"
                name="nombre"
                defaultValue={nombreInicial}
                placeholder="Ej: Colegio San Ignacio"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="logo-colegio">
                Logo del colegio (opcional, aparece en el PDF)
              </Label>
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt="Logo del colegio"
                  className="max-h-24 w-fit rounded-md border border-border object-contain"
                />
              ) : null}
              <input
                id="logo-colegio"
                name="logo"
                type="file"
                accept="image/png,image/jpeg"
                className="max-w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-2.5 file:py-1 file:text-sm file:font-medium file:text-secondary-foreground"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  setLogoPreview(f ? URL.createObjectURL(f) : null)
                }}
              />
            </div>

            <Button type="submit" disabled={pendiente} className="w-full sm:w-auto">
              {pendiente ? 'Guardando…' : 'Guardar configuración'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-base font-semibold text-foreground">
              Código de unión
            </h2>
            <p className="text-sm text-muted-foreground">
              Compártelo solo con tus profesores: cualquiera con este código se
              unirá al colegio. Si se filtra, regenéralo.
            </p>
          </div>
          <CopiarCodigo codigo={codigo} />
          <Button
            type="button"
            variant="outline"
            onClick={onRegenerar}
            disabled={regenerando}
            className="w-full sm:w-auto"
          >
            {regenerando ? 'Regenerando…' : '🔄 Regenerar código'}
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {exito ? (
        <p role="status" className="text-sm text-primary">
          {exito}
        </p>
      ) : null}
    </div>
  )
}
