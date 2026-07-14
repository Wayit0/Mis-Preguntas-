'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Revela su contenido al entrar en el viewport (una sola vez). Progresivo: sin
 * JS el contenido es visible; el CSS respeta prefers-reduced-motion (ver
 * globals.css, clases .revelar / .revelar-visible).
 */
export function Revelar({
  children,
  className,
  retrasoMs = 0,
}: {
  children: React.ReactNode
  className?: string
  retrasoMs?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn('revelar', visible && 'revelar-visible', className)}
      style={retrasoMs ? { transitionDelay: `${retrasoMs}ms` } : undefined}
    >
      {children}
    </div>
  )
}
