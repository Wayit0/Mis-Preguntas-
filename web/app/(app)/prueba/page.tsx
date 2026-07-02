import { redirect } from 'next/navigation'
import { getActor } from '@/lib/authz'
import { resolverAsignatura } from '@/lib/asignatura'
import { cargarDatosGenerador } from '@/lib/queries/pruebas'
import { obtenerColegioPorUsuario } from '@/lib/queries/colegio'
import { imageUrl } from '@/lib/storage/blob'
import { GeneradorPrueba } from '@/components/prueba/generador-prueba'

export default async function PruebaPage() {
  const actor = await getActor()
  if (!actor) redirect('/login')
  const userId = actor.userId

  // La asignatura es contexto global (cookie / más usada), no viene de la URL.
  const asignatura = await resolverAsignatura(userId)

  // Una prueba es siempre de una asignatura concreta. Si el contexto es "Todas",
  // pedimos elegir una en el menú lateral en vez de mostrar el generador.
  if (!asignatura) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Crear Prueba
        </h1>
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-base font-medium text-foreground">
            Elige una asignatura para crear la prueba
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Selecciona una asignatura en el menú lateral (arriba a la izquierda) y
            vuelve aquí. La prueba se creará para esa asignatura.
          </p>
        </div>
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
