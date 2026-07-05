import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { resolverAsignatura } from '@/lib/asignatura'
import { FormularioPregunta } from '@/components/preguntas/formulario-pregunta'
import { ElegirAsignatura } from '@/components/shell/elegir-asignatura'

export default async function NuevaPreguntaPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  // Toma la asignatura activa (cookie / más usada). Si es "Todas", pedimos
  // elegir una aquí mismo antes de mostrar el formulario.
  const asignatura = await resolverAsignatura(userId)

  if (!asignatura) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Agregar Pregunta
        </h1>
        <ElegirAsignatura
          titulo="¿De qué asignatura es la pregunta?"
          subtitulo="Elige la asignatura para agregar preguntas. Quedará como tu asignatura por defecto (puedes cambiarla en el menú lateral)."
        />
      </div>
    )
  }

  return <FormularioPregunta asignaturaInicial={asignatura} />
}
