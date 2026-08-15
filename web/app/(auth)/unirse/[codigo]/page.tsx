import { nombreCursoPorCodigo } from '@/lib/actions/registro-estudiante'
import { FormularioUnirse } from '@/components/estudiante/formulario-unirse'

// Dinámico: el nombre del curso depende del código en la URL, no se puede
// prerenderizar en build (mismo motivo que login/registro con sus proveedores
// sociales dependientes de runtime).
export const dynamic = 'force-dynamic'

export default async function UnirseConCodigoPage({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = await params
  const nombreCurso = await nombreCursoPorCodigo(codigo)
  return <FormularioUnirse codigo={codigo} nombreCurso={nombreCurso} />
}
