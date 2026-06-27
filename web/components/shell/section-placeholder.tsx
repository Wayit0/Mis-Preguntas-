interface SectionPlaceholderProps {
  titulo: string
  /** Asignatura del contexto (searchParam). Si falta, se muestra "Todas". */
  asignatura?: string
  descripcion?: string
}

// Marcador reutilizable para las secciones que aún no están implementadas. Muestra
// el título, la asignatura del contexto y un aviso de "en construcción".
export function SectionPlaceholder({
  titulo,
  asignatura,
  descripcion,
}: SectionPlaceholderProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          {titulo}
          {asignatura ? (
            <span className="font-semibold text-muted-foreground">
              {' — '}
              {asignatura}
            </span>
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">
          {descripcion ?? `Asignatura: ${asignatura ?? 'Todas las asignaturas'}`}
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-base font-medium text-foreground">🚧 En construcción</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta sección estará disponible próximamente.
        </p>
      </div>
    </div>
  )
}
