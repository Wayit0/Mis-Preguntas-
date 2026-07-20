import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { usuarios, accounts } from '@/lib/db/schema'
import { LEGACY } from '@/lib/auth-password'

describe('auth (better-auth contra Postgres)', () => {
  it('signUp de usuario nuevo + signIn devuelven sesión', async () => {
    const email = `nuevo${Date.now()}@x.cl`
    const password = 'Sup3rClave!'

    const signUp = await auth.api.signUpEmail({
      body: { name: 'Nuevo Usuario', email, password },
    })
    expect(signUp.token).toBeTruthy()
    expect(signUp.user?.id).toBeTruthy()
    // El nombre se mapeó a la columna `nombre`.
    expect(signUp.user?.name).toBe('Nuevo Usuario')

    // La contraseña vive en accounts (provider credential), con hash scrypt.
    const userId = Number(signUp.user.id)
    const [acc] = await db
      .select()
      .from(accounts)
      .where(
        and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')),
      )
    expect(acc?.password?.startsWith('scrypt:')).toBe(true)

    const signIn = await auth.api.signInEmail({
      body: { email, password },
    })
    expect(signIn.token).toBeTruthy()
    expect(Number(signIn.user.id)).toBe(userId)
  })

  it('signIn con credencial legacy SHA-256 funciona y re-hashea el account', async () => {
    const email = `legacy${Date.now()}@x.cl`
    const password = 'clave123'
    const legacyHash =
      LEGACY + crypto.createHash('sha256').update(password).digest('hex')

    // Inserción manual: usuario + account legacy (como tras la migración Render).
    const [u] = await db
      .insert(usuarios)
      .values({ nombre: 'Legacy User', email, passwordHash: legacyHash })
      .returning()

    await db.insert(accounts).values({
      userId: u.id,
      accountId: String(u.id),
      providerId: 'credential',
      password: legacyHash,
    })

    // signIn con la clave correcta → debe validar contra el SHA-256 legacy.
    const signIn = await auth.api.signInEmail({ body: { email, password } })
    expect(signIn.token).toBeTruthy()
    expect(Number(signIn.user.id)).toBe(u.id)

    // El rehash (after-hook) ya corrió: el account dejó de ser legacy.
    const [acc] = await db
      .select()
      .from(accounts)
      .where(
        and(eq(accounts.userId, u.id), eq(accounts.providerId, 'credential')),
      )
    expect(acc.password?.startsWith(LEGACY)).toBe(false)
    expect(acc.password?.startsWith('scrypt:')).toBe(true)

    // Y la nueva clave scrypt sigue validando la misma contraseña.
    const signIn2 = await auth.api.signInEmail({ body: { email, password } })
    expect(signIn2.token).toBeTruthy()
  })

  // Regresión: con `requireLocalEmailVerified` en su default (true), better-auth
  // rechaza con `account_not_linked` el login social de cualquier cuenta local
  // sin correo verificado — es decir, casi todas, porque no exigimos verificar
  // para entrar. Falla en silencio y sólo en producción, así que se fija aquí.
  it('el enlace de cuentas no exige que el correo local ya esté verificado', () => {
    const linking = auth.options.account?.accountLinking
    expect(linking?.enabled).toBe(true)
    expect(linking?.trustedProviders).toEqual(['google', 'microsoft'])
    expect(linking?.requireLocalEmailVerified).toBe(false)
  })

  it('un usuario recién registrado por correo nace sin verificar', async () => {
    // Premisa del test anterior: si esto cambiara (verificación obligatoria),
    // el candado de better-auth dejaría de estorbar y podría reconsiderarse.
    const email = `sinverificar${Date.now()}@x.cl`
    const signUp = await auth.api.signUpEmail({
      body: { name: 'Sin Verificar', email, password: 'Sup3rClave!' },
    })
    expect(signUp.user.emailVerified).toBe(false)
  })
})
