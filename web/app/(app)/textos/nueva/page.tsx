import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { resolverAsignatura } from '@/lib/asignatura'
import { FormularioTexto } from '@/components/textos/formulario-texto'
import { ElegirAsignatura } from '@/components/shell/elegir-asignatura'

export default async function NuevoTextoPage() {
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
          Agregar Texto
        </h1>
        <ElegirAsignatura
          titulo="¿De qué asignatura es el texto?"
          subtitulo="Elige la asignatura para agregar textos. Quedará como tu asignatura por defecto (puedes cambiarla en el menú lateral)."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          📰 Agregar Texto
          <span className="font-semibold text-muted-foreground">
            {' — '}
            {asignatura}
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Textos de comprensión lectora a los que puedes asociar preguntas.
        </p>
      </div>
      <FormularioTexto asignaturaInicial={asignatura} />
    </div>
  )
}
