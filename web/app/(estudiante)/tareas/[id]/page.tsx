import { notFound } from 'next/navigation'
import { requireEstudiante } from '@/lib/authz'
import { cargarTareaParaEstudiante, cargarTareaParaRehacer } from '@/lib/queries/tareas'
import { ResponderTarea } from '@/components/estudiante/responder-tarea'
import { ResultadoTarea } from '@/components/estudiante/resultado-tarea'

// La tarea puede cambiar de estado (entregada/vencida) entre visitas.
export const dynamic = 'force-dynamic'

export default async function TareaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ rehacer?: string }>
}) {
  const actor = await requireEstudiante()
  const { id } = await params
  const { rehacer } = await searchParams
  const tarea = await cargarTareaParaEstudiante(Number(id), actor.userId)
  if (!tarea) notFound()

  const vencida = tarea.fechaLimite ? tarea.fechaLimite < new Date() : false

  // Rehacer una tarea ya entregada: se revalida el plazo en el servidor (no
  // basta con ocultar el botón) y se pide el contenido SIN correctas, como si
  // fuera la primera vez — nunca se reutiliza `tarea` (trae las correctas)
  // para no filtrarlas al cliente.
  if (tarea.entregada && rehacer === '1' && !vencida) {
    const paraRehacer = await cargarTareaParaRehacer(Number(id), actor.userId)
    if (paraRehacer) return <ResponderTarea tarea={paraRehacer} />
  }

  if (tarea.entregada) return <ResultadoTarea tarea={tarea} puedeRehacer={!vencida} />

  if (vencida) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <p className="font-medium">El plazo de esta tarea ya venció.</p>
      </div>
    )
  }
  return <ResponderTarea tarea={tarea} />
}
