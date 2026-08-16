'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'

async function copiarAlPortapapeles(
  texto: string,
  avisar: (v: boolean) => void,
) {
  try {
    await navigator.clipboard.writeText(texto)
    avisar(true)
    setTimeout(() => avisar(false), 2000)
  } catch {
    // Si el navegador bloquea el portapapeles, el valor sigue visible para
    // copiarlo a mano.
  }
}

/**
 * Muestra el QR, el código de inscripción "pelado" (el que hay que tipear en
 * «Unirme a un curso» dentro del portal del estudiante, a diferencia del
 * link/QR que va directo a /unirse/CODIGO) y el link completo — cada uno con
 * su botón de copiar.
 */
export function CopiarCodigo({ codigo, texto }: { codigo: string; texto: string }) {
  const [copiadoCodigo, setCopiadoCodigo] = useState(false)
  const [copiadoLink, setCopiadoLink] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center rounded-md border border-border bg-card p-3 sm:justify-start">
        <QRCodeSVG value={texto} size={144} marginSize={2} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Código (para tipear en «Unirme a un curso»)
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
            {codigo}
          </code>
          <Button
            type="button"
            variant="outline"
            onClick={() => copiarAlPortapapeles(codigo, setCopiadoCodigo)}
            className="sm:w-auto"
          >
            {copiadoCodigo ? '✅ Copiado' : '📋 Copiar código'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Link directo
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
            {texto}
          </code>
          <Button
            type="button"
            variant="outline"
            onClick={() => copiarAlPortapapeles(texto, setCopiadoLink)}
            className="sm:w-auto"
          >
            {copiadoLink ? '✅ Copiado' : '📋 Copiar link'}
          </Button>
        </div>
      </div>
    </div>
  )
}
