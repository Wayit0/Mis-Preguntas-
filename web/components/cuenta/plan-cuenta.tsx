'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { iniciarSuscripcion, cancelarMiSuscripcion } from '@/lib/actions/suscripciones'

export interface DatosPlan {
  plan: 'free' | 'pro'
  origen: 'suscripcion' | 'cortesia' | 'colegio' | 'lanzamiento' | null
  estado: string | null
  periodicidad: string | null
  periodoHasta: string | null
  trialTerminaEl: string | null
  cuota: { limite: number; usadas: number; restantes: number }
  pagosHabilitados: boolean
}

const fecha = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
    : null

export function PlanCuenta({ datos }: { datos: DatosPlan }) {
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const suscribir = (periodicidad: 'mensual' | 'anual') =>
    startTransition(async () => {
      setError(null)
      const r = await iniciarSuscripcion(periodicidad)
      if ('error' in r) setError(r.error)
      else window.location.href = r.initPoint
    })

  const cancelar = () =>
    startTransition(async () => {
      if (!window.confirm('¿Cancelar tu suscripción? Conservas Pro hasta el fin del período ya pagado.')) return
      setError(null)
      const r = await cancelarMiSuscripcion()
      if ('error' in r) setError(r.error)
      else router.refresh()
    })

  const esProPropio = datos.plan === 'pro' && datos.origen === 'suscripcion'
  // Mientras dure el lanzamiento nadie paga: no se ofrece checkout.
  const enLanzamiento = datos.origen === 'lanzamiento'

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Tu plan</h2>
          <Badge variant={datos.plan === 'pro' ? 'default' : 'secondary'}>
            {datos.plan === 'pro' ? 'EduBox Pro' : 'Gratis'}
          </Badge>
        </div>

        {enLanzamiento && (
          <p className="rounded-lg bg-primary/10 p-3 text-sm">
            EduBox está en versión de lanzamiento: tienes todas las funciones
            Pro liberadas, gratis y sin tarjeta. Te avisaremos por correo con
            anticipación antes de que empiece a cobrarse.
          </p>
        )}
        {datos.origen === 'colegio' && (
          <p className="text-sm text-muted-foreground">
            Tienes Pro por la licencia de tu colegio.
          </p>
        )}
        {datos.origen === 'cortesia' && (
          <p className="text-sm text-muted-foreground">
            Tienes Pro de cortesía hasta el {fecha(datos.periodoHasta)}.
          </p>
        )}
        {datos.estado === 'trial' && (
          <p className="text-sm text-muted-foreground">
            Estás en tu prueba gratis: el primer cobro será el {fecha(datos.trialTerminaEl)}.
          </p>
        )}
        {datos.estado === 'morosa' && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            Tu último pago falló. Actualiza tu medio de pago en MercadoPago o tu
            plan volverá a Gratis en unos días. No perderás nada de tu contenido.
          </p>
        )}
        {datos.estado === 'cancelada' && datos.plan === 'pro' && (
          <p className="text-sm text-muted-foreground">
            Suscripción cancelada: conservas Pro hasta el {fecha(datos.periodoHasta)}.
            Si te suscribes de nuevo, el nuevo plan reemplaza al actual de
            inmediato (sin nueva prueba gratis).
          </p>
        )}

        <p className="text-sm text-muted-foreground">
          Importaciones con IA este mes: {datos.cuota.usadas} de {datos.cuota.limite}.
        </p>

        {!enLanzamiento && (datos.plan === 'free' || datos.estado === 'cancelada') && (
          <div className="flex flex-col gap-2">
            <Button onClick={() => suscribir('mensual')} disabled={pendiente || !datos.pagosHabilitados}>
              Pro mensual — $3.490/mes
            </Button>
            <Button variant="outline" onClick={() => suscribir('anual')} disabled={pendiente || !datos.pagosHabilitados}>
              Pro anual — $35.880/año (equivale a $2.990/mes)
            </Button>
            {!datos.pagosHabilitados && (
              <p className="text-xs text-muted-foreground">Los pagos estarán disponibles muy pronto.</p>
            )}
            <Link href="/precios" className="text-sm text-primary underline-offset-4 hover:underline">
              Ver qué incluye cada plan
            </Link>
          </div>
        )}

        {esProPropio && datos.estado !== 'cancelada' && (
          <div className="flex flex-col gap-1">
            <Button variant="outline" onClick={cancelar} disabled={pendiente}>
              Cancelar suscripción
            </Button>
            <p className="text-xs text-muted-foreground">
              ¿Quieres cambiar entre mensual y anual? Cancela y vuelve a
              suscribirte de inmediato con la otra periodicidad: el nuevo plan
              reemplaza al actual al instante (sin trial).
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
