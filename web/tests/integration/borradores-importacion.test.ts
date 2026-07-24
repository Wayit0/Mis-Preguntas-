import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, borradoresImportacion } from '@/lib/db/schema'

// Las server actions (Task 3) resuelven identidad con getSession(); se mockea
// igual que en carpetas.test.ts. Los helpers de este task no usan sesión.
let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const {
  crearBorrador,
  listarBorradores,
  MAX_BORRADORES_POR_USUARIO,
} = await import('@/lib/import/borradores')

const {
  obtenerBorradorImportacion,
  actualizarBorradorImportacion,
  descartarBorradorImportacion,
} = await import('@/lib/actions/borradores-importacion')

async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

/** ResultadoBorrador mínimo válido (sin imágenes, 1 pregunta). */
function resultadoMinimo(n = 1) {
  return {
    preguntas: Array.from({ length: n }, (_, i) => ({
      pregunta: `¿Pregunta ${i}?`,
      tipo: 'seleccion_multiple' as const,
    })),
    imagenes: [],
  }
}

/** Una PreguntaEditableBorrador válida mínima. */
function preguntaEditable(texto: string) {
  const sinImagen = null
  return {
    id: 'det-0',
    incluir: true,
    pregunta: texto,
    A: 'a', B: 'b', C: 'c', D: 'd', E: '',
    correcta: 'A',
    explicacion: '',
    materia: '',
    nivel: '',
    tipo: 'seleccion_multiple' as const,
    imagenPregunta: sinImagen, imagenPreguntaOriginal: sinImagen,
    imagenA: sinImagen, imagenAOriginal: sinImagen,
    imagenB: sinImagen, imagenBOriginal: sinImagen,
    imagenC: sinImagen, imagenCOriginal: sinImagen,
    imagenD: sinImagen, imagenDOriginal: sinImagen,
    imagenE: sinImagen, imagenEOriginal: sinImagen,
  }
}

beforeEach(() => {
  currentUserId = 0
})

describe('lib/import/borradores (crear, listar, retención)', () => {
  it('crea un borrador y lo lista con numPreguntas del resultado', async () => {
    const u = await crearUsuario('borr')
    const id = await crearBorrador(u.id, {
      asignatura: 'Física',
      nombreArchivo: 'prueba.docx',
      resultado: resultadoMinimo(3),
    })
    expect(id).toBeGreaterThan(0)

    const lista = await listarBorradores(u.id)
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({
      id,
      nombreArchivo: 'prueba.docx',
      asignatura: 'Física',
      numPreguntas: 3,
    })
    expect(new Date(lista[0].actualizadoEn).getTime()).not.toBeNaN()
  })

  it('tope por usuario: al crear el 11º elimina el más antiguo por updatedAt', async () => {
    const u = await crearUsuario('borr-tope')
    // 10 borradores con updatedAt escalonado (el id=primero es el más viejo).
    const ids: number[] = []
    for (let i = 0; i < MAX_BORRADORES_POR_USUARIO; i++) {
      const [fila] = await db
        .insert(borradoresImportacion)
        .values({
          userId: u.id,
          asignatura: 'Física',
          nombreArchivo: `doc-${i}.docx`,
          resultado: resultadoMinimo(),
          updatedAt: new Date(Date.now() - (100 - i) * 60_000),
        })
        .returning({ id: borradoresImportacion.id })
      ids.push(fila.id)
    }

    await crearBorrador(u.id, {
      asignatura: 'Física',
      nombreArchivo: 'nuevo.docx',
      resultado: resultadoMinimo(),
    })

    const lista = await listarBorradores(u.id)
    expect(lista).toHaveLength(MAX_BORRADORES_POR_USUARIO)
    // El más antiguo (ids[0]) ya no está; el nuevo sí.
    expect(lista.map((b) => b.id)).not.toContain(ids[0])
    expect(lista.map((b) => b.nombreArchivo)).toContain('nuevo.docx')
  })

  it('limpieza perezosa: un borrador con updatedAt de hace 31 días desaparece al listar', async () => {
    const u = await crearUsuario('borr-exp')
    await db.insert(borradoresImportacion).values({
      userId: u.id,
      asignatura: 'Física',
      nombreArchivo: 'viejo.docx',
      resultado: resultadoMinimo(),
      updatedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    })

    const lista = await listarBorradores(u.id)
    expect(lista).toHaveLength(0)
    const filas = await db
      .select()
      .from(borradoresImportacion)
      .where(eq(borradoresImportacion.userId, u.id))
    expect(filas).toHaveLength(0)
  })

  it('listar sólo devuelve los borradores del usuario', async () => {
    const a = await crearUsuario('borr-a')
    const b = await crearUsuario('borr-b')
    await crearBorrador(a.id, {
      asignatura: 'Física',
      nombreArchivo: 'de-a.docx',
      resultado: resultadoMinimo(),
    })
    expect(await listarBorradores(b.id)).toHaveLength(0)
  })
})

describe('actions/borradores-importacion (sesión + pertenencia)', () => {
  it('actualiza la edición y obtener la devuelve; numPreguntas cuenta la edición', async () => {
    const u = await crearUsuario('borr-act')
    currentUserId = u.id
    const id = await crearBorrador(u.id, {
      asignatura: 'Física',
      nombreArchivo: 'doc.docx',
      resultado: resultadoMinimo(3),
    })

    const upd = await actualizarBorradorImportacion(id, [
      preguntaEditable('editada 1'),
      preguntaEditable('editada 2'),
    ])
    expect(upd.ok).toBe(true)

    const res = await obtenerBorradorImportacion(id)
    if (!res.ok) throw new Error(res.error)
    expect(res.borrador.edicion).toHaveLength(2)
    expect(res.borrador.edicion?.[0].pregunta).toBe('editada 1')
    expect(res.borrador.resultado.preguntas).toHaveLength(3)

    const lista = await listarBorradores(u.id)
    expect(lista[0].numPreguntas).toBe(2)
  })

  it('rechaza una edición malformada sin guardar nada', async () => {
    const u = await crearUsuario('borr-mal')
    currentUserId = u.id
    const id = await crearBorrador(u.id, {
      asignatura: 'Física',
      nombreArchivo: 'doc.docx',
      resultado: resultadoMinimo(),
    })

    const upd = await actualizarBorradorImportacion(id, [{ pregunta: 'sin campos' }])
    expect(upd.ok).toBe(false)

    const res = await obtenerBorradorImportacion(id)
    if (!res.ok) throw new Error(res.error)
    expect(res.borrador.edicion).toBeNull()
  })

  it('un usuario no puede obtener/actualizar/descartar borradores ajenos', async () => {
    const a = await crearUsuario('borr-own-a')
    const b = await crearUsuario('borr-own-b')
    const id = await crearBorrador(a.id, {
      asignatura: 'Física',
      nombreArchivo: 'de-a.docx',
      resultado: resultadoMinimo(),
    })

    currentUserId = b.id
    expect((await obtenerBorradorImportacion(id)).ok).toBe(false)
    expect((await actualizarBorradorImportacion(id, [preguntaEditable('x')])).ok).toBe(false)
    expect((await descartarBorradorImportacion(id)).ok).toBe(false)

    // El de A sigue intacto.
    currentUserId = a.id
    expect((await obtenerBorradorImportacion(id)).ok).toBe(true)
  })

  it('descartar elimina el borrador; sin sesión todo falla', async () => {
    const u = await crearUsuario('borr-del')
    currentUserId = u.id
    const id = await crearBorrador(u.id, {
      asignatura: 'Física',
      nombreArchivo: 'doc.docx',
      resultado: resultadoMinimo(),
    })
    expect((await descartarBorradorImportacion(id)).ok).toBe(true)
    expect((await obtenerBorradorImportacion(id)).ok).toBe(false)

    currentUserId = 0
    expect((await obtenerBorradorImportacion(id)).ok).toBe(false)
    expect((await actualizarBorradorImportacion(id, [])).ok).toBe(false)
    expect((await descartarBorradorImportacion(id)).ok).toBe(false)
  })
})
