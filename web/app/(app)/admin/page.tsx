import Link from 'next/link'
import { requireRole } from '@/lib/authz'
import {
  listarColegios,
  listarUsuarios,
  listarUsosIa,
  resumenUsosIa,
  listarAccesos,
  resumenAccesos,
} from '@/lib/queries/admin'
import {
  listarSuscripcionesAdmin,
  resumenSuscripciones,
  pagosDeUsuario,
  listarLicencias,
} from '@/lib/queries/suscripciones-admin'
import { formatearUsd } from '@/lib/ai/costos'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CopiarCodigo } from '@/components/colegio/copiar-codigo'
import { CrearColegio } from '@/components/admin/crear-colegio'
import { EditarColegio } from '@/components/admin/editar-colegio'
import { FilaUsuario } from '@/components/admin/fila-usuario'
import { ConcederCortesia } from '@/components/admin/conceder-cortesia'
import { LicenciaColegio } from '@/components/admin/licencia-colegio'
import { CancelarSuscripcion } from '@/components/admin/cancelar-suscripcion'

type Tab = 'colegios' | 'usuarios' | 'costos' | 'accesos' | 'suscripciones'

function normalizarTab(valor?: string): Tab {
  if (valor === 'usuarios') return 'usuarios'
  if (valor === 'costos') return 'costos'
  if (valor === 'accesos') return 'accesos'
  if (valor === 'suscripciones') return 'suscripciones'
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
  searchParams: Promise<{ tab?: string; pagos?: string }>
}) {
  // Guard de la página: SOLO admin global. requireRole lee la fila de usuarios y
  // redirige a "/" si el rol no está autorizado (no filtra el recurso).
  await requireRole(['global_admin'])

  const { tab, pagos } = await searchParams
  const tabActual = normalizarTab(tab)
  const pagosDeRaw = pagos ? Number(pagos) : NaN
  const pagosDe = Number.isFinite(pagosDeRaw) ? pagosDeRaw : undefined

  const tabs: { id: Tab; etiqueta: string }[] = [
    { id: 'colegios', etiqueta: 'Colegios' },
    { id: 'usuarios', etiqueta: 'Usuarios' },
    { id: 'costos', etiqueta: 'Costos de IA' },
    { id: 'accesos', etiqueta: 'Accesos' },
    { id: 'suscripciones', etiqueta: 'Suscripciones' },
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
      ) : tabActual === 'costos' ? (
        <CostosTab />
      ) : tabActual === 'accesos' ? (
        <AccesosTab />
      ) : (
        <SuscripcionesTab pagosDe={pagosDe} />
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

/** Etiquetas legibles para los métodos de acceso registrados en `accesos`. */
const ETIQUETA_METODO: Record<string, string> = {
  password: '✉️ Correo',
  google: '🔵 Google',
  microsoft: '🪟 Microsoft',
}

/** Resume un user-agent a "Navegador · SO", o el crudo recortado si no calza. */
function resumirUserAgent(ua: string | null): string | null {
  if (!ua) return null
  const nav = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null
  const so = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null
  const partes = [nav, so].filter(Boolean)
  return partes.length ? partes.join(' · ') : ua.slice(0, 40)
}

async function AccesosTab() {
  const [resumen, filas] = await Promise.all([
    resumenAccesos(),
    listarAccesos(100),
  ])

  const tarjetas = [
    { etiqueta: 'Accesos totales', valor: String(resumen.total) },
    { etiqueta: 'Exitosos (7 días)', valor: String(resumen.exitos7d) },
    { etiqueta: 'Fallidos (7 días)', valor: String(resumen.fallos7d) },
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
          Últimos accesos{' '}
          {filas.length === 100 ? '(últimos 100)' : `(${filas.length})`}
        </h2>
        {filas.length === 0 ? (
          <EstadoVacio mensaje="Aún no hay accesos registrados. Aparecerán aquí cuando alguien inicie sesión." />
        ) : (
          <div className="flex flex-col gap-3">
            {filas.map((a) => {
              const ua = resumirUserAgent(a.userAgent)
              return (
                <Card key={a.id}>
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">
                          {a.usuarioNombre ?? (a.exito ? 'Usuario eliminado' : 'Sin cuenta')}
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            {a.email}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {ETIQUETA_METODO[a.metodo] ?? a.metodo} ·{' '}
                          {formatearFecha(a.createdAt)}
                        </span>
                      </div>
                      {a.exito ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                        >
                          Éxito
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Fallido</Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {a.ipAddress ? <span>IP: {a.ipAddress}</span> : null}
                      {ua ? <span>{ua}</span> : null}
                      {!a.exito && a.motivo ? <span>Motivo: {a.motivo}</span> : null}
                    </div>
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

function formatearClp(montoClp: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
  }).format(montoClp)
}

/** Etiquetas legibles para los estados de `suscripciones`/`pagos_suscripcion`. */
const ETIQUETA_ESTADO_SUSCRIPCION: Record<string, string> = {
  activa: 'Activa',
  trial: 'En trial',
  morosa: 'Morosa',
  cancelada: 'Cancelada',
  pendiente: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

function BadgeEstadoSuscripcion({ estado }: { estado: string }) {
  const etiqueta = ETIQUETA_ESTADO_SUSCRIPCION[estado] ?? estado
  if (estado === 'activa' || estado === 'trial' || estado === 'approved') {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
      >
        {etiqueta}
      </Badge>
    )
  }
  if (estado === 'morosa' || estado === 'rejected') {
    return <Badge variant="destructive">{etiqueta}</Badge>
  }
  return <Badge variant="secondary">{etiqueta}</Badge>
}

function BadgeOrigenSuscripcion({ origen }: { origen: string }) {
  if (origen === 'cortesia') {
    return <Badge className="bg-accent text-accent-foreground">Cortesía</Badge>
  }
  return <Badge variant="outline">MercadoPago</Badge>
}

async function SuscripcionesTab({ pagosDe }: { pagosDe?: number }) {
  const [resumen, suscripcionesLista, licencias, pagos] = await Promise.all([
    resumenSuscripciones(),
    listarSuscripcionesAdmin(),
    listarLicencias(),
    pagosDe ? pagosDeUsuario(pagosDe) : Promise.resolve([]),
  ])

  const tarjetas = [
    { etiqueta: 'Activas', valor: String(resumen.activas) },
    { etiqueta: 'En trial', valor: String(resumen.enTrial) },
    { etiqueta: 'Morosas', valor: String(resumen.morosas) },
    { etiqueta: 'Ingreso del mes', valor: formatearClp(resumen.ingresoMesClp) },
  ]

  const emailPagosDe = pagosDe
    ? (suscripcionesLista.find((s) => s.userId === pagosDe)?.email ?? `usuario #${pagosDe}`)
    : null

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-base font-semibold text-foreground">
              Conceder cortesía
            </h2>
            <p className="text-sm text-muted-foreground">
              Da Pro sin cobro a un usuario (piloto, reclamo, etc). No pisa una
              suscripción de MercadoPago vigente.
            </p>
          </div>
          <ConcederCortesia />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-base font-semibold text-foreground">
          Suscripciones ({suscripcionesLista.length})
        </h2>
        {suscripcionesLista.length === 0 ? (
          <EstadoVacio mensaje="Aún no hay suscripciones registradas." />
        ) : (
          <div className="flex flex-col gap-3">
            {suscripcionesLista.map((s) => (
              <Card key={s.id}>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-foreground">
                        {s.usuario ?? 'Usuario eliminado'}
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          {s.email ?? ''}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatearFecha(s.createdAt)}
                        {s.periodicidad ? ` · ${s.periodicidad}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <BadgeOrigenSuscripcion origen={s.origen} />
                      <BadgeEstadoSuscripcion estado={s.estado} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Vigente hasta: {formatearFecha(s.periodoHasta)}</span>
                    {s.nota ? <span>Nota: {s.nota}</span> : null}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <Link
                      href={`/admin?tab=suscripciones&pagos=${s.userId}`}
                      className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                      Ver pagos
                    </Link>
                    {s.estado !== 'cancelada' ? (
                      <CancelarSuscripcion userId={s.userId} email={s.email ?? 'este usuario'} />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {pagosDe ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-base font-semibold text-foreground">
            Pagos de {emailPagosDe}
          </h2>
          {pagos.length === 0 ? (
            <EstadoVacio mensaje="Este usuario no tiene pagos registrados." />
          ) : (
            <div className="flex flex-col gap-3">
              {pagos.map((p) => {
                const statusDetail =
                  typeof p.detalle.status_detail === 'string'
                    ? p.detalle.status_detail
                    : null
                return (
                  <Card key={p.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {formatearClp(p.montoClp)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatearFecha(p.createdAt)}
                          {statusDetail ? ` · ${statusDetail}` : ''}
                        </span>
                      </div>
                      <BadgeEstadoSuscripcion estado={p.estado} />
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-base font-semibold text-foreground">
          Licencias de colegio
        </h2>
        {licencias.length === 0 ? (
          <EstadoVacio mensaje="Aún no hay colegios registrados." />
        ) : (
          <div className="flex flex-col gap-3">
            {licencias.map((c) => (
              <Card key={c.id}>
                <CardContent>
                  <LicenciaColegio colegio={c} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
