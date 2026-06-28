import Link from 'next/link'
import { requireRole, esAdminDeColegio } from '@/lib/authz'
import {
  obtenerColegio,
  listarProfesores,
  listarBancoColegio,
} from '@/lib/queries/colegio'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TarjetaPregunta } from '@/components/preguntas/tarjeta-pregunta'
import { InvitarProfesor } from '@/components/colegio/invitar-profesor'
import { CopiarCodigo } from '@/components/colegio/copiar-codigo'
import { BotonQuitarProfesor } from '@/components/colegio/boton-quitar-profesor'
import { ConfigurarColegio } from '@/components/colegio/configurar-colegio'
import { AccionesBancoPregunta } from '@/components/colegio/acciones-banco-pregunta'

type Tab = 'profesores' | 'banco' | 'config'

function normalizarTab(valor?: string): Tab {
  if (valor === 'banco') return 'banco'
  if (valor === 'config') return 'config'
  return 'profesores'
}

function hrefTab(tab: Tab, colegio?: number): string {
  const params = new URLSearchParams()
  params.set('tab', tab)
  if (colegio) params.set('colegio', String(colegio))
  return `/colegio?${params.toString()}`
}

function EstadoVacio({ mensaje }: { mensaje: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <p className="text-sm text-muted-foreground">{mensaje}</p>
    </div>
  )
}

export default async function ColegioPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; colegio?: string }>
}) {
  const { tab, colegio: colegioParam } = await searchParams
  const tabActual = normalizarTab(tab)

  // Guard de la página: solo school_admin o global_admin pueden entrar. El
  // colegio a administrar es el del actor (school_admin); un global_admin puede
  // indicar uno con ?colegio= (administración global). esAdminDeColegio impide
  // que un school_admin vea un colegio que no es el suyo.
  const actor = await requireRole(['school_admin', 'global_admin'])
  const colegioIdParam = colegioParam ? Number(colegioParam) : NaN
  const colegioId =
    Number.isFinite(colegioIdParam) && actor.role === 'global_admin'
      ? colegioIdParam
      : actor.colegioId

  if (colegioId === null || !esAdminDeColegio(actor, colegioId)) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <EstadoVacio
          mensaje={
            actor.role === 'global_admin'
              ? 'Selecciona un colegio para administrarlo (administración global).'
              : 'Aún no perteneces a ningún colegio.'
          }
        />
      </div>
    )
  }

  const colegio = await obtenerColegio(colegioId)
  if (!colegio) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <EstadoVacio mensaje="El colegio no existe." />
      </div>
    )
  }

  const tabs: { id: Tab; etiqueta: string }[] = [
    { id: 'profesores', etiqueta: 'Profesores' },
    { id: 'banco', etiqueta: 'Banco del colegio' },
    { id: 'config', etiqueta: 'Configuración' },
  ]
  const colegioRef =
    actor.role === 'global_admin' ? colegioId : undefined

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          🏫 {colegio.nombre}
        </h1>
        <p className="text-sm text-muted-foreground">
          Administra los profesores, el banco de preguntas y la configuración de
          tu colegio.
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
              href={hrefTab(t.id, colegioRef)}
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

      {tabActual === 'profesores' ? (
        <ProfesoresTab colegioId={colegioId} codigo={colegio.joinCode} />
      ) : tabActual === 'banco' ? (
        <BancoTab colegioId={colegioId} />
      ) : (
        <ConfigurarColegio
          nombreInicial={colegio.nombre}
          logoInicial={colegio.logo}
          codigoInicial={colegio.joinCode}
        />
      )}
    </div>
  )
}

async function ProfesoresTab({
  colegioId,
  codigo,
}: {
  colegioId: number
  codigo: string
}) {
  const profesores = await listarProfesores(colegioId)

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-base font-semibold text-foreground">
              Código de unión
            </h2>
            <p className="text-sm text-muted-foreground">
              Compártelo con tus profesores para que se unan al colegio.
            </p>
          </div>
          <CopiarCodigo codigo={codigo} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <InvitarProfesor />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-base font-semibold text-foreground">
          Profesores del colegio
        </h2>
        {profesores.length === 0 ? (
          <EstadoVacio mensaje="Aún no hay profesores en el colegio." />
        ) : (
          <div className="flex flex-col gap-2">
            {profesores.map((p) => (
              <Card key={p.id} size="sm">
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">
                      👤 {p.nombre}
                      {p.role === 'school_admin' ? (
                        <Badge variant="secondary" className="ml-2 align-middle">
                          Admin
                        </Badge>
                      ) : null}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {p.email}
                    </span>
                  </div>
                  <BotonQuitarProfesor userId={p.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

async function BancoTab({ colegioId }: { colegioId: number }) {
  const banco = await listarBancoColegio(colegioId)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-semibold text-foreground">
          Preguntas ({banco.preguntas.length})
        </h2>
        {banco.preguntas.length === 0 ? (
          <EstadoVacio mensaje="Aún no hay preguntas en el banco del colegio." />
        ) : (
          <div className="flex flex-col gap-3">
            {banco.preguntas.map((p) => (
              <div key={p.id} className="flex flex-col gap-2">
                <TarjetaPregunta p={p} autor={p.autor} soloLectura />
                <AccionesBancoPregunta preguntaId={p.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-semibold text-foreground">
          Textos ({banco.textos.length})
        </h2>
        {banco.textos.length === 0 ? (
          <EstadoVacio mensaje="Aún no hay textos en el banco del colegio." />
        ) : (
          <div className="flex flex-col gap-3">
            {banco.textos.map((t) => (
              <Card key={t.id}>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-heading text-base font-semibold text-foreground">
                      📰 {t.titulo}
                    </h3>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      Publicado por {t.autor}
                    </span>
                  </div>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">
                    {t.contenido.length > 220
                      ? `${t.contenido.slice(0, 220).trimEnd()}…`
                      : t.contenido}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
