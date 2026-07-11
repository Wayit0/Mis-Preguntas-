'use client'

import { useState } from 'react'
import { Sigma } from 'lucide-react'
import { EditorEcuacion } from '@/components/prueba/editor-ecuacion'
import { Button } from '@/components/ui/button'

/**
 * Botón "Ecuación" que despliega el editor visual de ecuaciones (mathlive) y,
 * al confirmar, entrega la expresión lista para insertar en el campo de texto
 * como `$...$`. Reutiliza el mismo `EditorEcuacion` del formulario de fórmulas
 * de la prueba, así el profesor no tiene que escribir LaTeX a mano.
 */
export function InsertarEcuacion({
  onInsert,
  etiqueta = 'Ecuación',
}: {
  /** Recibe la expresión ya delimitada, p. ej. `$\frac{1}{2}$`. */
  onInsert: (latexDelimitado: string) => void
  etiqueta?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [latex, setLatex] = useState('')

  function insertar() {
    const expr = latex.trim()
    if (expr) onInsert(`$${expr}$`)
    setLatex('')
    setAbierto(false)
  }

  if (!abierto) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit gap-1.5"
        onClick={() => setAbierto(true)}
      >
        <Sigma className="size-3.5" aria-hidden />
        {etiqueta}
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <EditorEcuacion value={latex} onChange={setLatex} onEnter={insertar} />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={insertar} disabled={!latex.trim()}>
          Insertar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setLatex('')
            setAbierto(false)
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
