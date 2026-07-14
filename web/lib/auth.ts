import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { admin } from 'better-auth/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  usuarios,
  accounts,
  colegios,
  sessions,
  verifications,
} from '@/lib/db/schema'
import { hashPw, verifyPw, LEGACY } from '@/lib/auth-password'
import { enviarVerificacionCorreo, enviarResetPassword } from '@/lib/email/enviar'
import {
  registrarAcceso,
  ipDeForwardedFor,
  type MetodoAcceso,
} from '@/lib/auth-access-log'

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
// Admin de colegio: SIN permisos del plugin admin. Los endpoints admin de
// better-auth (list-users/get-user/ban/...) NO están acotados por colegio, así
// que otorgar `user:['list','get']` dejaba a cualquier school_admin enumerar a
// TODOS los usuarios de la plataforma (PII cross-tenant). La gestión de
// profesores del colegio se hace vía `listarProfesores(colegioId)` (acotado) y
// las server actions con guard `esAdminDeColegio`, no vía el plugin.
const schoolAdminRole = ac.newRole({ user: [], session: [] })
// Profesor: sin permisos administrativos.
const teacherRole = ac.newRole({ user: [], session: [] })

export const accessControl = ac
export const roles = {
  global_admin: globalAdminRole,
  school_admin: schoolAdminRole,
  teacher: teacherRole,
}

/**
 * Auto-asociación al colegio por DOMINIO de correo. Se ejecuta SÓLO cuando el
 * correo ya está VERIFICADO (desde `afterEmailVerification`): así el dominio del
 * correo prueba pertenencia al colegio y nadie puede colarse registrándose con
 * un correo de un dominio ajeno que no controla. Si el usuario ya tiene colegio,
 * no hace nada.
 */
async function asociarColegioPorDominio(userId: number): Promise<void> {
  if (!Number.isFinite(userId)) return
  const [u] = await db
    .select({ email: usuarios.email, colegioId: usuarios.colegioId })
    .from(usuarios)
    .where(eq(usuarios.id, userId))
    .limit(1)
  if (!u || u.colegioId != null) return

  const dominio = u.email.toLowerCase().split('@')[1]
  if (!dominio) return

  const [colegio] = await db
    .select({ id: colegios.id })
    .from(colegios)
    .where(eq(colegios.dominio, dominio))
    .limit(1)
  if (!colegio) return

  await db
    .update(usuarios)
    .set({ colegioId: colegio.id })
    .where(and(eq(usuarios.id, userId), isNull(usuarios.colegioId)))
}

// ---------------------------------------------------------------------------
// Login social (Google/Microsoft). Los proveedores se activan SÓLO si sus
// credenciales están en el entorno, para que local/QA sin credenciales no rompa
// el arranque. Las consts locales permiten a TS estrechar a `string` dentro del
// spread condicional de `socialProviders`. `proveedoresSocialesHabilitados()` es
// la fuente de verdad que la UI usa para mostrar sólo los botones configurados.
// ---------------------------------------------------------------------------
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET
// `proveedoresSocialesHabilitados()` (para la UI) vive en `lib/auth-social.ts`
// —módulo liviano— y evalúa las mismas variables de entorno.

// ---------------------------------------------------------------------------
// Registro de accesos (login). Corre en el after-hook de better-auth para cada
// intento por email/contraseña o por proveedor social. Éxito se detecta con
// `ctx.context.newSession` (la sesión recién creada, no-null tanto en email como
// en el callback social). El fallo de email/contraseña se registra con el correo
// del body y el código del error. Nunca lanza (registrarAcceso captura todo).
// ---------------------------------------------------------------------------
async function registrarAccesoDesdeContexto(ctx: {
  path?: string
  body?: unknown
  headers?: Headers
  context: { newSession?: unknown; returned?: unknown }
}): Promise<void> {
  const path = ctx.path ?? ''
  let metodo: MetodoAcceso | null = null
  if (path === '/sign-in/email') metodo = 'password'
  else if (path === '/callback/google') metodo = 'google'
  else if (path === '/callback/microsoft') metodo = 'microsoft'
  if (!metodo) return

  const uaHeader = ctx.headers?.get('user-agent') ?? null
  const ipHeader = ipDeForwardedFor(ctx.headers?.get('x-forwarded-for'))

  const newSession = ctx.context.newSession as
    | {
        user?: { id?: string | number; email?: string }
        session?: { ipAddress?: string | null; userAgent?: string | null }
      }
    | null
    | undefined
  const returned = ctx.context.returned as
    | { token?: string; user?: { id?: string | number; email?: string } }
    | undefined

  const bodyEmail = (ctx.body as { email?: string } | undefined)?.email

  // Éxito: la sesión recién creada (social + email) o el {token,user} devuelto
  // por /sign-in/email. Cualquiera de las dos señales confirma el login.
  const userExito =
    newSession?.user?.id != null
      ? newSession.user
      : returned?.token && returned.user?.id != null
        ? returned.user
        : null

  if (userExito?.id != null) {
    await registrarAcceso({
      userId: Number(userExito.id),
      email: userExito.email ?? bodyEmail ?? '',
      metodo,
      exito: true,
      ipAddress: newSession?.session?.ipAddress ?? ipHeader,
      userAgent: newSession?.session?.userAgent ?? uaHeader,
    })
    return
  }

  // Sin sesión nueva ⇒ intento fallido. Sólo lo registramos con certeza para
  // email/contraseña, donde tenemos el correo del body; los fallos de social no
  // siempre llegan hasta aquí (redirigen con ?error=... sin pasar por este hook).
  if (metodo === 'password' && bodyEmail) {
    const err = ctx.context.returned as
      | { status?: string; body?: { code?: string } }
      | undefined
    const motivo = err?.body?.code ?? err?.status ?? null
    await registrarAcceso({
      email: bodyEmail,
      metodo,
      exito: false,
      motivo: typeof motivo === 'string' ? motivo : null,
      ipAddress: ipHeader,
      userAgent: uaHeader,
    })
  }
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
  // proxy, el origin debe coincidir con la URL pública. Aceptamos varios: la URL
  // canónica (BETTER_AUTH_URL) más los extra en BETTER_AUTH_TRUSTED_ORIGINS
  // (coma-separados) — p. ej. www y el host de Azure durante la transición.
  trustedOrigins: (() => {
    const origenes = new Set<string>()
    if (process.env.BETTER_AUTH_URL) origenes.add(process.env.BETTER_AUTH_URL)
    for (const o of (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '').split(',')) {
      const v = o.trim()
      if (v) origenes.add(v)
    }
    return [...origenes]
  })(),
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
    // Recuperación de contraseña. `requestPasswordReset` genera un token y llama
    // a esta función con la `url` que, al abrirse, valida el token y redirige a
    // la página /restablecer con ?token=... (o ?error=INVALID_TOKEN). La nueva
    // contraseña se hashea con el mismo scrypt de arriba (password.hash).
    sendResetPassword: async ({ user, url }) => {
      await enviarResetPassword(user.email, user.name ?? '', url)
    },
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hora
  },
  // Login social. Cada proveedor se incluye SÓLO si tiene credenciales (spread
  // condicional). 'common' en Microsoft admite cuentas personales (Outlook) y de
  // trabajo/colegio (M365). Callbacks: /api/auth/callback/{google,microsoft}.
  socialProviders: {
    ...(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
      ? { google: { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET } }
      : {}),
    ...(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET
      ? {
          microsoft: {
            clientId: MICROSOFT_CLIENT_ID,
            clientSecret: MICROSOFT_CLIENT_SECRET,
            tenantId: 'common',
          },
        }
      : {}),
  },
  // Enlace de cuentas: permite que un login con Google/Microsoft se una a una
  // cuenta EXISTENTE con el mismo correo (email/contraseña u otro proveedor). Sin
  // esto better-auth devuelve `account_not_linked` y rebota al login. Es seguro
  // porque Google y Microsoft verifican la propiedad del correo.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'microsoft'],
    },
  },
  // Verificación de correo. NO exigimos verificar para iniciar sesión
  // (requireEmailVerification queda en false por defecto): así los usuarios
  // migrados/antiguos siguen entrando y cualquiera puede usar la app de
  // inmediato. Verificar el correo es lo que DISPARA la auto-asociación al
  // colegio por dominio (afterEmailVerification), con el correo ya probado.
  // - sendOnSignUp: manda el correo de verificación al registrarse.
  // - autoSignInAfterVerification: tras verificar, deja la sesión iniciada.
  // - expiresIn: 24h de validez del enlace.
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await enviarVerificacionCorreo(user.email, user.name ?? '', url)
    },
    afterEmailVerification: async (user) => {
      await asociarColegioPorDominio(Number(user.id))
    },
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
  // Auto-asociación al colegio para usuarios creados vía login social. El flujo
  // social crea el usuario con emailVerified=true (lo prueba el proveedor) y NO
  // pasa por `afterEmailVerification`, donde vive la asociación del flujo por
  // email. Aquí asociamos SÓLO si el usuario nace verificado: los registros por
  // email/contraseña nacen no verificados y siguen esperando la verificación.
  databaseHooks: {
    user: {
      create: {
        after: async (user: { id?: string | number; emailVerified?: boolean }) => {
          if (user.emailVerified === true && user.id != null) {
            await asociarColegioPorDominio(Number(user.id))
          }
        },
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      // Bitácora de accesos (éxito y fallo, email y social). Va primero porque
      // debe registrar también los fallos, que salen temprano abajo.
      await registrarAccesoDesdeContexto(ctx)

      const returned = ctx.context.returned as
        | { token?: string; user?: { id?: string | number } }
        | undefined
      // Sólo en éxito: el handler devuelve { token, user }. En fallo el
      // `returned` es un APIError (sin token), así que salimos.
      if (!returned?.token || returned.user?.id == null) return
      const userId = Number(returned.user.id)
      if (!Number.isFinite(userId)) return

      // Rehash de credenciales legacy tras un sign-in exitoso.
      if (ctx.path === '/sign-in/email') {
        const body = ctx.body as { password?: string } | undefined
        const password = body?.password
        if (typeof password !== 'string') return

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
        return
      }
    }),
  },
  // Rate limiting: por defecto better-auth lo activa en producción y aplica una
  // regla estricta a /sign-in y /sign-up (máx. 3 por ventana de 10s e IP). Eso
  // hace inviable un E2E que registra varias cuentas seguidas detrás de la misma
  // IP (localhost). Sólo en ese entorno (DISABLE_RATE_LIMIT=1) lo desactivamos;
  // en producción queda intacto (undefined => defaults de better-auth).
  rateLimit:
    process.env.DISABLE_RATE_LIMIT === '1' ? { enabled: false } : undefined,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
})
