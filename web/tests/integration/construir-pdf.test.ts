import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { usuarios, preguntas, textos } from '@/lib/db/schema'
import {
  resolverContenidoPrueba,
  PruebaSinPreguntasError,
} from '@/lib/pdf/construir'

// Crea un usuario con email único (los tests comparten la base Postgres docker).
async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

async function crearTexto(userId: number, titulo: string) {
  const [t] = await db
    .insert(textos)
    .values({
      userId,
      asignatura: 'Lenguaje',
      titulo,
      contenido: 'Contenido del texto de comprensión.',
    })
    .returning()
  return t
}

async function crearPregunta(userId: number, textoId: number | null = null) {
  const [p] = await db
    .insert(preguntas)
    .values({
      userId,
      asignatura: 'Lenguaje',
      pregunta: '¿Pregunta de ejemplo?',
      A: 'a',
      B: 'b',
      correcta: 'A',
      textoId,
    })
    .returning()
  return p
}

describe('resolverContenidoPrueba (selección → datos del PDF)', () => {
  it('auto-incluye el texto asociado a una pregunta seleccionada sin marcar el texto', async () => {
    const u = await crearUsuario('construir-auto')
    const texto = await crearTexto(u.id, 'Texto no marcado')
    const pregunta = await crearPregunta(u.id, texto.id)

    const res = await resolverContenidoPrueba(u.id, {
      preguntasIds: [pregunta.id],
      textosIds: [],
    })

    expect(res.textos.map((t) => t.id)).toContain(texto.id)
    expect(res.preguntas).toHaveLength(1)
    expect(res.preguntas[0].texto_id).toBe(texto.id)
  })

  it('no duplica el texto si ya venía seleccionado', async () => {
    const u = await crearUsuario('construir-dup')
    const texto = await crearTexto(u.id, 'Texto marcado')
    await crearPregunta(u.id, texto.id)

    const res = await resolverContenidoPrueba(u.id, {
      preguntasIds: [],
      textosIds: [texto.id],
    })

    expect(res.textos.filter((t) => t.id === texto.id)).toHaveLength(1)
    expect(res.preguntas).toHaveLength(1)
  })

  it('no incluye textos de otro usuario (guard de propiedad)', async () => {
    const dueno = await crearUsuario('construir-dueno')
    const otro = await crearUsuario('construir-otro')
    const textoAjeno = await crearTexto(otro.id, 'Texto ajeno')
    // Pregunta propia que apunta (por datos corruptos/copias) a un texto ajeno.
    const pregunta = await crearPregunta(dueno.id, textoAjeno.id)

    const res = await resolverContenidoPrueba(dueno.id, {
      preguntasIds: [pregunta.id],
      textosIds: [],
    })

    expect(res.textos).toHaveLength(0)
    expect(res.preguntas).toHaveLength(1)
  })

  it('lanza PruebaSinPreguntasError con selección vacía', async () => {
    const u = await crearUsuario('construir-vacio')
    await expect(
      resolverContenidoPrueba(u.id, { preguntasIds: [], textosIds: [] }),
    ).rejects.toBeInstanceOf(PruebaSinPreguntasError)
  })
})
