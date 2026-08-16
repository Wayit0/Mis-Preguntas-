import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getActor } from '@/lib/authz'
import { inscribirConCodigo } from '@/lib/actions/cursos'
import { nombreCursoPorCodigo } from '@/lib/actions/registro-estudiante'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'

// Dinámico: el nombre del curso / el resultado dependen del código en la URL
// y de la sesión activa, no se puede prerenderizar en build (mismo motivo que
// login/registro con sus proveedores sociales dependientes de runtime).
export const dynamic = 'force-dynamic'

export default async function UnirseConCodigoPage({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = await params
  const actor = await getActor()

  // Estudiante con sesión activa: ya tiene cuenta, así que se inscribe
  // directo (sin pasar por ningún formulario) y va a su portal.
  if (actor?.role === 'student') {
    const resultado = await inscribirConCodigo(codigo)
    if ('ok' in resultado) redirect('/tareas')
    return (
      <Card className="w-full">
        <CardContent className="flex flex-col gap-3 pt-6">
          <p role="alert" className="text-sm text-destructive">
            {resultado.error}
          </p>
          <Link
            href="/tareas"
            className="text-sm font-medium text-primary hover:underline"
          >
            Volver a mis tareas
          </Link>
        </CardContent>
      </Card>
    )
  }

  // Profesor/admin con sesión: este link es para que lo abra un ESTUDIANTE
  // (crearle una cuenta duplicada al profesor no tiene sentido).
  if (actor) {
    return (
      <Card className="w-full">
        <CardContent className="flex flex-col gap-3 pt-6">
          <p className="text-sm text-muted-foreground">
            Este enlace es para estudiantes: compártelo con tus alumnos para
            que se unan al curso. Como profesor no puedes usarlo desde tu
            cuenta.
          </p>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-primary hover:underline"
          >
            Ir a mi panel
          </Link>
        </CardContent>
      </Card>
    )
  }

  // Sin sesión: el link/QR de un curso solo sirve para INSCRIBIRSE, nunca
  // para crear la cuenta — eso se hace aparte en /unirse. Mandamos de vuelta
  // a este mismo link (?next=) para que, ya con sesión de estudiante, la
  // rama de arriba complete la inscripción automáticamente.
  const nombreCurso = await nombreCursoPorCodigo(codigo)
  if (nombreCurso === null) {
    return (
      <Card className="w-full">
        <CardContent className="flex flex-col gap-3 pt-6">
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            El código no es válido; pídele a tu profesor el link correcto.
          </p>
        </CardContent>
      </Card>
    )
  }

  const volver = `/unirse/${encodeURIComponent(codigo)}`
  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-5 pt-6">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Únete a «{nombreCurso}»
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Necesitas una cuenta de estudiante para inscribirte. Si ya
            tienes una, inicia sesión; si no, créala primero.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/login?next=${encodeURIComponent(volver)}`}
            className={buttonVariants({ variant: 'outline', className: 'w-full' })}
          >
            Ya tengo cuenta
          </Link>
          <Link
            href={`/unirse?next=${encodeURIComponent(volver)}`}
            className={buttonVariants({ className: 'w-full' })}
          >
            Crear cuenta de estudiante
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
