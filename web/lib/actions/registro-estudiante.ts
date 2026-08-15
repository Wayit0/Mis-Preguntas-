'use server'

import { cookies, headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { parseSetCookieHeader, toCookieOptions } from 'better-auth/cookies'
import { db } from '@/lib/db'
import { cursos, inscripciones, usuarios } from '@/lib/db/schema'
import { auth } from '@/lib/auth'

/** Nombre del curso para el copy de /unirse/CODIGO (null si el código no existe). */
export async function nombreCursoPorCodigo(codigo: string): Promise<string | null> {
  const limpio = (codigo ?? '').trim()
  if (!limpio) return null
  const [curso] = await db.select({ nombre: cursos.nombre }).from(cursos)
    .where(eq(cursos.joinCode, limpio)).limit(1)
  return curso?.nombre ?? null
}

/**
 * Alta de estudiante en un paso: valida el código, crea la cuenta con
 * better-auth, estampa role 'student' y crea la inscripción. Los estudiantes
 * SOLO nacen por este flujo.
 *
 * Sesión iniciada tras el registro: `auth.api.signUpEmail` llamado a mano
 * desde una server action NO deja cookie por sí solo (no hay una Response
 * HTTP de por medio donde adjuntar el Set-Cookie, a diferencia de pegarle al
 * route handler /api/auth/[...all]). Pedimos `returnHeaders: true` para
 * recuperar el header crudo y lo re-emitimos con `cookies()` de next/headers,
 * usando los mismos helpers (`parseSetCookieHeader`/`toCookieOptions`) que el
 * plugin oficial `nextCookies()` de better-auth aplica en su after-hook (ver
 * node_modules/better-auth/dist/integrations/next-js.mjs). Reproducimos el
 * mecanismo aquí, acotado a esta action, en vez de activar ese plugin de forma
 * global en lib/auth.ts para no cambiar el comportamiento de cookies de TODAS
 * las llamadas a auth.api.* del resto de la app.
 *
 * IMPORTANTE — orden de operaciones: el Set-Cookie se re-emite AL FINAL, sólo
 * después de que el UPDATE a role='student' y el INSERT de la inscripción ya
 * terminaron con éxito. `defaultRole` en better-auth es 'teacher' (ver
 * lib/auth.ts): si dejáramos la cookie puesta antes y alguna de esas dos
 * operaciones fallara a mitad de camino, el navegador quedaría con una sesión
 * autenticada válida para una cuenta 'teacher' mientras la UI reporta un
 * error genérico. Por eso guardamos los headers y los aplicamos recién al
 * final del try, nunca dentro de una ruta que pueda desembocar en el catch.
 */
export async function registrarEstudianteConCodigo(input: {
  codigo: string
  nombre: string
  email: string
  password: string
}): Promise<{ ok: true } | { error: string }> {
  const codigo = (input.codigo ?? '').trim()
  const nombre = (input.nombre ?? '').trim()
  const email = (input.email ?? '').trim().toLowerCase()
  const password = input.password ?? ''

  if (!nombre) return { error: 'Ingresa tu nombre.' }
  if (!email.includes('@')) return { error: 'Ingresa un correo válido.' }
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' }

  const [curso] = await db.select({ id: cursos.id }).from(cursos)
    .where(eq(cursos.joinCode, codigo)).limit(1)
  if (!curso) return { error: 'El código no corresponde a ningún curso.' }

  try {
    const { headers: resHeaders, response } = await auth.api.signUpEmail({
      body: { name: nombre, email, password },
      headers: await headers(),
      returnHeaders: true,
    })
    const userId = Number(response.user.id)
    if (!Number.isFinite(userId)) {
      return { error: 'No se pudo crear la cuenta. Intenta de nuevo.' }
    }

    // El UPDATE de role y el INSERT de inscripción van primero: si cualquiera
    // falla, saltamos directo al catch SIN haber tocado las cookies, así el
    // navegador nunca queda con una sesión 'teacher' (el defaultRole) a medio
    // camino de convertirse en estudiante.
    await db.update(usuarios).set({ role: 'student' }).where(eq(usuarios.id, userId))
    await db.insert(inscripciones)
      .values({ cursoId: curso.id, estudianteId: userId })
      .onConflictDoNothing()

    // Recién ahora, con la cuenta ya completa como 'student' e inscrita,
    // re-emitimos el Set-Cookie de la sesión hacia el navegador.
    const setCookie = resHeaders.get('set-cookie')
    if (setCookie) {
      const cookieStore = await cookies()
      parseSetCookieHeader(setCookie).forEach((valor, nombreCookie) => {
        if (!nombreCookie) return
        try {
          cookieStore.set(nombreCookie, valor.value, toCookieOptions(valor))
        } catch {
          // cookies() de solo lectura fuera de una action/route handler: no
          // debería darse aquí (esto es una server action), pero un fallo al
          // fijar la cookie no debe tumbar el registro (queda el fallback de
          // iniciar sesión manualmente en /login).
        }
      })
    }

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/exist/i.test(msg)) {
      return { error: 'Ya existe una cuenta con ese correo. Inicia sesión y usa el código desde tu portal.' }
    }
    return { error: 'No se pudo crear la cuenta. Intenta de nuevo.' }
  }
}
