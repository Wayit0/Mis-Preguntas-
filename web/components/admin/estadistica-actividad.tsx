import type { EstadisticaProfesor, EstadisticaEstudiante } from '@/lib/queries/admin'

/**
 * Fila compacta con la actividad de un profesor: preguntas en su banco (y
 * cuántas compartió), pruebas diseñadas y con quién colabora. Usada por
 * `FilaUsuario`.
 */
export function EstadisticaProfesorVista({
  estadistica,
}: {
  estadistica: EstadisticaProfesor
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          📚 {estadistica.preguntas}{' '}
          {estadistica.preguntas === 1 ? 'pregunta' : 'preguntas'} en su banco
        </span>
        <span>🔗 {estadistica.preguntasCompartidas} compartidas</span>
        <span>
          📝 {estadistica.pruebas}{' '}
          {estadistica.pruebas === 1 ? 'prueba diseñada' : 'pruebas diseñadas'}
        </span>
      </div>
      <span>
        🤝 Colaborando con:{' '}
        {estadistica.colaborandoCon.length === 0
          ? 'nadie'
          : estadistica.colaborandoCon.map((c) => c.nombre).join(', ')}
      </span>
    </div>
  )
}

/**
 * Fila compacta con la actividad de un estudiante: cuántos documentos
 * (tareas/evaluaciones) ha entregado y cuántas veces entregó cada uno
 * (`intentos` sube con cada "rehacer", ver entregarTarea). Usada por
 * `FilaEstudiante`.
 */
export function EstadisticaEstudianteVista({
  estadistica,
}: {
  estadistica: EstadisticaEstudiante
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
      <span>
        📄 {estadistica.documentos}{' '}
        {estadistica.documentos === 1 ? 'documento entregado' : 'documentos entregados'}
      </span>
      <span>
        🔁 Repeticiones por documento:{' '}
        {estadistica.detalle.length === 0
          ? '—'
          : estadistica.detalle.map((d) => `${d.titulo} (${d.intentos})`).join(', ')}
      </span>
    </div>
  )
}
