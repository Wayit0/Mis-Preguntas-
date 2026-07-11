import { describe, it, expect } from 'vitest'
import { desc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { accesos } from '@/lib/db/schema'

describe('registro de accesos (after-hook de better-auth)', () => {
  it('un login exitoso por email registra un acceso exito=true', async () => {
    const email = `acc${Date.now()}@x.cl`
    const password = 'ClaveAcceso1'
    await auth.api.signUpEmail({ body: { name: 'Acc User', email, password } })

    const signIn = await auth.api.signInEmail({ body: { email, password } })
    expect(signIn.token).toBeTruthy()

    const filas = await db
      .select()
      .from(accesos)
      .where(eq(accesos.email, email))
      .orderBy(desc(accesos.id))

    const exitoso = filas.find((f) => f.exito && f.metodo === 'password')
    expect(exitoso).toBeTruthy()
    expect(exitoso!.email).toBe(email)
    // El sign-up NO se registra como acceso; sólo el sign-in explícito.
    expect(filas.filter((f) => f.exito).length).toBe(1)
  })

  it('un login fallido por contraseña registra un acceso exito=false con motivo', async () => {
    const email = `accfail${Date.now()}@x.cl`
    const password = 'ClaveAcceso1'
    await auth.api.signUpEmail({ body: { name: 'Fail User', email, password } })

    await expect(
      auth.api.signInEmail({ body: { email, password: 'contraseñaMala' } }),
    ).rejects.toThrow()

    const filas = await db
      .select()
      .from(accesos)
      .where(eq(accesos.email, email))
      .orderBy(desc(accesos.id))

    const fallido = filas.find((f) => !f.exito && f.metodo === 'password')
    expect(fallido).toBeTruthy()
    expect(fallido!.motivo).toBeTruthy()
    // Un intento fallido no debe generar ningún acceso exitoso.
    expect(filas.some((f) => f.exito)).toBe(false)
  })
})
