import { notFound } from 'next/navigation'
import { requireEstudiante } from '@/lib/authz'
import { cargarTareaParaEstudiante } from '@/lib/queries/tareas'
import { ResponderTarea } from '@/components/estudiante/responder-tarea'
import { ResultadoTarea } from '@/components/estudiante/resultado-tarea'

// La tarea puede cambiar de estado (entregada/vencida) entre visitas.
export const dynamic = 'force-dynamic'

export default async function TareaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const actor = await requireEstudiante()
  const { id } = await params
  const tarea = await cargarTareaParaEstudiante(Number(id), actor.userId)
  if (!tarea) notFound()

  if (tarea.entregada) return <ResultadoTarea tarea={tarea} />

  const vencida = tarea.fechaLimite ? tarea.fechaLimite < new Date() : false
  if (vencida) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <p className="font-medium">El plazo de esta tarea ya venció.</p>
      </div>
    )
  }
  return <ResponderTarea tarea={tarea} />
}
