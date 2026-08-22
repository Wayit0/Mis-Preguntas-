import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { usuarios, cursos, inscripciones, asignaciones, entregas, borradoresTarea } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import type { ContenidoAsignacion } from '@/lib/tareas/contenido'

let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { entregarTarea, guardarBorradorTarea, guardarDibujoTarea } = await import('@/lib/actions/entregas')
const { cargarTareaParaEstudiante, listarTareasDeEstudiante } = await import('@/lib/queries/tareas')

// guardarDibujoTarea sube al Blob real: requiere Azurite vía
// AZURE_STORAGE_CONNECTION_STRING (mismo gate que tests/integration/blob.test.ts).
const hasBlobConfig = Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING)

function pngDePrueba(nombre = 'dibujo.png'): File {
  return new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], nombre, {
    type: 'image/png',
  })
}

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

  it('permite rehacer (sobrescribe, no duplica), pero rechaza fuera de plazo y no inscrito', async () => {
    const { est, asig } = await fixtures()
    currentUserId = est.id
    const primero = await entregarTarea(asig.id, { '0': 'A' })
    expect(primero).toEqual({ ok: true, puntaje: 0, total: 1 })
    const segundo = await entregarTarea(asig.id, { '0': 'B' })
    expect(segundo).toEqual({ ok: true, puntaje: 1, total: 1 })

    const filas = await db.select().from(entregas).where(eq(entregas.asignacionId, asig.id))
    expect(filas).toHaveLength(1)
    expect(filas[0].respuestas).toEqual({ '0': 'B' })
    // 2 intentos: la primera entrega y el rehacer (estadística de admin).
    expect(filas[0].intentos).toBe(2)

    const vencida = await fixtures(new Date('2020-01-01'))
    currentUserId = vencida.est.id
    expect('error' in (await entregarTarea(vencida.asig.id, { '0': 'B' }))).toBe(true)

    const intruso = await crearUsuario('ent-intruso2', 'student')
    currentUserId = intruso.id
    expect('error' in (await entregarTarea(asig.id, { '0': 'B' }))).toBe(true)
  })

  it('guardarBorradorTarea pre-guarda respuestas sin crear una entrega, y entregar borra el borrador', async () => {
    const { est, asig } = await fixtures()
    currentUserId = est.id

    const guardado = await guardarBorradorTarea(asig.id, { '0': 'A' })
    expect(guardado).toEqual({ ok: true })

    const tarea = await cargarTareaParaEstudiante(asig.id, est.id)
    expect(tarea?.entregada).toBe(false)
    if (tarea && !tarea.entregada) {
      expect(tarea.borrador).toEqual({ '0': 'A' })
    }
    expect(
      await db.select().from(entregas).where(eq(entregas.asignacionId, asig.id)),
    ).toHaveLength(0)

    await entregarTarea(asig.id, { '0': 'B' })
    expect(
      await db.select().from(borradoresTarea).where(and(
        eq(borradoresTarea.asignacionId, asig.id),
        eq(borradoresTarea.estudianteId, est.id),
      )),
    ).toHaveLength(0)
  })

  it('guardarBorradorTarea rechaza fuera de plazo, no inscrito y no-student', async () => {
    const vencida = await fixtures(new Date('2020-01-01'))
    currentUserId = vencida.est.id
    expect('error' in (await guardarBorradorTarea(vencida.asig.id, { '0': 'A' }))).toBe(true)

    const { prof, asig } = await fixtures()
    currentUserId = prof.id
    expect('error' in (await guardarBorradorTarea(asig.id, { '0': 'A' }))).toBe(true)

    const intruso = await crearUsuario('ent-intruso3', 'student')
    currentUserId = intruso.id
    expect('error' in (await guardarBorradorTarea(asig.id, { '0': 'A' }))).toBe(true)
  })

  it.runIf(hasBlobConfig)(
    'guardarDibujoTarea sube el dibujo al borrador y entregar lo copia a la entrega',
    async () => {
      const { est, asig } = await fixtures()
      currentUserId = est.id

      const fd = new FormData()
      fd.append('imagen', pngDePrueba())
      const subida = await guardarDibujoTarea(asig.id, 1, fd)
      expect(subida).toMatchObject({ ok: true })
      if (!('key' in subida)) return

      const enBorrador = await cargarTareaParaEstudiante(asig.id, est.id)
      if (enBorrador && !enBorrador.entregada) {
        expect(enBorrador.dibujos['1']).toBe(subida.key)
      } else {
        throw new Error('esperaba una tarea sin entregar')
      }

      await entregarTarea(asig.id, { '0': 'B' })
      const entregada = await cargarTareaParaEstudiante(asig.id, est.id)
      if (entregada?.entregada) {
        expect(entregada.dibujos['1']).toBe(subida.key)
      } else {
        throw new Error('esperaba una tarea entregada')
      }
    },
  )

  it.runIf(hasBlobConfig)('guardarDibujoTarea reemplaza el dibujo anterior de la misma pregunta', async () => {
    const { est, asig } = await fixtures()
    currentUserId = est.id

    const fd1 = new FormData()
    fd1.append('imagen', pngDePrueba())
    const primero = await guardarDibujoTarea(asig.id, 1, fd1)
    expect(primero).toMatchObject({ ok: true })

    const fd2 = new FormData()
    fd2.append('imagen', pngDePrueba())
    const segundo = await guardarDibujoTarea(asig.id, 1, fd2)
    expect(segundo).toMatchObject({ ok: true })
    if (!('key' in primero) || !('key' in segundo)) return
    expect(segundo.key).not.toBe(primero.key)

    const [fila] = await db.select().from(borradoresTarea).where(and(
      eq(borradoresTarea.asignacionId, asig.id),
      eq(borradoresTarea.estudianteId, est.id),
    ))
    expect(fila.dibujos).toEqual({ '1': segundo.key })
  })

  it.runIf(hasBlobConfig)('guardarDibujoTarea rechaza pregunta fuera de rango, fuera de plazo y no-student', async () => {
    const { prof, est, asig } = await fixtures()
    currentUserId = est.id
    const fdFueraDeRango = new FormData()
    fdFueraDeRango.append('imagen', pngDePrueba())
    expect('error' in (await guardarDibujoTarea(asig.id, 99, fdFueraDeRango))).toBe(true)

    const vencida = await fixtures(new Date('2020-01-01'))
    currentUserId = vencida.est.id
    const fdVencida = new FormData()
    fdVencida.append('imagen', pngDePrueba())
    expect('error' in (await guardarDibujoTarea(vencida.asig.id, 1, fdVencida))).toBe(true)

    currentUserId = prof.id
    const fdProfesor = new FormData()
    fdProfesor.append('imagen', pngDePrueba())
    expect('error' in (await guardarDibujoTarea(asig.id, 1, fdProfesor))).toBe(true)
  })

  it('rechaza no-student (profesor)', async () => {
    const { prof, asig } = await fixtures()
    currentUserId = prof.id
    const res = await entregarTarea(asig.id, { '0': 'B' })
    expect('error' in res).toBe(true)
    // Verifica que no se guardó entrega
    const entregasGuardadas = await db.select().from(entregas).where(eq(entregas.asignacionId, asig.id))
    expect(entregasGuardadas).toHaveLength(0)
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
