import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { usuarios, cursos, inscripciones, asignaciones, entregas } from '@/lib/db/schema'
import { cargarResultados, listarAsignacionesDeCurso } from '@/lib/queries/resultados'
import type { ContenidoAsignacion } from '@/lib/tareas/contenido'

async function crearUsuario(prefijo: string, role = 'teacher') {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db.insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x', role }).returning()
  return u
}

const CONTENIDO: ContenidoAsignacion = { textos: [], preguntas: [] }

describe('resultados del profesor (contra Postgres)', () => {
  it('una fila por alumno; entrega null = pendiente; solo el dueño ve', async () => {
    const prof = await crearUsuario('res-prof')
    const otro = await crearUsuario('res-otro')
    const e1 = await crearUsuario('res-e1', 'student')
    const e2 = await crearUsuario('res-e2', 'student')
    const [curso] = await db.insert(cursos)
      .values({ userId: prof.id, nombre: '8°A', joinCode: `jc-${Date.now()}-${Math.random()}` })
      .returning()
    await db.insert(inscripciones).values([
      { cursoId: curso.id, estudianteId: e1.id },
      { cursoId: curso.id, estudianteId: e2.id },
    ])
    const [asig] = await db.insert(asignaciones)
      .values({ cursoId: curso.id, pruebaId: 1, titulo: 'T', contenido: CONTENIDO })
      .returning()
    await db.insert(entregas).values({
      asignacionId: asig.id, estudianteId: e1.id,
      respuestas: { '0': 'A' }, puntaje: 3, total: 5,
    })

    const res = await cargarResultados(asig.id, prof.id)
    expect(res?.filas).toHaveLength(2)
    const porId = new Map(res!.filas.map((f) => [f.estudianteId, f]))
    expect(porId.get(e1.id)?.entrega?.puntaje).toBe(3)
    expect(porId.get(e2.id)?.entrega).toBeNull()

    expect(await cargarResultados(asig.id, otro.id)).toBeNull()

    const lista = await listarAsignacionesDeCurso(curso.id, prof.id)
    expect(lista).toHaveLength(1)
    expect(lista[0].nEntregas).toBe(1)
    expect(lista[0].nAlumnos).toBe(2)
    expect(await listarAsignacionesDeCurso(curso.id, otro.id)).toEqual([])
  })
})
