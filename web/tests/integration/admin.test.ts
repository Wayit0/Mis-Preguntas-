import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colegios, usuarios } from '@/lib/db/schema'

// Las actions de admin usan requireRole (getActor → getSession + redirect) y
// revalidatePath. Mockeamos get-session (controlado por currentUserId),
// next/cache y next/navigation (redirect lanza para poder afirmar el guard),
// igual que auth-roles.test.ts / colegio-admin.test.ts.
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

const {
  crearColegio,
  editarColegio,
  asignarRol,
  asignarColegio,
  designarAdminColegio,
} = await import('@/lib/actions/admin')
const { listarColegios, listarUsuarios } = await import('@/lib/queries/admin')

function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function crearUsuario(opts: {
  role?: string
  colegioId?: number | null
  prefijo?: string
}) {
  const prefijo = opts.prefijo ?? 'user'
  const [u] = await db
    .insert(usuarios)
    .values({
      nombre: prefijo,
      email: `${uniq(prefijo)}@x.cl`,
      passwordHash: 'x',
      role: opts.role ?? 'teacher',
      colegioId: opts.colegioId ?? null,
    })
    .returning()
  return u
}

async function leerUsuario(id: number) {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1)
  return u
}

beforeEach(() => {
  currentUserId = 0
})

describe('Administración global (Parte E.2)', () => {
  it('crearColegio genera un joinCode único y devuelve el colegio', async () => {
    const admin = await crearUsuario({ role: 'global_admin', prefijo: 'admin' })
    currentUserId = admin.id

    const r1 = await crearColegio('Colegio Uno')
    expect('ok' in r1 && r1.ok).toBe(true)
    const colegio = 'ok' in r1 ? r1.colegio : null
    expect(colegio?.nombre).toBe('Colegio Uno')
    expect(colegio?.joinCode).toBeTruthy()

    const r2 = await crearColegio('Colegio Dos')
    const colegio2 = 'ok' in r2 ? r2.colegio : null
    // joinCodes distintos.
    expect(colegio2?.joinCode).not.toBe(colegio?.joinCode)

    // Ambos aparecen en listarColegios con 0 profesores.
    const lista = await listarColegios()
    const ids = lista.map((c) => c.id)
    expect(ids).toContain(colegio!.id)
    const fila = lista.find((c) => c.id === colegio!.id)
    expect(fila?.profesores).toBe(0)
  })

  it('crearColegio rechaza nombre vacío', async () => {
    const admin = await crearUsuario({ role: 'global_admin', prefijo: 'admin' })
    currentUserId = admin.id
    const r = await crearColegio('   ')
    expect('error' in r).toBe(true)
  })

  it('editarColegio actualiza el nombre', async () => {
    const admin = await crearUsuario({ role: 'global_admin', prefijo: 'admin' })
    currentUserId = admin.id

    const creado = await crearColegio('Antiguo')
    const id = 'ok' in creado ? creado.colegio.id : 0

    const r = await editarColegio(id, 'Nuevo Nombre')
    expect('ok' in r && r.ok).toBe(true)

    const [c] = await db.select().from(colegios).where(eq(colegios.id, id))
    expect(c.nombre).toBe('Nuevo Nombre')
  })

  it('asignarRol cambia el rol y rechaza roles inválidos', async () => {
    const admin = await crearUsuario({ role: 'global_admin', prefijo: 'admin' })
    const profe = await crearUsuario({ role: 'teacher' })
    currentUserId = admin.id

    const ok = await asignarRol(profe.id, 'school_admin')
    expect('ok' in ok && ok.ok).toBe(true)
    expect((await leerUsuario(profe.id)).role).toBe('school_admin')

    const malo = await asignarRol(profe.id, 'super_root')
    expect('error' in malo).toBe(true)
    // Rol no cambió.
    expect((await leerUsuario(profe.id)).role).toBe('school_admin')
  })

  it('asignarColegio asocia y desasocia (null); rechaza colegio inexistente', async () => {
    const admin = await crearUsuario({ role: 'global_admin', prefijo: 'admin' })
    const profe = await crearUsuario({ role: 'teacher' })
    currentUserId = admin.id

    const creado = await crearColegio('Colegio Asignable')
    const colegioId = 'ok' in creado ? creado.colegio.id : 0

    const r1 = await asignarColegio(profe.id, colegioId)
    expect('ok' in r1 && r1.ok).toBe(true)
    expect((await leerUsuario(profe.id)).colegioId).toBe(colegioId)

    const r2 = await asignarColegio(profe.id, null)
    expect('ok' in r2 && r2.ok).toBe(true)
    expect((await leerUsuario(profe.id)).colegioId).toBeNull()

    const r3 = await asignarColegio(profe.id, 2_000_000_000)
    expect('error' in r3).toBe(true)
  })

  it('designarAdminColegio fija role=school_admin + colegio', async () => {
    const admin = await crearUsuario({ role: 'global_admin', prefijo: 'admin' })
    const profe = await crearUsuario({ role: 'teacher' })
    currentUserId = admin.id

    const creado = await crearColegio('Colegio Admin')
    const colegioId = 'ok' in creado ? creado.colegio.id : 0

    const r = await designarAdminColegio(profe.id, colegioId)
    expect('ok' in r && r.ok).toBe(true)

    const u = await leerUsuario(profe.id)
    expect(u.role).toBe('school_admin')
    expect(u.colegioId).toBe(colegioId)
  })

  it('listarUsuarios incluye rol y nombre de colegio', async () => {
    const admin = await crearUsuario({ role: 'global_admin', prefijo: 'admin' })
    currentUserId = admin.id

    const creado = await crearColegio('Colegio Lista')
    const colegioId = 'ok' in creado ? creado.colegio.id : 0
    const profe = await crearUsuario({
      role: 'school_admin',
      colegioId,
      prefijo: 'profe',
    })

    const lista = await listarUsuarios()
    const fila = lista.find((u) => u.id === profe.id)
    expect(fila?.role).toBe('school_admin')
    expect(fila?.colegioNombre).toBe('Colegio Lista')
  })

  it('un teacher NO puede usar las actions de admin (guard requireRole redirige)', async () => {
    const teacher = await crearUsuario({ role: 'teacher' })
    currentUserId = teacher.id

    await expect(crearColegio('Hack')).rejects.toThrow('REDIRECT:/')
    await expect(asignarRol(teacher.id, 'global_admin')).rejects.toThrow(
      'REDIRECT:/',
    )
    await expect(asignarColegio(teacher.id, null)).rejects.toThrow('REDIRECT:/')
    await expect(designarAdminColegio(teacher.id, 1)).rejects.toThrow(
      'REDIRECT:/',
    )

    // No se promovió a sí mismo.
    expect((await leerUsuario(teacher.id)).role).toBe('teacher')
  })

  it('sin sesión, las actions de admin redirigen a /login', async () => {
    currentUserId = 0
    await expect(crearColegio('X')).rejects.toThrow('REDIRECT:/login')
  })
})
