import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'

// `guardarPrueba` resuelve la identidad con getSession() y revalida con
// revalidatePath(); ambas dependen del contexto de una petición Next que no
// existe en vitest. Mismo patrón de mocks que textos.test.ts.
let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}))

const { guardarPrueba } = await import('@/lib/actions/pruebas')
const { instruccionesDefaultDeUsuario } = await import('@/lib/queries/pruebas')

async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

function formDataPrueba(instrucciones: string): FormData {
  const fd = new FormData()
  fd.set('asignatura', 'Física')
  fd.set('titulo', 'Prueba 1')
  fd.set('colegio', '')
  fd.set('profesor', 'Profe')
  fd.set('instrucciones', instrucciones)
  return fd
}

beforeEach(() => {
  currentUserId = 0
})

describe('instrucciones por defecto (se guardan solas al guardar una prueba)', () => {
  it('guardar una prueba con instrucciones actualiza el default del usuario', async () => {
    const u = await crearUsuario('instr-guardar')
    currentUserId = u.id

    expect(await instruccionesDefaultDeUsuario(u.id)).toBeNull()

    const res = await guardarPrueba(formDataPrueba('Responde con lápiz pasta.'))
    expect('id' in res).toBe(true)

    expect(await instruccionesDefaultDeUsuario(u.id)).toBe(
      'Responde con lápiz pasta.',
    )
  })

  it('guardar una prueba SIN instrucciones no borra el default previo', async () => {
    const u = await crearUsuario('instr-conservar')
    currentUserId = u.id

    await guardarPrueba(formDataPrueba('Instrucciones originales.'))
    await guardarPrueba(formDataPrueba(''))

    expect(await instruccionesDefaultDeUsuario(u.id)).toBe(
      'Instrucciones originales.',
    )
  })
})
