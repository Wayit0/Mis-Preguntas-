import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { admin } from 'better-auth/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, accounts, sessions, verifications } from '@/lib/db/schema'
import { hashPw, verifyPw, LEGACY } from '@/lib/auth-password'

// ---------------------------------------------------------------------------
// Control de acceso (access control) del plugin admin.
//
// DESVIACIÓN respecto al esbozo de la tarea: better-auth 1.6.x EXIGE que todo
// rol listado en `adminRoles` exista en la configuración de `roles`. Si se pasa
// `admin({ adminRoles: ['global_admin'] })` SIN declarar ese rol en `roles`, el
// plugin lanza en el arranque:
//   BetterAuthError: Invalid admin roles: global_admin. Admin roles must be
//   defined in the 'roles' configuration.
// (ver node_modules/better-auth/dist/plugins/admin/admin.mjs). Además, los
// endpoints admin (listUsers, etc.) NO autorizan por `adminRoles`: autorizan vía
// `hasPermission`, que resuelve permisos contra `roles || defaultRoles`
// (defaults: 'admin'/'user'). Por eso definimos roles propios con permisos
// explícitos. `global_admin` recibe las mismas capacidades que el `adminAc`
// por defecto del plugin.
// ---------------------------------------------------------------------------
const ac = createAccessControl(defaultStatements)

// Rol con plenos poderes administrativos (espejo del admin por defecto).
const globalAdminRole = ac.newRole({ ...adminAc.statements })
// Admin de colegio: puede listar/ver usuarios; no gestiona roles globales.
const schoolAdminRole = ac.newRole({ user: ['list', 'get'], session: [] })
// Profesor: sin permisos administrativos.
const teacherRole = ac.newRole({ user: [], session: [] })

export const accessControl = ac
export const roles = {
  global_admin: globalAdminRole,
  school_admin: schoolAdminRole,
  teacher: teacherRole,
}

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
  // `ipAddress.ipAddressHeaders` hace que better-auth lea la IP real del cliente
  // desde `x-forwarded-for` cuando corre detrás del proxy de Azure App Service.
  // Sin esto el rate limiting usa la IP del proxy (un único bucket compartido).
  advanced: {
    database: { generateId: 'serial' },
    ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
  },
  // Orígenes de confianza (CSRF / validación de origin). En producción detrás de
  // proxy, el origin debe coincidir con la URL pública configurada.
  trustedOrigins: process.env.BETTER_AUTH_URL
    ? [process.env.BETTER_AUTH_URL]
    : [],
  // `name` necesita mapeo: el adaptador drizzle resuelve los campos por la CLAVE
  // JS de la tabla (camelCase), no por el nombre de columna. La clave JS de
  // `name` en `usuarios` es `nombre`; el resto (createdAt, updatedAt,
  // emailVerified, image, email) ya coincide con los defaults de better-auth.
  // `additionalFields.colegioId` expone el colegio en la sesión del usuario para
  // poder leerlo en server components (input:false => signUp nunca lo escribe;
  // el adaptador drizzle lo mapea por la clave JS `colegioId` -> col colegio_id).
  // El campo `role` lo aporta el plugin admin (ver schema del plugin), por eso
  // NO se declara aquí: hacerlo duplicaría el campo.
  user: {
    fields: { name: 'nombre' },
    additionalFields: {
      colegioId: { type: 'number', required: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    // El MVP permitía contraseñas de 6+ caracteres; el default de better-auth es
    // 8. Lo bajamos a 6 para mantener paridad con el copy de la UI ("La
    // contraseña debe tener al menos 6 caracteres").
    minPasswordLength: 6,
    password: { hash: hashPw, verify: verifyPw },
  },
  // Plugin admin: roles + columnas role/banned/banReason/banExpires (ya en el
  // schema). `defaultRole: 'teacher'` => signUp crea profesores. `adminRoles`
  // marca qué roles son admin (deben existir en `roles`, ver bloque AC arriba).
  plugins: [
    admin({
      ac,
      roles,
      adminRoles: ['global_admin'],
      defaultRole: 'teacher',
    }),
  ],
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
