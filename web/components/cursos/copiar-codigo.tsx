'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'

/**
 * Muestra el QR y el link de inscripción del curso con un botón para
 * copiarlo (mismo patrón que `components/colegio/copiar-codigo.tsx`). El
 * link ya incluye el código: escanear el QR o compartir el link equivale a
 * permitir que un alumno se inscriba.
 */
export function CopiarCodigo({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Si el navegador bloquea el portapapeles, el link sigue visible para
      // copiarlo a mano.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center rounded-md border border-border bg-card p-3 sm:justify-start">
        <QRCodeSVG value={texto} size={144} marginSize={2} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
          {texto}
        </code>
        <Button
          type="button"
          variant="outline"
          onClick={copiar}
          className="sm:w-auto"
        >
          {copiado ? '✅ Copiado' : '📋 Copiar link'}
        </Button>
      </div>
    </div>
  )
}
