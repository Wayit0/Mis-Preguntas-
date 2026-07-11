import { describe, it, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colegios, preguntas, usuarios } from '@/lib/db/schema'

// Mismo patrón de mocks que colegio-admin.test.ts: getActor() lee getSession y
// las actions revalidan con revalidatePath; ambos requieren el runtime de Next.
let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { crearMiColegio } = await import('@/lib/actions/colegio')

function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function crearUsuario(opts: {
  role?: string
  colegioId?: number | null
} = {}) {
  const [u] = await db
    .insert(usuarios)
    .values({
      nombre: 'Profe',
      email: `${uniq('crear-colegio')}@x.cl`,
      passwordHash: 'x',
      role: opts.role ?? 'teacher',
      colegioId: opts.colegioId ?? null,
    })
    .returning()
  return u
}

describe('crearMiColegio (self-service)', () => {
  it('crea el colegio, deja al profesor como school_admin y adopta su contenido', async () => {
    const u = await crearUsuario()
    const [pregunta] = await db
      .insert(preguntas)
      .values({ userId: u.id, asignatura: 'Física', pregunta: '¿P?' })
      .returning()
    currentUserId = u.id

    const r = await crearMiColegio('  Colegio Nuevo  ')
    expect(r).toEqual({ ok: true })

    const [usuario] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, u.id))
    expect(usuario.role).toBe('school_admin')
    expect(usuario.colegioId).not.toBeNull()

    const [colegio] = await db
      .select()
      .from(colegios)
      .where(eq(colegios.id, usuario.colegioId!))
    expect(colegio.nombre).toBe('Colegio Nuevo')
    expect(colegio.joinCode.length).toBeGreaterThan(8)

    // Contenido personal adoptado al colegio nuevo.
    const [p] = await db
      .select()
      .from(preguntas)
      .where(eq(preguntas.id, pregunta.id))
    expect(p.colegioId).toBe(usuario.colegioId)
  })

  it('rechaza si ya pertenece a un colegio', async () => {
    const [c] = await db
      .insert(colegios)
      .values({ nombre: 'Existente', joinCode: uniq('JOIN') })
      .returning()
    const u = await crearUsuario({ colegioId: c.id })
    currentUserId = u.id

    const r = await crearMiColegio('Otro')
    expect(r).toEqual({ error: 'Ya perteneces a un colegio.' })
  })

  it('rechaza a un global_admin y un nombre vacío', async () => {
    const admin = await crearUsuario({ role: 'global_admin' })
    currentUserId = admin.id
    const r1 = await crearMiColegio('X')
    expect('error' in r1).toBe(true)

    const u = await crearUsuario()
    currentUserId = u.id
    const r2 = await crearMiColegio('   ')
    expect(r2).toEqual({ error: 'El nombre del colegio es obligatorio.' })
  })
})
