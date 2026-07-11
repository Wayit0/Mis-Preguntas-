import { describe, it, expect, vi, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  colegios,
  invitacionesColegio,
  preguntas,
  usuarios,
} from '@/lib/db/schema'

// Las server actions usan getActor() (que lee getSession) y revalidatePath de
// next/cache. Ambos dependen del runtime de Next (cookies/headers, cache de
// request), ausentes en vitest. Los mockeamos como en auth-roles.test.ts.
// `currentUserId` controla la sesión simulada para getActor().
let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const {
  joinByCode,
  invitarPorEmail,
  aceptarInvitacion,
  quitarProfesor,
  configurarColegio,
  regenerarCodigo,
} = await import('@/lib/actions/colegio')
const { editarPreguntaColegio, eliminarPreguntaColegio } = await import(
  '@/lib/actions/banco-colegio'
)
const { listarProfesores, listarBancoColegio } = await import(
  '@/lib/queries/colegio'
)

function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function crearColegio(nombre = 'Colegio') {
  const [c] = await db
    .insert(colegios)
    .values({ nombre, joinCode: uniq('JOIN') })
    .returning()
  return c
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

async function colegioIdDe(userId: number): Promise<number | null> {
  const [u] = await db
    .select({ colegioId: usuarios.colegioId })
    .from(usuarios)
    .where(eq(usuarios.id, userId))
    .limit(1)
  return u?.colegioId ?? null
}

function fd(campos: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(campos)) f.set(k, v)
  return f
}

function preguntaValida(extra: Record<string, string> = {}): FormData {
  return fd({
    asignatura: 'Matemática',
    pregunta: '¿Cuánto es 2+2?',
    tipo: 'seleccion_multiple',
    A: '3',
    B: '4',
    C: '5',
    D: '6',
    correcta: 'B',
    compartida: '0',
    ...extra,
  })
}

beforeEach(() => {
  currentUserId = 0
})

describe('Admin de colegio (Parte E.1)', () => {
  it('joinByCode asocia al profesor al colegio (idempotente)', async () => {
    const colegio = await crearColegio()
    const profe = await crearUsuario({ role: 'teacher' })
    currentUserId = profe.id

    const [code] = await db
      .select({ joinCode: colegios.joinCode })
      .from(colegios)
      .where(eq(colegios.id, colegio.id))

    const r1 = await joinByCode(code.joinCode)
    expect('ok' in r1 && r1.ok).toBe(true)
    expect(await colegioIdDe(profe.id)).toBe(colegio.id)

    // Idempotente: volver a unirse con el mismo código no falla.
    const r2 = await joinByCode(code.joinCode)
    expect('ok' in r2 && r2.ok).toBe(true)
    expect(await colegioIdDe(profe.id)).toBe(colegio.id)
  })

  it('joinByCode rechaza código inválido y a quien ya tiene otro colegio', async () => {
    const colegioA = await crearColegio('A')
    const colegioB = await crearColegio('B')
    const profe = await crearUsuario({ role: 'teacher', colegioId: colegioA.id })
    currentUserId = profe.id

    const rInvalido = await joinByCode('no-existe-xyz')
    expect('error' in rInvalido).toBe(true)

    const [codeB] = await db
      .select({ joinCode: colegios.joinCode })
      .from(colegios)
      .where(eq(colegios.id, colegioB.id))
    const rOtro = await joinByCode(codeB.joinCode)
    expect('error' in rOtro).toBe(true)
    // Sigue en su colegio original.
    expect(await colegioIdDe(profe.id)).toBe(colegioA.id)
  })

  it('invitar por email + aceptar asocia al invitado', async () => {
    const colegio = await crearColegio()
    const admin = await crearUsuario({
      role: 'school_admin',
      colegioId: colegio.id,
    })
    const invitado = await crearUsuario({ role: 'teacher' })

    // Admin invita.
    currentUserId = admin.id
    const rInv = await invitarPorEmail(invitado.email)
    expect('ok' in rInv && rInv.ok).toBe(true)

    const [inv] = await db
      .select()
      .from(invitacionesColegio)
      .where(
        and(
          eq(invitacionesColegio.colegioId, colegio.id),
          eq(invitacionesColegio.email, invitado.email.toLowerCase()),
        ),
      )
    expect(inv.estado).toBe('pendiente')

    // Invitado acepta.
    currentUserId = invitado.id
    const rAcc = await aceptarInvitacion(inv.token)
    expect('ok' in rAcc && rAcc.ok).toBe(true)
    expect(await colegioIdDe(invitado.id)).toBe(colegio.id)

    const [actualizada] = await db
      .select()
      .from(invitacionesColegio)
      .where(eq(invitacionesColegio.id, inv.id))
    expect(actualizada.estado).toBe('aceptada')
  })

  it('no se puede aceptar una invitación dirigida a otro email', async () => {
    const colegio = await crearColegio()
    const admin = await crearUsuario({
      role: 'school_admin',
      colegioId: colegio.id,
    })
    const otro = await crearUsuario({ role: 'teacher' })

    currentUserId = admin.id
    await invitarPorEmail('alguien-mas@x.cl')
    const [inv] = await db
      .select()
      .from(invitacionesColegio)
      .where(eq(invitacionesColegio.email, 'alguien-mas@x.cl'))

    currentUserId = otro.id
    const r = await aceptarInvitacion(inv.token)
    expect('error' in r).toBe(true)
    expect(await colegioIdDe(otro.id)).toBeNull()
  })

  it('quitarProfesor desasocia a un profe del colegio del admin', async () => {
    const colegio = await crearColegio()
    const admin = await crearUsuario({
      role: 'school_admin',
      colegioId: colegio.id,
    })
    const profe = await crearUsuario({
      role: 'teacher',
      colegioId: colegio.id,
    })

    currentUserId = admin.id
    const profes = await listarProfesores(colegio.id)
    expect(profes.map((p) => p.id)).toContain(profe.id)

    const r = await quitarProfesor(profe.id)
    expect('ok' in r && r.ok).toBe(true)
    expect(await colegioIdDe(profe.id)).toBeNull()
  })

  it('el único school_admin no puede quitarse a sí mismo', async () => {
    const colegio = await crearColegio()
    const admin = await crearUsuario({
      role: 'school_admin',
      colegioId: colegio.id,
    })
    currentUserId = admin.id

    const r = await quitarProfesor(admin.id)
    expect('error' in r).toBe(true)
    expect(await colegioIdDe(admin.id)).toBe(colegio.id)
  })

  it('un teacher NO puede invitar, quitar ni configurar (guard de rol)', async () => {
    const colegio = await crearColegio()
    const teacher = await crearUsuario({
      role: 'teacher',
      colegioId: colegio.id,
    })
    const otroProfe = await crearUsuario({
      role: 'teacher',
      colegioId: colegio.id,
    })
    currentUserId = teacher.id

    expect('error' in (await invitarPorEmail('x@x.cl'))).toBe(true)
    expect('error' in (await quitarProfesor(otroProfe.id))).toBe(true)
    expect('error' in (await configurarColegio(fd({ nombre: 'Hack' })))).toBe(
      true,
    )
    expect('error' in (await regenerarCodigo())).toBe(true)

    // El otro profe sigue en el colegio (no fue quitado).
    expect(await colegioIdDe(otroProfe.id)).toBe(colegio.id)
  })

  it('un school_admin NO puede actuar sobre un profe de otro colegio', async () => {
    const colegioA = await crearColegio('A')
    const colegioB = await crearColegio('B')
    const adminA = await crearUsuario({
      role: 'school_admin',
      colegioId: colegioA.id,
    })
    const profeB = await crearUsuario({
      role: 'teacher',
      colegioId: colegioB.id,
    })

    currentUserId = adminA.id
    const r = await quitarProfesor(profeB.id)
    expect('error' in r).toBe(true)
    expect(await colegioIdDe(profeB.id)).toBe(colegioB.id)
  })

  it('configurarColegio y regenerarCodigo funcionan para el school_admin', async () => {
    const colegio = await crearColegio('Antiguo')
    const admin = await crearUsuario({
      role: 'school_admin',
      colegioId: colegio.id,
    })
    currentUserId = admin.id

    const rCfg = await configurarColegio(fd({ nombre: 'Nuevo Nombre' }))
    expect('ok' in rCfg && rCfg.ok).toBe(true)

    const rCod = await regenerarCodigo()
    expect('ok' in rCod && rCod.ok).toBe(true)
    const codigoNuevo = 'ok' in rCod ? rCod.codigo : ''

    const [c] = await db
      .select()
      .from(colegios)
      .where(eq(colegios.id, colegio.id))
    expect(c.nombre).toBe('Nuevo Nombre')
    expect(c.joinCode).toBe(codigoNuevo)
  })

  it('school_admin edita/elimina una pregunta de un profe de su colegio', async () => {
    const colegio = await crearColegio()
    const admin = await crearUsuario({
      role: 'school_admin',
      colegioId: colegio.id,
    })
    const profe = await crearUsuario({
      role: 'teacher',
      colegioId: colegio.id,
    })

    const [pregunta] = await db
      .insert(preguntas)
      .values({
        userId: profe.id,
        // Igual que en producción: la pregunta queda ANCLADA al colegio del
        // autor al crearse (crearPregunta estampa colegioId); el guard del
        // banco del colegio autoriza contra este campo.
        colegioId: colegio.id,
        asignatura: 'Matemática',
        pregunta: 'original',
        correcta: 'A',
        A: '1',
        B: '2',
      })
      .returning()

    currentUserId = admin.id

    // Editar.
    const rEdit = await editarPreguntaColegio(
      pregunta.id,
      preguntaValida({ pregunta: 'editada por el admin' }),
    )
    expect(rEdit).toBeUndefined()
    const [actualizada] = await db
      .select()
      .from(preguntas)
      .where(eq(preguntas.id, pregunta.id))
    expect(actualizada.pregunta).toBe('editada por el admin')

    // El banco del colegio lista la pregunta con su autor.
    const banco = await listarBancoColegio(colegio.id)
    const enBanco = banco.preguntas.find((p) => p.id === pregunta.id)
    expect(enBanco?.autor).toBe(profe.nombre)

    // Eliminar.
    const rDel = await eliminarPreguntaColegio(pregunta.id)
    expect(rDel).toBeUndefined()
    const restantes = await db
      .select()
      .from(preguntas)
      .where(eq(preguntas.id, pregunta.id))
    expect(restantes.length).toBe(0)
  })

  it('school_admin NO puede editar/eliminar una pregunta de OTRO colegio', async () => {
    const colegioA = await crearColegio('A')
    const colegioB = await crearColegio('B')
    const adminA = await crearUsuario({
      role: 'school_admin',
      colegioId: colegioA.id,
    })
    const profeB = await crearUsuario({
      role: 'teacher',
      colegioId: colegioB.id,
    })

    const [preguntaB] = await db
      .insert(preguntas)
      .values({
        userId: profeB.id,
        asignatura: 'Historia',
        pregunta: 'de otro colegio',
        correcta: 'A',
        A: '1',
        B: '2',
      })
      .returning()

    currentUserId = adminA.id

    const rEdit = await editarPreguntaColegio(
      preguntaB.id,
      preguntaValida({ pregunta: 'intento de hackeo' }),
    )
    expect(rEdit && 'error' in rEdit).toBe(true)

    const rDel = await eliminarPreguntaColegio(preguntaB.id)
    expect(rDel && 'error' in rDel).toBe(true)

    // La pregunta del colegio B intacta.
    const [intacta] = await db
      .select()
      .from(preguntas)
      .where(eq(preguntas.id, preguntaB.id))
    expect(intacta.pregunta).toBe('de otro colegio')
  })
})
