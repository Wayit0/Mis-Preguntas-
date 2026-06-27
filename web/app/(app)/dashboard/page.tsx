import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { getDashboardStats } from '@/lib/queries/dashboard'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

// Conserva el contexto de asignatura (?asignatura=) al enlazar a otra sección.
function hrefCon(base: string, asignatura?: string): string {
  return asignatura
    ? `${base}?asignatura=${encodeURIComponent(asignatura)}`
    : base
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string }>
}) {
  const { asignatura } = await searchParams
  const session = await getSession()
  // El layout (app) ya protege la ruta, pero guardamos aquí también: sin esto, la
  // página se renderiza concurrentemente con el redirect del layout y alcanza a
  // disparar getDashboardStats(NaN) → error 22P02 en Postgres (int inválido).
  if (!session) redirect('/login')
  const nombre = session.user.name ?? 'Profesor'
  const userId = Number(session.user.id)

  const stats = await getDashboardStats(userId, asignatura)

  const tarjetas = [
    {
      titulo: 'Mis preguntas',
      descripcion: 'Preguntas que has creado',
      valor: stats.misPreguntas,
      href: '/preguntas',
      cta: 'Ver mis preguntas',
    },
    {
      titulo: 'Compartidas conmigo',
      descripcion: 'Preguntas de tus colaboradores',
      valor: stats.compartidasConmigo,
      href: '/compartido',
      cta: 'Ver banco compartido',
    },
    {
      titulo: 'Mis textos',
      descripcion: 'Textos de comprensión lectora',
      valor: stats.misTextos,
      href: '/textos',
      cta: 'Ver mis textos',
    },
    {
      titulo: 'Colaboradores',
      descripcion: 'Colegas que has invitado',
      valor: stats.colaboradores,
      href: '/colaboradores',
      cta: 'Ver colaboradores',
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Hola, {nombre}
        </h1>
        <p className="text-sm text-muted-foreground">
          {asignatura
            ? `Resumen de ${asignatura}.`
            : 'Resumen de todas tus asignaturas.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <Card key={t.titulo}>
            <CardHeader>
              <CardTitle>{t.titulo}</CardTitle>
              <CardDescription>{t.descripcion}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <span className="font-heading text-3xl font-bold text-foreground">
                {t.valor}
              </span>
              <Link
                href={hrefCon(t.href, asignatura)}
                className={buttonVariants({
                  variant: 'outline',
                  size: 'sm',
                  className: 'w-fit',
                })}
              >
                {t.cta}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accesos directos</CardTitle>
          <CardDescription>Empieza una tarea rápidamente.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link
            href={hrefCon('/preguntas/nueva', asignatura)}
            className={buttonVariants({ size: 'sm' })}
          >
            ➕ Agregar pregunta
          </Link>
          <Link
            href={hrefCon('/textos', asignatura)}
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            📰 Nuevo texto
          </Link>
          <Link
            href={hrefCon('/prueba', asignatura)}
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            📝 Crear prueba
          </Link>
          <Link
            href={hrefCon('/importar', asignatura)}
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            📄 Importar documento
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
