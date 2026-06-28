import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, colegios } from '@/lib/db/schema'

// getActor/requireActor/requireRole dependen de getSession (cookies/headers de
// una request Next, ausentes en vitest) y de redirect (next/navigation). Los
// mockeamos. `currentUserId` controla la sesión simulada para los helpers.
// El `auth` real (better-auth) NO usa get-session, así que mockearlo no afecta
// a signUp/signIn/listUsers, que reciben headers explícitos.
let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

const { auth } = await import('@/lib/auth')
const { getActor, requireActor, requireRole, esGlobalAdmin, esAdminDeColegio } =
  await import('@/lib/authz')

function uniqEmail(p: string) {
  return `${p}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
}

// Convierte los Set-Cookie de un signIn en un header Cookie de request.
function cookieDe(headers: Headers): Headers {
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  return new Headers({ cookie })
}

beforeEach(() => {
  currentUserId = 0
})

describe('auth roles + admin plugin (Parte C.2)', () => {
  it('signUp crea usuario con role=teacher por defecto y lo expone en la sesión', async () => {
    const email = uniqEmail('teacher')
    const signUp = await auth.api.signUpEmail({
      body: { name: 'Profe Nuevo', email, password: 'Sup3rClave!' },
    })
    expect(signUp.user?.id).toBeTruthy()

    const userId = Number(signUp.user.id)
    const [row] = await db.select().from(usuarios).where(eq(usuarios.id, userId))
    expect(row.role).toBe('teacher')

    // El plugin admin expone `role` en el user de la sesión (server components).
    expect((signUp.user as { role?: string }).role).toBe('teacher')
  })

  it('signIn sigue funcionando tras añadir el plugin admin (no rompe auth previa)', async () => {
    const email = uniqEmail('signin')
    const password = 'Sup3rClave!'
    await auth.api.signUpEmail({ body: { name: 'Login User', email, password } })

    const signIn = await auth.api.signInEmail({ body: { email, password } })
    expect(signIn.token).toBeTruthy()
  })

  it('un global_admin es reconocido como admin (listUsers OK); un teacher NO (FORBIDDEN)', async () => {
    const password = 'Sup3rClave!'

    // Admin: signUp (nace teacher) + promoción a global_admin en la BD.
    const adminEmail = uniqEmail('admin')
    const su = await auth.api.signUpEmail({
      body: { name: 'Admin Global', email: adminEmail, password },
    })
    const adminId = Number(su.user.id)
    await db
      .update(usuarios)
      .set({ role: 'global_admin' })
      .where(eq(usuarios.id, adminId))

    const adminSignIn = await auth.api.signInEmail({
      body: { email: adminEmail, password },
      returnHeaders: true,
    })
    const lista = await auth.api.listUsers({
      query: { limit: 1 },
      headers: cookieDe(adminSignIn.headers),
    })
    expect(Array.isArray(lista.users)).toBe(true)

    // Teacher: listUsers debe ser rechazado (sin permiso 'user:list').
    const teacherEmail = uniqEmail('teach')
    await auth.api.signUpEmail({
      body: { name: 'Profe', email: teacherEmail, password },
    })
    const teacherSignIn = await auth.api.signInEmail({
      body: { email: teacherEmail, password },
      returnHeaders: true,
    })
    await expect(
      auth.api.listUsers({
        query: { limit: 1 },
        headers: cookieDe(teacherSignIn.headers),
      }),
    ).rejects.toThrow()
  })

  it('getActor devuelve role/colegioId correctos desde la fila de usuarios', async () => {
    const joinCode = `JZ-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const [c] = await db
      .insert(colegios)
      .values({ nombre: 'Colegio Actor', joinCode })
      .returning()

    const email = uniqEmail('actor')
    const [u] = await db
      .insert(usuarios)
      .values({
        nombre: 'Actor Test',
        email,
        passwordHash: 'x',
        role: 'school_admin',
        colegioId: c.id,
      })
      .returning()

    currentUserId = u.id
    const actor = await getActor()
    expect(actor).not.toBeNull()
    expect(actor!.userId).toBe(u.id)
    expect(actor!.role).toBe('school_admin')
    expect(actor!.colegioId).toBe(c.id)
    expect(actor!.email).toBe(email)
    expect(actor!.nombre).toBe('Actor Test')

    // Helpers de rol.
    expect(esGlobalAdmin(actor)).toBe(false)
    expect(esAdminDeColegio(actor, c.id)).toBe(true)
    expect(esAdminDeColegio(actor, c.id + 1)).toBe(false)
  })

  it('getActor devuelve null sin sesión', async () => {
    currentUserId = 0
    expect(await getActor()).toBeNull()
  })

  it('requireActor redirige a /login sin sesión; requireRole exige el rol', async () => {
    currentUserId = 0
    await expect(requireActor()).rejects.toThrow('REDIRECT:/login')

    const email = uniqEmail('reqrole')
    const [u] = await db
      .insert(usuarios)
      .values({ nombre: 'Req Role', email, passwordHash: 'x' })
      .returning()
    currentUserId = u.id

    // Rol permitido: devuelve el actor.
    const actor = await requireRole(['teacher'])
    expect(actor.userId).toBe(u.id)

    // Rol no permitido: redirige a "/".
    await expect(requireRole(['global_admin'])).rejects.toThrow('REDIRECT:/')
  })
})
