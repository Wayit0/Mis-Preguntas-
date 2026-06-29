'use client'

import { useRef } from 'react'
import 'katex/dist/katex.min.css'
import { LatexText } from '@/components/preguntas/latex-text'

const GRUPOS = [
  {
    titulo: 'Estructura',
    simbolos: [
      { label: 'a/b',  latex: '\\frac{a}{b}',  title: 'Fracción' },
      { label: '√',    latex: '\\sqrt{x}',      title: 'Raíz cuadrada' },
      { label: 'ⁿ√',  latex: '\\sqrt[n]{x}',   title: 'Raíz n-ésima' },
      { label: 'xⁿ',  latex: '^{n}',            title: 'Potencia' },
      { label: 'xₙ',  latex: '_{n}',            title: 'Subíndice' },
    ],
  },
  {
    titulo: 'Operadores',
    simbolos: [
      { label: '±',   latex: '\\pm ',     title: 'Más/menos' },
      { label: '·',   latex: '\\cdot ',   title: 'Producto punto' },
      { label: '×',   latex: '\\times ',  title: 'Por' },
      { label: '÷',   latex: '\\div ',    title: 'Dividido' },
      { label: '≤',   latex: '\\leq ',    title: 'Menor o igual' },
      { label: '≥',   latex: '\\geq ',    title: 'Mayor o igual' },
      { label: '≠',   latex: '\\neq ',    title: 'Distinto' },
      { label: '≈',   latex: '\\approx ', title: 'Aproximado' },
    ],
  },
  {
    titulo: 'Griegas',
    simbolos: [
      { label: 'α', latex: '\\alpha ',  title: 'alfa' },
      { label: 'β', latex: '\\beta ',   title: 'beta' },
      { label: 'γ', latex: '\\gamma ',  title: 'gamma' },
      { label: 'δ', latex: '\\delta ',  title: 'delta' },
      { label: 'θ', latex: '\\theta ',  title: 'theta' },
      { label: 'λ', latex: '\\lambda ', title: 'lambda' },
      { label: 'μ', latex: '\\mu ',     title: 'mu' },
      { label: 'π', latex: '\\pi ',     title: 'pi' },
      { label: 'σ', latex: '\\sigma ',  title: 'sigma' },
      { label: 'ω', latex: '\\omega ',  title: 'omega' },
      { label: 'Δ', latex: '\\Delta ',  title: 'Delta' },
      { label: 'Σ', latex: '\\Sigma ',  title: 'Sigma' },
    ],
  },
  {
    titulo: 'Física',
    simbolos: [
      { label: 'vec', latex: '\\vec{v}',     title: 'Vector (\\vec{v})' },
      { label: 'hat', latex: '\\hat{a}',     title: 'Unitario (\\hat{a})' },
      { label: '°',   latex: '^{\\circ}',    title: 'Grados' },
      { label: '∞',   latex: '\\infty ',     title: 'Infinito' },
    ],
  },
]

interface EditorEcuacionProps {
  value: string
  onChange: (val: string) => void
  onEnter?: () => void
}

export function EditorEcuacion({ value, onChange, onEnter }: EditorEcuacionProps) {
  const ref = useRef<HTMLInputElement>(null)

  function insertar(latex: string) {
    const el = ref.current
    if (!el) { onChange(value + latex); return }

    const inicio = el.selectionStart ?? value.length
    const fin    = el.selectionEnd   ?? value.length
    const nuevo  = value.slice(0, inicio) + latex + value.slice(fin)
    onChange(nuevo)

    // Dejar cursor dentro del primer {} si el snippet lo tiene
    const posLlave = latex.indexOf('{')
    const pos = posLlave !== -1
      ? inicio + posLlave + 1
      : inicio + latex.length

    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      {/* Toolbar de símbolos */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 overflow-x-auto pb-0.5">
        {GRUPOS.map((grupo) => (
          <div key={grupo.titulo} className="flex flex-col gap-1 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {grupo.titulo}
            </span>
            <div className="flex flex-wrap gap-1">
              {grupo.simbolos.map((s) => (
                <button
                  key={s.latex}
                  type="button"
                  title={s.title}
                  onClick={() => insertar(s.latex)}
                  className="flex h-7 min-w-[1.75rem] items-center justify-center rounded border border-border bg-background px-1.5 font-mono text-[13px] text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Input LaTeX */}
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onEnter?.() }
        }}
        placeholder="Escribe en LaTeX, ej: v^2 = v_0^2 + 2a\Delta x"
        className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />

      {/* Preview en tiempo real */}
      {value.trim() && (
        <div className="min-h-8 rounded-md bg-muted/40 px-3 py-2 text-sm">
          <LatexText text={`$${value}$`} className="text-base" />
        </div>
      )}
    </div>
  )
}
