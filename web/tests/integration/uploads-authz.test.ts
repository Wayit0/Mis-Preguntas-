import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import {
  usuarios,
  preguntas,
  colaboraciones,
  cursos,
  inscripciones,
  asignaciones,
} from '@/lib/db/schema'
import { puedeVerImagen } from '@/lib/queries/uploads'
import type { ContenidoAsignacion } from '@/lib/tareas/contenido'

// IDs y claves únicos para ser robustos contra la BD de prueba compartida.
const sello = Date.now()
const kPropia = `propia-${sello}.png`
const kCompartida = `compartida-${sello}.png`
const kDesconocida = `desconocida-${sello}.png`

let autor: number // crea preguntas (una privada, una compartida)
let colega: number // autor lo invitó como colaborador
let tercero: number // sin relación con autor

beforeAll(async () => {
  const [a] = await db
    .insert(usuarios)
    .values({ nombre: 'Autor', email: `autor-${sello}@x.cl`, passwordHash: 'x' })
    .returning()
  const [b] = await db
    .insert(usuarios)
    .values({ nombre: 'Colega', email: `colega-${sello}@x.cl`, passwordHash: 'x' })
    .returning()
  const [c] = await db
    .insert(usuarios)
    .values({ nombre: 'Tercero', email: `tercero-${sello}@x.cl`, passwordHash: 'x' })
    .returning()
  autor = a.id
  colega = b.id
  tercero = c.id

  // autor invita a colega (from=autor, to=colega) → semántica del banco compartido
  await db
    .insert(colaboraciones)
    .values({ fromUserId: autor, toUserId: colega })

  // pregunta privada del autor con imagen en el enunciado
  await db.insert(preguntas).values({
    userId: autor,
    asignatura: 'Física',
    pregunta: 'privada',
    compartida: 0,
    imagenPregunta: kPropia,
  })
  // pregunta compartida del autor con imagen en la alternativa A
  await db.insert(preguntas).values({
    userId: autor,
    asignatura: 'Física',
    pregunta: 'compartida',
    compartida: 1,
    imagenA: kCompartida,
  })
})

describe('puedeVerImagen: autorización por dueño/colaborador', () => {
  it('el dueño ve su propia imagen', async () => {
    expect(await puedeVerImagen(kPropia, autor)).toBe(true)
  })

  it('un colaborador NO ve una imagen privada (compartida=0) del autor', async () => {
    expect(await puedeVerImagen(kPropia, colega)).toBe(false)
  })

  it('un colaborador SÍ ve una imagen de una pregunta compartida', async () => {
    expect(await puedeVerImagen(kCompartida, colega)).toBe(true)
  })

  it('el dueño ve su propia imagen compartida', async () => {
    expect(await puedeVerImagen(kCompartida, autor)).toBe(true)
  })

  it('un tercero sin relación NO ve la imagen compartida', async () => {
    expect(await puedeVerImagen(kCompartida, tercero)).toBe(false)
  })

  it('una clave no referenciada por ninguna pregunta no es visible', async () => {
    expect(await puedeVerImagen(kDesconocida, autor)).toBe(false)
  })
})

describe('puedeVerImagen: snapshot de una asignación (Cursos y Tareas)', () => {
  const kTarea = `tarea-${sello}.png`

  let profesor: number
  let alumnoInscrito: number
  let alumnoSinInscribir: number
  let cursoId: number

  beforeAll(async () => {
    const [p] = await db
      .insert(usuarios)
      .values({ nombre: 'Profesor Tarea', email: `profe-tarea-${sello}@x.cl`, passwordHash: 'x', role: 'teacher' })
      .returning()
    const [e1] = await db
      .insert(usuarios)
      .values({ nombre: 'Alumno Inscrito', email: `alumno-in-${sello}@x.cl`, passwordHash: 'x', role: 'student' })
      .returning()
    const [e2] = await db
      .insert(usuarios)
      .values({ nombre: 'Alumno Sin Inscribir', email: `alumno-out-${sello}@x.cl`, passwordHash: 'x', role: 'student' })
      .returning()
    profesor = p.id
    alumnoInscrito = e1.id
    alumnoSinInscribir = e2.id

    const [curso] = await db
      .insert(cursos)
      .values({ userId: profesor, nombre: 'Curso Tarea', joinCode: `join-${sello}` })
      .returning()
    cursoId = curso.id

    await db.insert(inscripciones).values({ cursoId, estudianteId: alumnoInscrito })

    // Snapshot congelado que referencia kTarea en el enunciado de una pregunta
    // suelta. El resto de los campos son el mínimo válido de PreguntaSnapshot.
    const contenido: ContenidoAsignacion = {
      textos: [],
      preguntas: [
        {
          preguntaId: 999999,
          tipo: 'seleccion_multiple',
          enunciado: 'Pregunta con imagen',
          A: null,
          B: null,
          C: null,
          D: null,
          E: null,
          correcta: null,
          explicacion: null,
          imagenPregunta: kTarea,
          imagenA: null,
          imagenB: null,
          imagenC: null,
          imagenD: null,
          imagenE: null,
          imagenTamano: 'mediano',
        },
      ],
    }
    await db.insert(asignaciones).values({
      cursoId,
      pruebaId: 0,
      titulo: 'Asignación de prueba',
      contenido,
    })
  })

  it('un estudiante inscrito ve una imagen del snapshot de su tarea', async () => {
    expect(await puedeVerImagen(kTarea, alumnoInscrito)).toBe(true)
  })

  it('un estudiante NO inscrito no ve la imagen del snapshot', async () => {
    expect(await puedeVerImagen(kTarea, alumnoSinInscribir)).toBe(false)
  })

  it('el profesor dueño del curso ve la imagen del snapshot (incluso si la pregunta original ya no existe)', async () => {
    expect(await puedeVerImagen(kTarea, profesor)).toBe(true)
  })
})
