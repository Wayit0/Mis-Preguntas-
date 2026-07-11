import { describe, it, expect } from 'vitest'
import { desc, like } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { verifications } from '@/lib/db/schema'

describe('recuperación de contraseña (better-auth reset)', () => {
  it('requestPasswordReset + resetPassword cambian la contraseña', async () => {
    const email = `reset${Date.now()}@x.cl`
    const oldPw = 'ClaveVieja1'
    const newPw = 'ClaveNueva2'

    await auth.api.signUpEmail({
      body: { name: 'Reset User', email, password: oldPw },
    })

    // Genera el token de reset (sin RESEND_API_KEY el correo se omite, pero el
    // token queda en `verifications` con identifier `reset-password:<token>`).
    await auth.api.requestPasswordReset({ body: { email } })

    const [v] = await db
      .select()
      .from(verifications)
      .where(like(verifications.identifier, 'reset-password:%'))
      .orderBy(desc(verifications.id))
      .limit(1)
    expect(v).toBeTruthy()
    const token = v.identifier.slice('reset-password:'.length)
    expect(token.length).toBeGreaterThan(0)

    await auth.api.resetPassword({ body: { newPassword: newPw, token } })

    // La nueva contraseña permite iniciar sesión...
    const signInNuevo = await auth.api.signInEmail({
      body: { email, password: newPw },
    })
    expect(signInNuevo.token).toBeTruthy()

    // ...y la vieja ya no.
    await expect(
      auth.api.signInEmail({ body: { email, password: oldPw } }),
    ).rejects.toThrow()
  })

  it('resetPassword con token inválido falla', async () => {
    await expect(
      auth.api.resetPassword({
        body: { newPassword: 'CualquierClave1', token: 'token-invalido-xyz' },
      }),
    ).rejects.toThrow()
  })
})
