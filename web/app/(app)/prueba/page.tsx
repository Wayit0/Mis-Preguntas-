import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { listarPreguntasPropias, opcionesDeFiltros } from '@/lib/queries/preguntas'
import {
  cargarTextosPropios,
  contarPreguntasPorTexto,
} from '@/lib/queries/textos'
import { GeneradorPrueba } from '@/components/prueba/generador-prueba'

export default async function PruebaPage({
  searchParams,
}: {
  searchParams: Promise<{ asignatura?: string; materia?: string }>
}) {
  const { asignatura } = await searchParams

  const session = await getSession()
  if (!session) redirect('/login')
  const userId = Number(session.user.id)

  const [lista, opciones, textos] = await Promise.all([
    listarPreguntasPropias(userId, asignatura),
    opcionesDeFiltros(userId, asignatura),
    cargarTextosPropios(userId, asignatura),
  ])

  const conteos = await contarPreguntasPorTexto(textos.map((t) => t.id))

  // Forma serializable y mínima para el cliente. Las preguntas "sueltas" (sin
  // texto asociado) se eligen individualmente; las de un texto se incluyen al
  // seleccionar el texto.
  const preguntas = lista
    .filter((p) => p.textoId == null)
    .map((p) => ({
      id: p.id,
      enunciado: p.pregunta,
      materia: p.materia ?? '',
      contenido: p.contenido ?? '',
      nivel: p.nivel ?? '',
      tipo: p.tipo ?? 'seleccion_multiple',
      correcta: p.correcta ?? '',
      A: p.A ?? '',
      B: p.B ?? '',
      C: p.C ?? '',
      D: p.D ?? '',
      E: p.E ?? '',
    }))

  const textosUtiles = textos
    .map((t) => ({
      id: t.id,
      titulo: t.titulo,
      nPreguntas: conteos.get(t.id) ?? 0,
    }))
    .filter((t) => t.nPreguntas > 0)

  return (
    <GeneradorPrueba
      asignatura={asignatura ?? ''}
      profesorInicial={session.user.name ?? ''}
      preguntas={preguntas}
      materias={opciones.materias}
      textos={textosUtiles}
    />
  )
}
