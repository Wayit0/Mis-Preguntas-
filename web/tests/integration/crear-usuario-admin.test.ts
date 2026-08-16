import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { accounts, colegios, usuarios } from '@/lib/db/schema'
import { verifyPw } from '@/lib/auth-password'

// Mismo esquema de mocks que admin.test.ts: get-session controlado por
// currentUserId, revalidatePath inerte y redirect que lanza (para afirmar el
// guard de requireRole).
let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

const { crearUsuario } = await import('@/lib/actions/admin')

function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function crearActor(role: string) {
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: role, email: `${uniq(role)}@x.cl`, passwordHash: 'x', role })
    .returning()
  return u
}

beforeEach(() => {
  currentUserId = 0
})

describe('crearUsuario desde el admin (contra Postgres)', () => {
  it('crea la cuenta con rol y colegio, y la contraseña queda usable', async () => {
    const admin = await crearActor('global_admin')
    const [colegio] = await db
      .insert(colegios)
      .values({ nombre: 'Colegio Test', joinCode: uniq('jc') })
      .returning()

    currentUserId = admin.id
    const email = `${uniq('nuevo')}@x.cl`
    const res = await crearUsuario({
      nombre: 'Profe Nueva',
      email,
      password: 'secreta1',
      role: 'teacher',
      colegioId: colegio.id,
    })
    expect(res).toEqual({ ok: true })

    const [fila] = await db.select().from(usuarios).where(eq(usuarios.email, email))
    expect(fila.nombre).toBe('Profe Nueva')
    expect(fila.role).toBe('teacher')
    expect(fila.colegioId).toBe(colegio.id)

    // La contraseña vive en accounts.password (better-auth) y debe verificar.
    const [cuenta] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, fila.id))
    expect(cuenta?.password).toBeTruthy()
    expect(await verifyPw({ hash: cuenta.password!, password: 'secreta1' })).toBe(true)
  })

  it('crea estudiantes (rol student) sin colegio', async () => {
    const admin = await crearActor('global_admin')
    currentUserId = admin.id
    const email = `${uniq('alumno')}@x.cl`
    const res = await crearUsuario({
      nombre: 'Alumno',
      email,
      password: 'secreta1',
      role: 'student',
      colegioId: null,
    })
    expect(res).toEqual({ ok: true })
    const [fila] = await db.select().from(usuarios).where(eq(usuarios.email, email))
    expect(fila.role).toBe('student')
    expect(fila.colegioId).toBeNull()
  })

  it('rechaza email duplicado con mensaje amigable', async () => {
    const admin = await crearActor('global_admin')
    const existente = await crearActor('teacher')
    currentUserId = admin.id
    const res = await crearUsuario({
      nombre: 'Repetido',
      email: existente.email,
      password: 'secreta1',
      role: 'teacher',
      colegioId: null,
    })
    expect('error' in res && /correo/i.test(res.error)).toBe(true)
  })

  it('rechaza rol global_admin y roles desconocidos', async () => {
    const admin = await crearActor('global_admin')
    currentUserId = admin.id
    for (const role of ['global_admin', 'superuser']) {
      const res = await crearUsuario({
        nombre: 'X',
        email: `${uniq('rolmalo')}@x.cl`,
        password: 'secreta1',
        role,
        colegioId: null,
      })
      expect('error' in res).toBe(true)
    }
  })

  it('rechaza colegio inexistente sin crear la cuenta', async () => {
    const admin = await crearActor('global_admin')
    currentUserId = admin.id
    const email = `${uniq('sincolegio')}@x.cl`
    const res = await crearUsuario({
      nombre: 'X',
      email,
      password: 'secreta1',
      role: 'teacher',
      colegioId: 99999999,
    })
    expect('error' in res).toBe(true)
    const filas = await db.select().from(usuarios).where(eq(usuarios.email, email))
    expect(filas).toHaveLength(0)
  })

  it('el guard de rol expulsa a un no-admin', async () => {
    const profe = await crearActor('teacher')
    currentUserId = profe.id
    await expect(
      crearUsuario({
        nombre: 'X',
        email: `${uniq('pirata')}@x.cl`,
        password: 'secreta1',
        role: 'teacher',
        colegioId: null,
      }),
    ).rejects.toThrow('REDIRECT:/')
  })
})
