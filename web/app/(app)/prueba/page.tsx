import { redirect } from 'next/navigation'
import { getActor } from '@/lib/authz'
import { resolverAsignatura } from '@/lib/asignatura'
import { cargarDatosGenerador } from '@/lib/queries/pruebas'
import { obtenerColegioPorUsuario } from '@/lib/queries/colegio'
import { imageUrl } from '@/lib/storage/blob'
import { GeneradorPrueba } from '@/components/prueba/generador-prueba'
import { ElegirAsignatura } from '@/components/shell/elegir-asignatura'

export default async function PruebaPage() {
  const actor = await getActor()
  if (!actor) redirect('/login')
  const userId = actor.userId

  // La asignatura es contexto global (cookie / más usada), no viene de la URL.
  const asignatura = await resolverAsignatura(userId)

  // Una prueba es siempre de una asignatura concreta. Si el contexto es "Todas",
  // mostramos el selector para elegir una aquí mismo (queda como la por defecto).
  if (!asignatura) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Crear Prueba
        </h1>
        <ElegirAsignatura
          titulo="¿De qué asignatura es la prueba?"
          subtitulo="Elige la asignatura para crear la prueba. Quedará como tu asignatura por defecto (puedes cambiarla en el menú lateral)."
        />
      </div>
    )
  }

  const [{ preguntas, materias, textos }, colegio] = await Promise.all([
    cargarDatosGenerador(userId, asignatura),
    obtenerColegioPorUsuario(userId),
  ])

  return (
    <GeneradorPrueba
      asignatura={asignatura}
      profesorInicial={actor.nombre}
      preguntas={preguntas}
      materias={materias}
      textos={textos}
      colegioInicial={colegio?.nombre ?? ''}
      logoColegioUrl={colegio?.logo ? imageUrl(colegio.logo) : null}
    />
  )
}
