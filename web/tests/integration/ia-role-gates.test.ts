import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// Task 9: gates de rol en las herramientas de IA. Un student nunca debe poder
// gastar cupo/tokens de IA ni guardar lo generado, sin importar si llega por
// la UI (bloqueada por (app)/layout.tsx) o llamando el endpoint/action
// directamente. Mismo mock de sesión que tests/integration/auth-roles.test.ts
// y borradores-importacion.test.ts: getActor (que consumen los tres entry
// points de abajo) resuelve la identidad vía getSession(); `currentUserId`
// controla el actor simulado.
// ---------------------------------------------------------------------------

let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))

const { POST: postGenerar } = await import('@/app/api/generar/route')
const { POST: postImportar } = await import('@/app/api/importar/route')
const { guardarPreguntasImportadas } = await import('@/lib/actions/import')

function uniqEmail(p: string) {
  return `${p}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
}

async function crearUsuario(prefijo: string, role: 'teacher' | 'student') {
  const email = uniqEmail(prefijo)
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x', role })
    .returning()
  return u
}

beforeEach(() => {
  currentUserId = 0
})

describe('gates de rol IA: student rechazado en /generar, /importar y guardarPreguntasImportadas', () => {
  it('POST /api/generar responde 403 para un student (antes de leer el body o gastar cupo)', async () => {
    const student = await crearUsuario('gen-student', 'student')
    currentUserId = student.id

    // Sin body: si el gate no cortara antes, request.json() fallaría con otro
    // error — la ruta debe rechazar por rol sin llegar a leerlo.
    const res = await postGenerar(
      new Request('http://test.local/api/generar', { method: 'POST' }),
    )
    expect(res.status).toBe(403)
  })

  it('un teacher SÍ pasa el gate de rol de /api/generar (llega a leer el body)', async () => {
    const teacher = await crearUsuario('gen-teacher', 'teacher')
    currentUserId = teacher.id

    // Body vacío/ inválido: pasado el gate de rol, la ruta cae en el branch de
    // "parámetros no válidos" (200 con {resultado:{ok:false}}), NUNCA 403 ni
    // 401 — confirma que el 403 de arriba es específico del rol student.
    const res = await postGenerar(
      new Request('http://test.local/api/generar', {
        method: 'POST',
        body: 'not json',
      }),
    )
    expect(res.status).not.toBe(403)
    expect(res.status).not.toBe(401)
  })

  it('POST /api/importar responde 403 para un student (antes de leer el form o gastar cupo)', async () => {
    const student = await crearUsuario('imp-student', 'student')
    currentUserId = student.id

    const res = await postImportar(
      new Request('http://test.local/api/importar', { method: 'POST' }),
    )
    expect(res.status).toBe(403)
  })

  it('sin sesión, /api/generar y /api/importar responden 401 (no 403: no se filtra el rol)', async () => {
    currentUserId = 0
    const resGenerar = await postGenerar(
      new Request('http://test.local/api/generar', { method: 'POST' }),
    )
    const resImportar = await postImportar(
      new Request('http://test.local/api/importar', { method: 'POST' }),
    )
    expect(resGenerar.status).toBe(401)
    expect(resImportar.status).toBe(401)
  })

  it('guardarPreguntasImportadas devuelve {ok:false} para un student, sin llegar a guardar nada', async () => {
    const student = await crearUsuario('guardar-student', 'student')
    currentUserId = student.id

    const resultado = await guardarPreguntasImportadas({
      asignatura: 'Matemática',
      origen: 'ia',
      preguntas: [],
    })
    expect(resultado).toEqual({ ok: false, error: 'No autorizado.' })
  })

  it('guardarPreguntasImportadas sin sesión devuelve el error de login (no el de rol)', async () => {
    currentUserId = 0
    const resultado = await guardarPreguntasImportadas({
      asignatura: 'Matemática',
      origen: 'ia',
      preguntas: [],
    })
    expect(resultado).toEqual({ ok: false, error: 'Debes iniciar sesión.' })
  })
})
