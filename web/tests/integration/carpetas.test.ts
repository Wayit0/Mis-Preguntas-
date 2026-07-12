import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, preguntas, carpetas } from '@/lib/db/schema'

// Las server actions resuelven la identidad con getSession() y revalidan con
// revalidatePath(); ambos dependen del contexto de una petición Next. Se mockean
// igual que en textos.test.ts.
let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { crearCarpeta, renombrarCarpeta, moverCarpeta, eliminarCarpeta, moverItems } =
  await import('@/lib/actions/carpetas')
const { subcarpetas, rutaCarpeta, contarItemsEnCarpetas } = await import(
  '@/lib/queries/carpetas'
)

async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

async function crearPregunta(userId: number, carpetaId: number | null = null) {
  const [p] = await db
    .insert(preguntas)
    .values({ userId, asignatura: 'Física', pregunta: '¿Q?', carpetaId })
    .returning()
  return p
}

function idDe(r: { error: string } | { id: number }): number {
  if ('error' in r) throw new Error(r.error)
  return r.id
}

beforeEach(() => {
  currentUserId = 0
})

describe('Carpetas (CRUD, jerarquía, mover, borrado que reubica)', () => {
  it('crea carpetas y subcarpetas; ruta y subcarpetas correctas', async () => {
    const u = await crearUsuario('carp')
    currentUserId = u.id

    const raizId = idDe(await crearCarpeta('Unidad 1', null))
    const subId = idDe(await crearCarpeta('Cinemática', raizId))

    const roots = await subcarpetas(u.id, null)
    expect(roots.map((c) => c.id)).toContain(raizId)

    const hijos = await subcarpetas(u.id, raizId)
    expect(hijos.map((c) => c.id)).toEqual([subId])

    const ruta = await rutaCarpeta(u.id, subId)
    expect(ruta.map((c) => c.nombre)).toEqual(['Unidad 1', 'Cinemática'])
  })

  it('mueve preguntas a una carpeta y las cuenta', async () => {
    const u = await crearUsuario('carp-mv')
    currentUserId = u.id
    const cId = idDe(await crearCarpeta('Banco', null))
    const p1 = await crearPregunta(u.id)
    const p2 = await crearPregunta(u.id)

    expect(await moverItems('preguntas', [p1.id, p2.id], cId)).toEqual({ ok: true })

    const [row] = await db.select().from(preguntas).where(eq(preguntas.id, p1.id))
    expect(row.carpetaId).toBe(cId)

    const conteos = await contarItemsEnCarpetas(u.id, 'preguntas', [cId])
    expect(conteos.get(cId)).toBe(2)
  })

  it('eliminar una carpeta reubica subcarpetas e ítems al padre (no borra contenido)', async () => {
    const u = await crearUsuario('carp-del')
    currentUserId = u.id
    const padreId = idDe(await crearCarpeta('Padre', null))
    const hijoId = idDe(await crearCarpeta('Hijo', padreId))
    const nietoId = idDe(await crearCarpeta('Nieto', hijoId))
    const p = await crearPregunta(u.id)
    await moverItems('preguntas', [p.id], hijoId)

    expect(await eliminarCarpeta(hijoId)).toEqual({ ok: true })

    // La carpeta borrada ya no existe.
    expect(
      (await db.select().from(carpetas).where(eq(carpetas.id, hijoId))).length,
    ).toBe(0)
    // El nieto se reubicó al padre de la borrada.
    const [n] = await db.select().from(carpetas).where(eq(carpetas.id, nietoId))
    expect(n.parentId).toBe(padreId)
    // La pregunta NO se borró y quedó en el padre.
    const [pr] = await db.select().from(preguntas).where(eq(preguntas.id, p.id))
    expect(pr).toBeTruthy()
    expect(pr.carpetaId).toBe(padreId)
  })

  it('previene mover una carpeta dentro de un descendiente (ciclo)', async () => {
    const u = await crearUsuario('carp-cycle')
    currentUserId = u.id
    const aId = idDe(await crearCarpeta('A', null))
    const bId = idDe(await crearCarpeta('B', aId))

    const res = await moverCarpeta(aId, bId) // A dentro de su hijo B → error
    expect('error' in res).toBe(true)
    // A sigue en la raíz.
    const [a] = await db.select().from(carpetas).where(eq(carpetas.id, aId))
    expect(a.parentId).toBeNull()
  })

  it('rechaza renombrar/eliminar una carpeta ajena', async () => {
    const dueno = await crearUsuario('carp-own')
    const otro = await crearUsuario('carp-intruso')
    currentUserId = dueno.id
    const cId = idDe(await crearCarpeta('Mía', null))

    currentUserId = otro.id
    expect('error' in (await renombrarCarpeta(cId, 'Hackeada'))).toBe(true)
    expect('error' in (await eliminarCarpeta(cId))).toBe(true)

    const [row] = await db.select().from(carpetas).where(eq(carpetas.id, cId))
    expect(row.nombre).toBe('Mía')
  })
})
