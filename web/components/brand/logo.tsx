import { cn } from '@/lib/utils'

/**
 * Isotipo EduBox: la "caja" con el brote de dos hojas (verde hoja + ámbar). SVG
 * inline para heredar el tema y quedar nítido. `enOscuro` usa el verde claro
 * (#6ED9A0) para superficies siempre oscuras (sidebar, panel de marca del login);
 * si no, la caja usa el `primary` del tema (adapta claro/oscuro).
 */
export function Isotipo({
  className,
  enOscuro = false,
}: {
  className?: string
  enOscuro?: boolean
}) {
  return (
    <svg
      viewBox="0 0 56 68"
      className={cn('h-6 w-auto shrink-0', className)}
      role="img"
      aria-label="EduBox"
    >
      <rect
        x="6"
        y="40"
        width="44"
        height="24"
        rx="6"
        className={enOscuro ? 'fill-[#6ED9A0]' : 'fill-primary'}
      />
      <rect x="14" y="47" width="18" height="4.5" rx="2.25" fill="#F7F9F6" opacity="0.85" />
      <path d="M28 42 L28 18" stroke="#2E9E63" strokeWidth="5" strokeLinecap="round" />
      <path d="M28 26 Q28 10 10 8 Q12 26 28 26 Z" fill="#2E9E63" />
      <path d="M28 20 Q28 4 46 2 Q44 20 28 20 Z" fill="#F4C542" />
    </svg>
  )
}

/**
 * Wordmark EduBox: isotipo + "Edu" (tinta) / "Box" (verde), en Lora. Por defecto
 * adapta al tema; `enOscuro` fuerza colores claros para fondos siempre oscuros.
 * `soloIso` muestra solo el brote (para espacios <20px, según la guía de marca).
 */
export function Logo({
  className,
  soloIso = false,
  enOscuro = false,
  isoClassName,
}: {
  className?: string
  soloIso?: boolean
  enOscuro?: boolean
  isoClassName?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Isotipo className={isoClassName} enOscuro={enOscuro} />
      {soloIso ? null : (
        <span className="font-heading text-lg font-bold leading-none tracking-tight">
          <span className={enOscuro ? 'text-[#F7F9F6]' : 'text-foreground'}>
            Edu
          </span>
          <span className={enOscuro ? 'text-[#6ED9A0]' : 'text-primary'}>Box</span>
        </span>
      )}
    </span>
  )
}
