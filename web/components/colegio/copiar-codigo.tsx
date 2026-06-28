'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Muestra el código de unión del colegio con un botón para copiarlo. El código
 * es secreto y largo: compartirlo equivale a permitir el ingreso, por eso se
 * presenta de forma destacada pero con la advertencia de mantenerlo privado.
 */
export function CopiarCodigo({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Si el navegador bloquea el portapapeles, el código sigue visible para
      // copiarlo a mano.
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
        {codigo}
      </code>
      <Button
        type="button"
        variant="outline"
        onClick={copiar}
        className="sm:w-auto"
      >
        {copiado ? '✅ Copiado' : '📋 Copiar código'}
      </Button>
    </div>
  )
}
