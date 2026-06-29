'use client'

import { useEffect, useRef, useState } from 'react'

// Declara el elemento personalizado para TypeScript/JSX
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}

const GRUPOS = [
  {
    titulo: 'Estructura',
    simbolos: [
      { label: 'a/b', latex: '\\frac{#0}{#1}', title: 'Fracción' },
      { label: '√',   latex: '\\sqrt{#0}',      title: 'Raíz cuadrada' },
      { label: 'ⁿ√', latex: '\\sqrt[#0]{#1}',  title: 'Raíz n-ésima' },
      { label: 'xⁿ', latex: '^{#0}',            title: 'Potencia' },
      { label: 'xₙ', latex: '_{#0}',            title: 'Subíndice' },
    ],
  },
  {
    titulo: 'Operadores',
    simbolos: [
      { label: '±',  latex: '\\pm',     title: 'Más/menos' },
      { label: '·',  latex: '\\cdot',   title: 'Producto punto' },
      { label: '×',  latex: '\\times',  title: 'Por' },
      { label: '÷',  latex: '\\div',    title: 'Dividido' },
      { label: '≤',  latex: '\\leq',    title: 'Menor o igual' },
      { label: '≥',  latex: '\\geq',    title: 'Mayor o igual' },
      { label: '≠',  latex: '\\neq',    title: 'Distinto' },
      { label: '≈',  latex: '\\approx', title: 'Aproximado' },
    ],
  },
  {
    titulo: 'Griegas',
    simbolos: [
      { label: 'α', latex: '\\alpha',  title: 'alfa' },
      { label: 'β', latex: '\\beta',   title: 'beta' },
      { label: 'γ', latex: '\\gamma',  title: 'gamma' },
      { label: 'δ', latex: '\\delta',  title: 'delta' },
      { label: 'θ', latex: '\\theta',  title: 'theta' },
      { label: 'λ', latex: '\\lambda', title: 'lambda' },
      { label: 'μ', latex: '\\mu',     title: 'mu' },
      { label: 'π', latex: '\\pi',     title: 'pi' },
      { label: 'σ', latex: '\\sigma',  title: 'sigma' },
      { label: 'ω', latex: '\\omega',  title: 'omega' },
      { label: 'Δ', latex: '\\Delta',  title: 'Delta' },
      { label: 'Σ', latex: '\\Sigma',  title: 'Sigma' },
    ],
  },
  {
    titulo: 'Física',
    simbolos: [
      { label: 'vec', latex: '\\vec{#0}',   title: 'Vector' },
      { label: 'hat', latex: '\\hat{#0}',   title: 'Unitario' },
      { label: '°',   latex: '^{\\circ}',   title: 'Grados' },
      { label: '∞',   latex: '\\infty',     title: 'Infinito' },
    ],
  },
]

interface EditorEcuacionProps {
  value: string
  onChange: (val: string) => void
}

type MathFieldEl = HTMLElement & {
  value: string
  insert: (latex: string, opts?: Record<string, unknown>) => void
}

export function EditorEcuacion({ value, onChange }: EditorEcuacionProps) {
  const ref = useRef<MathFieldEl>(null)
  const [listo, setListo] = useState(false)

  // Carga mathlive desde CDN y espera a que el custom element quede definido
  useEffect(() => {
    const script = document.createElement('script')
    script.type = 'module'
    script.textContent = `import 'https://esm.sh/mathlive'`
    document.head.appendChild(script)

    customElements.whenDefined('math-field').then(() => {
      setListo(true)
      const el = ref.current
      if (!el) return
      const onInput = () => onChange(el.value ?? '')
      el.addEventListener('input', onInput)
    })

    return () => script.remove()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reconecta el listener si onChange cambia después de que el editor ya cargó
  useEffect(() => {
    if (!listo) return
    const el = ref.current
    if (!el) return
    const onInput = () => onChange(el.value ?? '')
    el.addEventListener('input', onInput)
    return () => el.removeEventListener('input', onInput)
  }, [onChange, listo])

  // Limpia el campo cuando el padre resetea value a ''
  useEffect(() => {
    const el = ref.current
    if (el && value === '' && el.value !== '') el.value = ''
  }, [value])

  function insertar(latex: string) {
    const el = ref.current
    if (!el?.insert) return
    el.insert(latex, { selectionMode: 'placeholder' })
    onChange(el.value ?? '')
    el.focus()
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

      {/* Editor visual WYSIWYG — visible siempre; se activa cuando mathlive carga */}
      {!listo && (
        <div className="flex h-11 items-center rounded-md border border-dashed border-border bg-background px-3 text-sm text-muted-foreground">
          Cargando editor visual…
        </div>
      )}
      <math-field
        ref={ref as React.RefObject<HTMLElement>}
        // @ts-expect-error – atributo del custom element
        virtual-keyboard-mode="onfocus"
        style={{
          display: listo ? 'block' : 'none',
          width: '100%',
          minHeight: '2.75rem',
          padding: '0.375rem 0.75rem',
          border: '1px solid hsl(var(--border))',
          borderRadius: 'var(--radius)',
          background: 'hsl(var(--background))',
          fontSize: '1.1rem',
          lineHeight: '1.5',
        }}
      />
    </div>
  )
}
