import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, preguntas } from '@/lib/db/schema'

// La server action `eliminarTexto`/`guardarTexto` resuelve la identidad con
// getSession() y revalida con revalidatePath(). Ambas dependen del contexto de
// una petición Next, que no existe en vitest. Las mockeamos: getSession devuelve
// la sesión del usuario de prueba activo, y revalidatePath es un no-op.
let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}))

// Importar DESPUÉS de declarar los mocks (vi.mock se hoistea, pero mantenemos el
// orden por claridad).
const { guardarTexto, eliminarTexto } = await import('@/lib/actions/textos')
const { cargarTextosPropios, cargarPreguntasDeTexto } = await import(
  '@/lib/queries/textos'
)

// Crea un usuario con email único (los tests comparten la base Postgres docker).
async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

beforeEach(() => {
  currentUserId = 0
})

describe('Mis Textos (CRUD + desasociar preguntas al borrar)', () => {
  it('crea un texto, le asocia una pregunta y lo ve en la lista', async () => {
    const u = await crearUsuario('textos-ver')
    currentUserId = u.id

    const res = await guardarTexto({
      asignatura: 'Lenguaje',
      titulo: 'Texto de prueba',
      contenido: 'Contenido del texto de comprensión lectora.',
      compartida: 0,
    })
    expect('id' in res).toBe(true)
    const textoId = (res as { id: number }).id

    // Asociar una pregunta al texto (set texto_id), como hace la UI del MVP.
    const [preg] = await db
      .insert(preguntas)
      .values({
        userId: u.id,
        asignatura: 'Lenguaje',
        pregunta: 'pregunta asociada al texto',
        textoId,
      })
      .returning()

    // Verlo: aparece en la lista de la asignatura y trae la pregunta asociada.
    const lista = await cargarTextosPropios(u.id, 'Lenguaje')
    expect(lista.some((t) => t.id === textoId)).toBe(true)

    const pregs = await cargarPreguntasDeTexto(textoId)
    expect(pregs.map((p) => p.id)).toContain(preg.id)
  })

  it('al eliminar el texto, la pregunta queda con texto_id NULL y NO se borra', async () => {
    const u = await crearUsuario('textos-del')
    currentUserId = u.id

    const res = await guardarTexto({
      asignatura: 'Historia',
      titulo: 'Texto a eliminar',
      contenido: 'Este texto será borrado.',
      compartida: 1,
    })
    const textoId = (res as { id: number }).id

    const [preg] = await db
      .insert(preguntas)
      .values({
        userId: u.id,
        asignatura: 'Historia',
        pregunta: 'pregunta que debe sobrevivir',
        textoId,
      })
      .returning()

    await eliminarTexto(textoId)

    // El texto ya no existe.
    const lista = await cargarTextosPropios(u.id, 'Historia')
    expect(lista.some((t) => t.id === textoId)).toBe(false)

    // La pregunta NO se borró y quedó desasociada (texto_id NULL).
    const [pregDespues] = await db
      .select()
      .from(preguntas)
      .where(eq(preguntas.id, preg.id))
    expect(pregDespues).toBeTruthy()
    expect(pregDespues.textoId).toBeNull()

    // Y ya no aparece como pregunta del texto borrado.
    const pregsDelTexto = await cargarPreguntasDeTexto(textoId)
    expect(pregsDelTexto.length).toBe(0)
  })

  it('no elimina un texto ajeno (guard de propiedad) ni desasocia sus preguntas', async () => {
    const dueno = await crearUsuario('textos-dueno')
    const intruso = await crearUsuario('textos-intruso')

    currentUserId = dueno.id
    const res = await guardarTexto({
      asignatura: 'Biología',
      titulo: 'Texto del dueño',
      contenido: 'No debe poder borrarlo un tercero.',
      compartida: 0,
    })
    const textoId = (res as { id: number }).id

    const [preg] = await db
      .insert(preguntas)
      .values({
        userId: dueno.id,
        asignatura: 'Biología',
        pregunta: 'pregunta del dueño',
        textoId,
      })
      .returning()

    // El intruso intenta borrar: la acción no debe tener efecto.
    currentUserId = intruso.id
    await eliminarTexto(textoId)

    const lista = await cargarTextosPropios(dueno.id, 'Biología')
    expect(lista.some((t) => t.id === textoId)).toBe(true)

    const [pregDespues] = await db
      .select()
      .from(preguntas)
      .where(eq(preguntas.id, preg.id))
    expect(pregDespues.textoId).toBe(textoId)
  })
})
