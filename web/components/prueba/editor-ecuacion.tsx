'use client'

import { useEffect, useRef, useState } from 'react'

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
      { label: 'vec', latex: '\\vec{#0}', title: 'Vector' },
      { label: 'hat', latex: '\\hat{#0}', title: 'Unitario' },
      { label: '°',   latex: '^{\\circ}', title: 'Grados' },
      { label: '∞',   latex: '\\infty',   title: 'Infinito' },
    ],
  },
]

type MathFieldEl = HTMLElement & {
  value: string
  insert: (latex: string, opts?: Record<string, unknown>) => void
}

interface EditorEcuacionProps {
  value: string
  onChange: (val: string) => void
  onEnter?: () => void
}

export function EditorEcuacion({ value, onChange, onEnter }: EditorEcuacionProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mfRef = useRef<MathFieldEl | null>(null)
  const onChangeRef = useRef(onChange)
  const [listo, setListo] = useState(false)

  const onEnterRef = useRef(onEnter)

  // Mantiene refs actualizados sin recriar el elemento
  useEffect(() => { onChangeRef.current = onChange })
  useEffect(() => { onEnterRef.current = onEnter })

  useEffect(() => {
    // Inyecta mathlive como módulo ES desde CDN (sin instalar paquete)
    const script = document.createElement('script')
    script.type = 'module'
    script.textContent = `import 'https://esm.sh/mathlive'`
    document.head.appendChild(script)

    // Espera a que el custom element quede registrado
    customElements.whenDefined('math-field').then(() => {
      const container = containerRef.current
      if (!container || mfRef.current) return

      // Crea el elemento imperativo (evita error TypeScript de JSX)
      const mf = document.createElement('math-field') as MathFieldEl
      Object.assign(mf.style, {
        display: 'block',
        width: '100%',
        minHeight: '2.75rem',
        padding: '0.375rem 0.75rem',
        border: '1px solid hsl(var(--border))',
        borderRadius: 'var(--radius)',
        background: 'hsl(var(--background))',
        fontSize: '1.1rem',
        lineHeight: '1.5',
      })
      mf.setAttribute('virtual-keyboard-mode', 'onfocus')
      mf.addEventListener('input', () => onChangeRef.current(mf.value ?? ''))
      mf.addEventListener('keydown', (e: Event) => {
        if ((e as KeyboardEvent).key === 'Enter') onEnterRef.current?.()
      })

      container.appendChild(mf)
      mfRef.current = mf
      setListo(true)
    })

    return () => {
      script.remove()
      mfRef.current?.remove()
      mfRef.current = null
    }
  }, [])

  // Limpia el campo cuando el padre resetea value a ''
  useEffect(() => {
    const mf = mfRef.current
    if (mf && value === '' && mf.value !== '') mf.value = ''
  }, [value])

  function insertar(latex: string) {
    const mf = mfRef.current
    if (!mf?.insert) return
    mf.insert(latex, { selectionMode: 'placeholder' })
    onChangeRef.current(mf.value ?? '')
    mf.focus()
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

      {/* Placeholder mientras mathlive carga */}
      {!listo && (
        <div className="flex h-11 items-center rounded-md border border-dashed border-border bg-background px-3 text-sm text-muted-foreground">
          Cargando editor visual…
        </div>
      )}

      {/* El math-field se monta aquí imperativo, sin JSX */}
      <div ref={containerRef} />
    </div>
  )
}
