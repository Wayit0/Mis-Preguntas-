import Link from 'next/link'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Panel de marca (solo lg+) — continúa la estética del landing */}
      <aside className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
        />
        <Link
          href="/"
          className="relative z-10 flex w-fit items-center gap-2 font-heading text-lg font-semibold text-white"
        >
          <span aria-hidden>📚</span> Mis Preguntas
        </Link>

        <div className="relative z-10 max-w-md">
          <h2 className="font-heading text-3xl font-semibold leading-tight tracking-tight text-white">
            Menos tiempo armando pruebas, más tiempo enseñando.
          </h2>
          <ul className="mt-6 space-y-3 text-sm text-sidebar-foreground/85">
            {[
              'Reúne tus preguntas con imágenes y fórmulas',
              'Genera pruebas en PDF listas para imprimir',
              'Comparte el banco con tu colegio',
            ].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 font-mono text-xs text-sidebar-foreground/60">
          Para profesores
        </p>
      </aside>

      {/* Área del formulario */}
      <main className="flex flex-col items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-sm">
          {/* Marca compacta visible en móvil (el panel se oculta) */}
          <Link
            href="/"
            className="mb-6 flex items-center justify-center gap-2 font-heading text-xl font-semibold tracking-tight text-foreground lg:hidden"
          >
            <span aria-hidden>📚</span> Mis Preguntas
          </Link>
          {children}
        </div>
      </main>
    </div>
  )
}
