import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { usuarios, cursos, inscripciones, asignaciones } from '@/lib/db/schema'
import type { ContenidoAsignacion } from '@/lib/tareas/contenido'

let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { entregarTarea } = await import('@/lib/actions/entregas')
const { cargarTareaParaEstudiante, listarTareasDeEstudiante } = await import('@/lib/queries/tareas')

async function crearUsuario(prefijo: string, role = 'teacher') {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db.insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x', role }).returning()
  return u
}

const CONTENIDO: ContenidoAsignacion = {
  textos: [],
  preguntas: [
    {
      preguntaId: 1, tipo: 'seleccion_multiple', enunciado: '2+2', A: '3', B: '4',
      C: null, D: null, E: null, correcta: 'B', explicacion: 'aritmética',
      imagenPregunta: null, imagenA: null, imagenB: null, imagenC: null,
      imagenD: null, imagenE: null, imagenTamano: 'mediano',
    },
    {
      preguntaId: 2, tipo: 'desarrollo_corto', enunciado: 'explica', A: null, B: null,
      C: null, D: null, E: null, correcta: null, explicacion: null,
      imagenPregunta: null, imagenA: null, imagenB: null, imagenC: null,
      imagenD: null, imagenE: null, imagenTamano: 'mediano',
    },
  ],
}

async function fixtures(fechaLimite: Date | null = null) {
  const prof = await crearUsuario('ent-prof')
  const est = await crearUsuario('ent-est', 'student')
  const [curso] = await db.insert(cursos)
    .values({ userId: prof.id, nombre: '8°A', joinCode: `jc-${Date.now()}-${Math.random()}` })
    .returning()
  await db.insert(inscripciones).values({ cursoId: curso.id, estudianteId: est.id })
  const [asig] = await db.insert(asignaciones)
    .values({ cursoId: curso.id, pruebaId: 999, titulo: 'Tarea', contenido: CONTENIDO, fechaLimite })
    .returning()
  return { prof, est, curso, asig }
}

beforeEach(() => { currentUserId = 0 })

describe('tareas del estudiante (contra Postgres)', () => {
  it('antes de entregar, la carga NO incluye correcta ni explicacion', async () => {
    const { est, asig } = await fixtures()
    const tarea = await cargarTareaParaEstudiante(asig.id, est.id)
    expect(tarea?.entregada).toBe(false)
    const json = JSON.stringify(tarea)
    expect(json).not.toContain('correcta')
    expect(json).not.toContain('explicacion')
    expect(json).not.toContain('aritmética')
  })

  it('no inscrito → null', async () => {
    const { asig } = await fixtures()
    const intruso = await crearUsuario('ent-intruso', 'student')
    expect(await cargarTareaParaEstudiante(asig.id, intruso.id)).toBeNull()
  })

  it('entregar corrige, guarda y luego la carga trae correctas y respuestas', async () => {
    const { est, asig } = await fixtures()
    currentUserId = est.id
    const res = await entregarTarea(asig.id, { '0': 'B', '1': 'mi ensayo' })
    expect(res).toEqual({ ok: true, puntaje: 1, total: 1 })

    const tarea = await cargarTareaParaEstudiante(asig.id, est.id)
    expect(tarea?.entregada).toBe(true)
    if (tarea?.entregada) {
      expect(tarea.puntaje).toBe(1)
      expect(tarea.respuestas['1']).toBe('mi ensayo')
      expect(tarea.contenido.preguntas[0].correcta).toBe('B')
    }
  })

  it('rechaza segundo intento, fuera de plazo y no inscrito', async () => {
    const { est, asig } = await fixtures()
    currentUserId = est.id
    await entregarTarea(asig.id, { '0': 'A' })
    expect('error' in (await entregarTarea(asig.id, { '0': 'B' }))).toBe(true)

    const vencida = await fixtures(new Date('2020-01-01'))
    currentUserId = vencida.est.id
    expect('error' in (await entregarTarea(vencida.asig.id, { '0': 'B' }))).toBe(true)

    const intruso = await crearUsuario('ent-intruso2', 'student')
    currentUserId = intruso.id
    expect('error' in (await entregarTarea(asig.id, { '0': 'B' }))).toBe(true)
  })

  it('listarTareasDeEstudiante calcula estados', async () => {
    const { est, asig } = await fixtures()
    const vencida = await fixtures(new Date('2020-01-01'))
    // Mismo estudiante inscrito también en el curso vencido.
    await db.insert(inscripciones).values({ cursoId: vencida.curso.id, estudianteId: est.id })
    currentUserId = est.id
    await entregarTarea(asig.id, { '0': 'B' })

    const lista = await listarTareasDeEstudiante(est.id)
    const porId = new Map(lista.map((t) => [t.id, t]))
    expect(porId.get(asig.id)?.estado).toBe('entregada')
    expect(porId.get(asig.id)?.puntaje).toBe(1)
    expect(porId.get(vencida.asig.id)?.estado).toBe('vencida')
  })
})
