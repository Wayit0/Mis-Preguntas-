import Link from 'next/link'
import { Logo } from '@/components/brand/logo'

/**
 * Envoltorio para páginas legales públicas (privacidad, términos): cabecera con
 * el logo, contenido en columna legible y pie. Sin auth ni sidebar.
 */
export function PaginaLegal({
  titulo,
  actualizado,
  children,
}: {
  titulo: string
  actualizado: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="border-b border-border/70">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-3.5">
          <Link href="/" aria-label="Ir al inicio">
            <Logo />
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Volver al inicio
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:py-14">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {titulo}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última actualización: {actualizado}
        </p>

        <div className="mt-8 flex flex-col gap-6 text-[15px] leading-relaxed text-foreground/90 [&_a]:font-medium [&_a]:text-primary [&_a:hover]:underline [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_li]:ml-1 [&_p]:text-foreground/90 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5 [&_ul]:text-foreground/90">
          {children}
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-2 px-5 py-6 text-sm text-muted-foreground sm:flex-row">
          <Logo isoClassName="h-5" className="[&_span]:text-base" />
          <div className="flex items-center gap-4">
            <Link href="/privacidad" className="hover:text-foreground">
              Privacidad
            </Link>
            <Link href="/terminos" className="hover:text-foreground">
              Términos
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
