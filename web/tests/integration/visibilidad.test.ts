import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { colegios, usuarios, preguntas, colaboraciones } from '@/lib/db/schema'
import { cargarBancoCompartido } from '@/lib/queries/compartido'
import { getDashboardStats } from '@/lib/queries/dashboard'
import { puedeVerImagen } from '@/lib/queries/uploads'

// Integración contra el Postgres docker (mismo patrón que el resto de la
// suite). La base se comparte entre tests, por eso cada caso crea su PROPIO
// colegio (joinCode único): así el auto-colegio queda acotado a los usuarios de
// ese test y no se contamina con filas de otros casos.

function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function crearColegio() {
  const [c] = await db
    .insert(colegios)
    .values({ nombre: uniq('Colegio'), joinCode: uniq('JOIN') })
    .returning()
  return c
}

async function crearUsuario(prefijo: string, colegioId?: number) {
  const email = `${uniq(prefijo)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x', colegioId })
    .returning()
  return u
}

async function crearPregunta(
  userId: number,
  asignatura: string,
  compartida: 0 | 1,
  extra: Partial<typeof preguntas.$inferInsert> = {},
) {
  const [p] = await db
    .insert(preguntas)
    .values({ userId, asignatura, pregunta: uniq('q'), compartida, ...extra })
    .returning()
  return p
}

describe('Visibilidad unificada (Parte D)', () => {
  it('AUTO-COLEGIO: A y B del mismo colegio se ven las compartidas mutuamente; la privada no; lo propio tampoco', async () => {
    const col = await crearColegio()
    const a = await crearUsuario('A', col.id)
    const b = await crearUsuario('B', col.id)

    // Igual que en producción: crearPregunta estampa el colegio del autor en la
    // pregunta (`colegio_id`), y el auto-colegio ancla la visibilidad ahí.
    const aComp = await crearPregunta(a.id, 'Física', 1, { colegioId: col.id })
    const aPriv = await crearPregunta(a.id, 'Física', 0, { colegioId: col.id })
    const bComp = await crearPregunta(b.id, 'Química', 1, { colegioId: col.id })

    // B ve la compartida de A por auto-colegio (sin ninguna colaboración).
    const vistasPorB = await cargarBancoCompartido(b.id)
    const idsB = vistasPorB.map((p) => p.id)
    expect(idsB).toContain(aComp.id)
    expect(idsB).not.toContain(aPriv.id) // privada nunca
    // Nombre del autor preservado.
    expect(vistasPorB.find((p) => p.id === aComp.id)?.autor).toBe('A')

    // A ve la compartida de B (mutuo) Y su propia compartida (el Banco
    // Compartido incluye lo propio marcado "Tuya"; ver cargarBancoCompartido).
    const vistasPorA = await cargarBancoCompartido(a.id)
    const idsA = vistasPorA.map((p) => p.id)
    expect(idsA).toContain(bComp.id)
    expect(idsA).toContain(aComp.id)
    expect(idsA).not.toContain(aPriv.id) // lo privado propio tampoco aparece

    // Dashboard concuerda: B cuenta 1 compartida (la de A).
    const statsB = await getDashboardStats(b.id)
    expect(statsB.compartidasConmigo).toBe(1)
  })

  it('COLEGIOS DISTINTOS: sin colaboración no se ve; con colaboración A→C sí', async () => {
    const colA = await crearColegio()
    const colC = await crearColegio()
    const a = await crearUsuario('A', colA.id)
    const c = await crearUsuario('C', colC.id)

    const aComp = await crearPregunta(a.id, 'Física', 1)

    // Distinto colegio y sin colaboración → C no ve nada de A.
    const antes = await cargarBancoCompartido(c.id)
    expect(antes.map((p) => p.id)).not.toContain(aComp.id)

    // A invita a C (from=A autor, to=C) → C ve la compartida de A por invitación.
    await db.insert(colaboraciones).values({ fromUserId: a.id, toUserId: c.id })
    const despues = await cargarBancoCompartido(c.id)
    expect(despues.map((p) => p.id)).toContain(aComp.id)

    const statsC = await getDashboardStats(c.id)
    expect(statsC.compartidasConmigo).toBe(1)
  })

  it('CUENTAS PERSONALES: solo por colaboración (colegio null no dispara auto-colegio)', async () => {
    const p1 = await crearUsuario('P1') // sin colegio
    const p2 = await crearUsuario('P2') // sin colegio
    const p1Comp = await crearPregunta(p1.id, 'Física', 1)

    // Ambos personales y sin colaboración → P2 no ve nada de P1.
    const antes = await cargarBancoCompartido(p2.id)
    expect(antes.map((p) => p.id)).not.toContain(p1Comp.id)

    await db.insert(colaboraciones).values({ fromUserId: p1.id, toUserId: p2.id })
    const despues = await cargarBancoCompartido(p2.id)
    expect(despues.map((p) => p.id)).toContain(p1Comp.id)
  })

  it('un usuario CON colegio no ve la compartida de un personal (autor sin colegio), salvo invitación', async () => {
    const col = await crearColegio()
    const conColegio = await crearUsuario('ConColegio', col.id)
    const personal = await crearUsuario('Personal') // colegio null
    const personalComp = await crearPregunta(personal.id, 'Física', 1)

    // colegio del actor != null pero el autor es personal (null) → null != X.
    const vistas = await cargarBancoCompartido(conColegio.id)
    expect(vistas.map((p) => p.id)).not.toContain(personalComp.id)
  })

  it('puedeVerImagen: dueño OK; colega del mismo colegio con pregunta compartida OK; tercero false; privada del colega NO', async () => {
    const col = await crearColegio()
    const autor = await crearUsuario('autor', col.id)
    const colega = await crearUsuario('colega', col.id) // mismo colegio
    const tercero = await crearUsuario('tercero') // personal, sin relación

    const kComp = uniq('comp') + '.png'
    const kPriv = uniq('priv') + '.png'
    await crearPregunta(autor.id, 'Física', 1, {
      imagenPregunta: kComp,
      colegioId: col.id,
    })
    await crearPregunta(autor.id, 'Física', 0, {
      imagenPregunta: kPriv,
      colegioId: col.id,
    })

    // Dueño ve su imagen (compartida y privada).
    expect(await puedeVerImagen(kComp, autor.id)).toBe(true)
    expect(await puedeVerImagen(kPriv, autor.id)).toBe(true)

    // Colega del mismo colegio ve la imagen de la pregunta COMPARTIDA.
    expect(await puedeVerImagen(kComp, colega.id)).toBe(true)
    // Pero NO la de una pregunta privada del autor (auto-colegio exige compartida=1).
    expect(await puedeVerImagen(kPriv, colega.id)).toBe(false)

    // Tercero sin relación no ve nada (NO IDOR).
    expect(await puedeVerImagen(kComp, tercero.id)).toBe(false)

    // Clave inexistente → false (la route responde 404).
    expect(await puedeVerImagen(uniq('nada') + '.png', autor.id)).toBe(false)
  })
})
