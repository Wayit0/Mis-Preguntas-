import type { EstadisticaUsuario } from '@/lib/queries/admin'

/**
 * Fila compacta con la actividad de un usuario: preguntas en su banco (y
 * cuántas compartió), pruebas diseñadas y con quién colabora. Se usa tanto en
 * `FilaUsuario` (profesores) como en `FilaEstudiante`.
 */
export function EstadisticaActividad({
  estadistica,
}: {
  estadistica: EstadisticaUsuario
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
