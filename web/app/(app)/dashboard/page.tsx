import { getSession } from '@/lib/get-session'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

// El guard de sesión lo provee (app)/layout.tsx; aquí sólo saludamos al usuario.
// TODO Fase 4.2: reemplazar las tarjetas vacías por conteos reales (queries agregadas).
export default async function DashboardPage() {
  const session = await getSession()
  const nombre = session?.user.name ?? 'Profesor'

  const tarjetas = [
    { titulo: 'Mis preguntas', descripcion: 'Preguntas que has creado' },
    { titulo: 'Compartidas conmigo', descripcion: 'Preguntas de tus colaboradores' },
    { titulo: 'Mis textos', descripcion: 'Textos de comprensión lectora' },
  ]

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Hola, {nombre}
        </h1>
        <p className="text-sm text-muted-foreground">
          Bienvenido a tu panel de Mis Preguntas.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tarjetas.map((t) => (
          <Card key={t.titulo}>
            <CardHeader>
              <CardTitle>{t.titulo}</CardTitle>
              <CardDescription>{t.descripcion}</CardDescription>
            </CardHeader>
            <CardContent>
              <span
                aria-hidden
                className="font-heading text-3xl font-bold text-muted-foreground/40"
              >
                —
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
