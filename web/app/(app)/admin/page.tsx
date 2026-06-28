import Link from 'next/link'
import { requireRole } from '@/lib/authz'
import { listarColegios, listarUsuarios } from '@/lib/queries/admin'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CopiarCodigo } from '@/components/colegio/copiar-codigo'
import { CrearColegio } from '@/components/admin/crear-colegio'
import { EditarColegio } from '@/components/admin/editar-colegio'
import { FilaUsuario } from '@/components/admin/fila-usuario'

type Tab = 'colegios' | 'usuarios'

function normalizarTab(valor?: string): Tab {
  return valor === 'usuarios' ? 'usuarios' : 'colegios'
}

function EstadoVacio({ mensaje }: { mensaje: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <p className="text-sm text-muted-foreground">{mensaje}</p>
    </div>
  )
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  // Guard de la página: SOLO admin global. requireRole lee la fila de usuarios y
  // redirige a "/" si el rol no está autorizado (no filtra el recurso).
  await requireRole(['global_admin'])

  const { tab } = await searchParams
  const tabActual = normalizarTab(tab)

  const tabs: { id: Tab; etiqueta: string }[] = [
    { id: 'colegios', etiqueta: 'Colegios' },
    { id: 'usuarios', etiqueta: 'Usuarios' },
  ]

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          🛡️ Administración
        </h1>
        <p className="text-sm text-muted-foreground">
          Gestiona los colegios y los roles de los usuarios de la plataforma.
        </p>
      </div>

      <div
        role="tablist"
        className="flex items-center gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((t) => {
          const activo = tabActual === t.id
          return (
            <Link
              key={t.id}
              role="tab"
              aria-selected={activo}
              href={`/admin?tab=${t.id}`}
              className={cn(
                '-mb-px shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition-colors',
                activo
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.etiqueta}
            </Link>
          )
        })}
      </div>

      {tabActual === 'colegios' ? <ColegiosTab /> : <UsuariosTab />}
    </div>
  )
}

async function ColegiosTab() {
  const colegios = await listarColegios()

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-base font-semibold text-foreground">
              Crear colegio
            </h2>
            <p className="text-sm text-muted-foreground">
              Se genera un código de unión único para que sus profesores se unan.
            </p>
          </div>
          <CrearColegio />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-base font-semibold text-foreground">
          Colegios ({colegios.length})
        </h2>
        {colegios.length === 0 ? (
          <EstadoVacio mensaje="Aún no hay colegios. Crea el primero arriba." />
        ) : (
          <div className="flex flex-col gap-3">
            {colegios.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      🏫 {c.nombre}
                    </span>
                    <Badge variant="secondary">
                      {c.profesores}{' '}
                      {c.profesores === 1 ? 'profesor' : 'profesores'}
                    </Badge>
                  </div>
                  <EditarColegio id={c.id} nombreInicial={c.nombre} />
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Código de unión
                    </span>
                    <CopiarCodigo codigo={c.joinCode} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

async function UsuariosTab() {
  const [usuarios, colegios] = await Promise.all([
    listarUsuarios(),
    listarColegios(),
  ])
  const opcionesColegio = colegios.map((c) => ({ id: c.id, nombre: c.nombre }))

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-base font-semibold text-foreground">
        Usuarios ({usuarios.length})
      </h2>
      {usuarios.length === 0 ? (
        <EstadoVacio mensaje="No hay usuarios registrados." />
      ) : (
        <div className="flex flex-col gap-3">
          {usuarios.map((u) => (
            <FilaUsuario key={u.id} usuario={u} colegios={opcionesColegio} />
          ))}
        </div>
      )}
    </section>
  )
}
