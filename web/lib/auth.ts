import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, accounts, sessions, verifications } from '@/lib/db/schema'
import { hashPw, verifyPw, LEGACY } from '@/lib/auth-password'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: usuarios,
      account: accounts,
      session: sessions,
      verification: verifications,
    },
  }),
  // IDs numéricos (columnas `serial`). En better-auth 1.6.x esto se activa con
  // advanced.database.generateId = 'serial' (el antiguo `useNumberId: true` ya
  // no existe en el tipo público; internamente se traduce a esto mismo).
  advanced: { database: { generateId: 'serial' } },
  // Sólo `name` necesita mapeo: el adaptador drizzle resuelve los campos por la
  // CLAVE JS de la tabla (camelCase), no por el nombre de columna. La clave JS
  // de `name` en `usuarios` es `nombre`; el resto (createdAt, updatedAt,
  // emailVerified, image, email) ya coincide con los defaults de better-auth.
  user: { fields: { name: 'nombre' } },
  emailAndPassword: {
    enabled: true,
    // El MVP permitía contraseñas de 6+ caracteres; el default de better-auth es
    // 8. Lo bajamos a 6 para mantener paridad con el copy de la UI ("La
    // contraseña debe tener al menos 6 caracteres").
    minPasswordLength: 6,
    password: { hash: hashPw, verify: verifyPw },
  },
  // Rehash de credenciales legacy: tras un signIn exitoso, si la contraseña del
  // account conserva el prefijo `legacy-sha256:`, la re-hasheamos con scrypt y
  // la persistimos. Se hace en el after-hook del endpoint /sign-in/email porque
  // es el único punto donde tenemos a la vez (a) la contraseña en claro recién
  // validada (ctx.body) y (b) el usuario autenticado (ctx.context.returned).
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email') return

      const returned = ctx.context.returned as
        | { token?: string; user?: { id?: string | number } }
        | undefined
      // Sólo en éxito: el handler devuelve { token, user }. En fallo el
      // `returned` es un APIError (sin token), así que salimos.
      if (!returned?.token || returned.user?.id == null) return

      const body = ctx.body as { password?: string } | undefined
      const password = body?.password
      if (typeof password !== 'string') return

      const userId = Number(returned.user.id)
      if (!Number.isFinite(userId)) return

      const [account] = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, userId),
            eq(accounts.providerId, 'credential'),
          ),
        )
        .limit(1)

      if (!account?.password?.startsWith(LEGACY)) return

      const nuevo = await hashPw(password)
      await db
        .update(accounts)
        .set({ password: nuevo, updatedAt: new Date() })
        .where(eq(accounts.id, account.id))
    }),
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
})
