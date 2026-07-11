import Link from 'next/link'
import { requireRole } from '@/lib/authz'
import {
  listarColegios,
  listarUsuarios,
  listarUsosIa,
  resumenUsosIa,
} from '@/lib/queries/admin'
import { formatearUsd } from '@/lib/ai/costos'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CopiarCodigo } from '@/components/colegio/copiar-codigo'
import { CrearColegio } from '@/components/admin/crear-colegio'
import { EditarColegio } from '@/components/admin/editar-colegio'
import { FilaUsuario } from '@/components/admin/fila-usuario'

type Tab = 'colegios' | 'usuarios' | 'costos'

function normalizarTab(valor?: string): Tab {
  if (valor === 'usuarios') return 'usuarios'
  if (valor === 'costos') return 'costos'
  return 'colegios'
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
    { id: 'costos', etiqueta: 'Costos de IA' },
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

      {tabActual === 'colegios' ? (
        <ColegiosTab />
      ) : tabActual === 'usuarios' ? (
        <UsuariosTab />
      ) : (
        <CostosTab />
      )}
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

/** Etiquetas legibles para las acciones registradas en `usos_ia`. */
const ETIQUETA_ACCION: Record<string, string> = {
  importar_documento: '📄 Importar documento',
}

function formatearFecha(fecha: Date | null): string {
  if (!fecha) return '—'
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Santiago',
  }).format(fecha)
}

function formatearTokens(n: number): string {
  return new Intl.NumberFormat('es-CL').format(n)
}

async function CostosTab() {
  const [resumen, usos] = await Promise.all([resumenUsosIa(), listarUsosIa(100)])

  const tarjetas = [
    { etiqueta: 'Gasto total', valor: formatearUsd(resumen.totalMicroUsd) },
    { etiqueta: 'Gasto este mes', valor: formatearUsd(resumen.mesMicroUsd) },
    { etiqueta: 'Usos de IA', valor: String(resumen.totalUsos) },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {tarjetas.map((t) => (
          <Card key={t.etiqueta}>
            <CardContent className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t.etiqueta}
              </span>
              <span className="font-heading text-2xl font-bold text-foreground">
                {t.valor}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-base font-semibold text-foreground">
          Últimos usos {usos.length === 100 ? '(últimos 100)' : `(${usos.length})`}
        </h2>
        {usos.length === 0 ? (
          <EstadoVacio mensaje="Aún no hay usos de IA registrados. Aparecerán aquí cuando alguien importe un documento." />
        ) : (
          <div className="flex flex-col gap-3">
            {usos.map((u) => {
              const d = u.detalle ?? {}
              return (
                <Card key={u.id}>
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">
                          {u.usuarioNombre ?? 'Usuario eliminado'}
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            {u.usuarioEmail ?? ''}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {ETIQUETA_ACCION[u.accion] ?? u.accion} ·{' '}
                          {formatearFecha(u.createdAt)}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-sm">
                        {formatearUsd(u.costoMicroUsd)}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Modelo: {u.modelo}</span>
                      <span>Entrada: {formatearTokens(u.inputTokens)} tokens</span>
                      <span>Salida: {formatearTokens(u.outputTokens)} tokens</span>
                      {u.cacheReadTokens > 0 ? (
                        <span>Caché leída: {formatearTokens(u.cacheReadTokens)}</span>
                      ) : null}
                      {u.cacheCreationTokens > 0 ? (
                        <span>Caché escrita: {formatearTokens(u.cacheCreationTokens)}</span>
                      ) : null}
                    </div>

                    {typeof d.archivo === 'string' ? (
                      <div className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                        📎 {d.archivo}
                        {typeof d.preguntas === 'number'
                          ? ` · ${d.preguntas} preguntas`
                          : ''}
                        {typeof d.imagenes === 'number' && d.imagenes > 0
                          ? ` · ${d.imagenes} imágenes`
                          : ''}
                        {typeof d.duracionSegundos === 'number'
                          ? ` · ${d.duracionSegundos}s`
                          : ''}
                        {typeof d.asignatura === 'string'
                          ? ` · ${d.asignatura}`
                          : ''}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
