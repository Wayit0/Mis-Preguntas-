import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { cargarTextoPorId } from '@/lib/queries/textos'
import { FormularioTexto } from '@/components/textos/formulario-texto'

export default async function EditarTextoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  const { id } = await params
  const texto = await cargarTextoPorId(Number(id), userId)
  if (!texto) notFound()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          📰 Editar Texto
          <span className="font-semibold text-muted-foreground">
            {' — '}
            {texto.asignatura}
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Los cambios se reflejan en las pruebas que incluyan este texto al
          regenerar su PDF.
        </p>
      </div>
      <FormularioTexto texto={texto} />
    </div>
  )
}
