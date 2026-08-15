import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getActor } from '@/lib/authz'
import { inscribirConCodigo } from '@/lib/actions/cursos'
import { nombreCursoPorCodigo } from '@/lib/actions/registro-estudiante'
import { FormularioUnirse } from '@/components/estudiante/formulario-unirse'
import { Card, CardContent } from '@/components/ui/card'

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
  // directo (sin pasar por el formulario de alta) y va a su portal.
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

  // Sin sesión: formulario de registro habitual, sin cambios.
  const nombreCurso = await nombreCursoPorCodigo(codigo)
  return <FormularioUnirse codigo={codigo} nombreCurso={nombreCurso} />
}
