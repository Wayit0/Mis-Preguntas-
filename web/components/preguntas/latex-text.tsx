'use client'

import { Fragment } from 'react'
import 'katex/dist/katex.min.css'
import katex from 'katex'

// Renderiza texto que puede incluir fórmulas LaTeX delimitadas por `$...$`
// (en línea) o `$$...$$` (en bloque). El texto plano se muestra tal cual; las
// fórmulas se renderizan con KaTeX. `throwOnError: false` evita romper la UI si
// el usuario escribe LaTeX inválido (KaTeX muestra el error en rojo).

const SEGMENTO = /(\$\$[^$]+\$\$|\$[^$]+\$)/g

function renderMath(expr: string, display: boolean): string {
  return katex.renderToString(expr, {
    displayMode: display,
    throwOnError: false,
  })
}

export function LatexText({
  text,
  className,
}: {
  text: string | null | undefined
  className?: string
}) {
  if (!text) return null

  const partes = text.split(SEGMENTO)

  return (
    <span className={className}>
      {partes.map((parte, i) => {
        if (parte.startsWith('$$') && parte.endsWith('$$')) {
          const html = renderMath(parte.slice(2, -2), true)
          return (
            <span
              key={i}
              // KaTeX produce HTML confiable a partir de la expresión del usuario.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )
        }
        if (parte.startsWith('$') && parte.endsWith('$') && parte.length > 2) {
          const html = renderMath(parte.slice(1, -1), false)
          return (
            <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
          )
        }
        return <Fragment key={i}>{parte}</Fragment>
      })}
    </span>
  )
}
