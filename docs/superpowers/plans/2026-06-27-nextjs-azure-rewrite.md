# Reescritura Next.js + Azure — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescribir el MVP de "Mis Preguntas" (Streamlit) como app Next.js + TypeScript con paridad total de funciones, autenticación better-auth, e infraestructura desplegada en Azure (Resource Group nuevo, Postgres Flexible Server, App Service, Blob Storage).

**Architecture:** App única Next.js (App Router) en `web/`. Lecturas vía server components, mutaciones vía server actions con Zod. Drizzle ORM sobre Postgres. better-auth con IDs numéricos mapeado a la tabla `usuarios` existente y verificador custom para hashes SHA-256 legacy. Imágenes en Azure Blob. PDF con react-pdf, LaTeX con MathJax. Infra como código en Bicep, deploy por GitHub Actions (OIDC).

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Drizzle ORM, postgres-js, better-auth, @react-pdf/renderer, mathjax-full, sharp, pdfjs-dist, mammoth, @anthropic-ai/sdk, @azure/storage-blob, Zod, vitest, Playwright, Bicep, az CLI.

## Global Constraints

- Gestor de paquetes: **pnpm**. Node **>= 20 LTS**.
- TypeScript **strict**; sin `any` salvo justificado.
- Toda mutación pasa por **server action** validada con **Zod**.
- Idioma de UI y copy: **español** (es-CL).
- Paleta **Esmeralda & grafito**: primary `#059669`, primary-dark `#047857`, accent `#34D399`, grafito `#14241D`, bg `#F4F8F6`, sidebar `#14241D`.
- Asignaturas (8): Física, Química, Biología, Matemáticas, Filosofía, Ciencias de la Ciudadanía, Lenguaje, SAS.
- `tipo ∈ {seleccion_multiple, desarrollo_corto, desarrollo_largo}`; `nivel` sugeridos: PAES, Plan Ministerial, Bachillerato Internacional, Otro.
- Modelo IA: Sonnet vigente (confirmar id con la guía de Claude API; MVP usa `claude-sonnet-4-6`).
- Región Azure: **East US 2**. Resource Group: `rg-mispreguntas-prod`. Suscripción: "Patrocinio de Microsoft Azure" → SKUs económicos (App Service B1, Postgres Burstable B1ms).
- Secretos en **Azure Key Vault** (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`, storage connection), referenciados desde App Service vía **managed identity** (Key Vault references). Nunca secretos en claro en repo ni config.
- **No** romper el Streamlit existente (queda en la raíz hasta retirarlo).
- Cada tarea termina con commit. Mensajes de commit sin footers de IA.

## File Structure

```
web/
  package.json, pnpm-lock.yaml, tsconfig.json, next.config.ts
  tailwind.config.ts, postcss.config.mjs, components.json (shadcn)
  drizzle.config.ts
  .env.local (no commit), .env.example
  app/
    layout.tsx, globals.css
    (auth)/layout.tsx
    (auth)/login/page.tsx
    (auth)/registro/page.tsx
    (app)/layout.tsx                 ← shell autenticado (sidebar+topbar)
    (app)/dashboard/page.tsx
    (app)/preguntas/page.tsx
    (app)/preguntas/nueva/page.tsx
    (app)/preguntas/[id]/editar/page.tsx
    (app)/compartido/page.tsx
    (app)/textos/page.tsx
    (app)/prueba/page.tsx
    (app)/colaboradores/page.tsx
    (app)/importar/page.tsx
    api/auth/[...all]/route.ts        ← handler better-auth
    api/uploads/[...path]/route.ts    ← sirve imágenes desde Blob
  lib/
    auth.ts            ← config better-auth + verificador legacy
    auth-client.ts     ← cliente better-auth (browser)
    db/index.ts        ← cliente drizzle
    db/schema.ts       ← tablas dominio + auth
    storage/blob.ts    ← wrapper Azure Blob
    pdf/prueba.tsx     ← documento react-pdf
    latex/render.ts    ← MathJax TeX→PNG
    ai/import.ts       ← detección de preguntas con Anthropic
    docparse/extract.ts← PDF/DOCX/imagen → texto
    validation/        ← schemas Zod por entidad
    actions/           ← server actions por feature
    queries/           ← lecturas por feature
  components/
    ui/                ← shadcn
    shell/sidebar.tsx, shell/topbar.tsx, shell/subject-switcher.tsx
    preguntas/...      ← tarjetas, formularios, filtros
  scripts/
    migrate-render-to-azure.ts
  drizzle/             ← migraciones SQL generadas
  infra/
    main.bicep, modules/*.bicep, deploy.sh
  tests/
    unit/**, integration/**, e2e/**
  vitest.config.ts, playwright.config.ts
.github/workflows/deploy.yml
```

---

## Fase 0 — Repo & tooling

### Task 0.1: Scaffold Next.js + Tailwind + shadcn en `web/`

**Files:**
- Create: `web/` (proyecto Next.js completo), `web/.env.example`
- Test: `web/tests/unit/smoke.test.ts`

**Interfaces:**
- Produces: app Next.js ejecutable con `pnpm dev`; alias `@/*` → `web/`.

- [ ] **Step 1: Scaffold**

```bash
cd web 2>/dev/null || pnpm create next-app@latest web --ts --app --tailwind --eslint --src-dir=false --import-alias "@/*" --use-pnpm
cd web && pnpm dlx shadcn@latest init -d
```

- [ ] **Step 2: Smoke test (falla primero)**

```ts
// web/tests/unit/smoke.test.ts
import { describe, it, expect } from 'vitest'
it('suma', () => { expect(1 + 1).toBe(2) })
```

- [ ] **Step 3: Configurar vitest**

```ts
// web/vitest.config.ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
export default defineConfig({ plugins: [tsconfigPaths()], test: { environment: 'node' } })
```

- [ ] **Step 4: Correr y ver pasar** — `pnpm vitest run` → PASS.
- [ ] **Step 5: Commit** — `git add web && git commit -m "feat(web): scaffold Next.js + Tailwind + shadcn"`

### Task 0.2: Tema Esmeralda & grafito + tokens

**Files:** Modify `web/app/globals.css`, `web/tailwind.config.ts`

- [ ] **Step 1:** Definir variables CSS de la paleta (valores en Global Constraints) en `:root` y mapearlas a tokens shadcn (`--primary`, `--background`, etc.).
- [ ] **Step 2:** Acceptance manual: una página de prueba muestra botón primary esmeralda y fondo `#F4F8F6`.
- [ ] **Step 3: Commit** — `git commit -am "feat(web): tema Esmeralda & grafito"`

---

## Fase 1 — Data layer (Drizzle)

### Task 1.1: Cliente Drizzle + schema de dominio

**Files:** Create `web/lib/db/index.ts`, `web/lib/db/schema.ts`, `web/drizzle.config.ts`; Test `web/tests/integration/schema.test.ts`

**Interfaces:**
- Produces: `db` (cliente drizzle); tablas `usuarios, preguntas, textos, colaboraciones, sessions, accounts, verifications`.
- Consumes: `process.env.DATABASE_URL`.

- [ ] **Step 1: Schema espejo del MVP** (tipos exactos del MVP, columnas A–E e imagen_* con nombres entre comillas preservando case):

```ts
// web/lib/db/schema.ts (extracto dominio)
import { pgTable, serial, integer, text, timestamp, primaryKey } from 'drizzle-orm/pg-core'
export const usuarios = pgTable('usuarios', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  emailVerified: integer('email_verified').default(0), // añadido para better-auth
  updatedAt: timestamp('updated_at').defaultNow(),
  image: text('image'),
})
export const preguntas = pgTable('preguntas', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  asignatura: text('asignatura').notNull(),
  materia: text('materia'), contenido: text('contenido'), nivel: text('nivel'),
  pregunta: text('pregunta').notNull(),
  A: text('A'), B: text('B'), C: text('C'), D: text('D'), E: text('E'),
  correcta: text('correcta'), explicacion: text('explicacion'),
  compartida: integer('compartida').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  imagenPregunta: text('imagen_pregunta'),
  imagenA: text('imagen_A'), imagenB: text('imagen_B'), imagenC: text('imagen_C'),
  imagenD: text('imagen_D'), imagenE: text('imagen_E'),
  tipo: text('tipo').default('seleccion_multiple'),
  textoId: integer('texto_id'),
})
export const textos = pgTable('textos', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  asignatura: text('asignatura').notNull(),
  titulo: text('titulo').notNull(), contenido: text('contenido').notNull(),
  compartida: integer('compartida').default(0),
  createdAt: timestamp('created_at').defaultNow(),
})
export const colaboraciones = pgTable('colaboraciones', {
  fromUserId: integer('from_user_id').notNull(),
  toUserId: integer('to_user_id').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.fromUserId, t.toUserId] }) }))
```

- [ ] **Step 2: Cliente**

```ts
// web/lib/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
const client = postgres(process.env.DATABASE_URL!, { prepare: false })
export const db = drizzle(client, { schema })
```

- [ ] **Step 3: Test de integración** (requiere Postgres de prueba; usar `docker run -e POSTGRES_PASSWORD=pg -p 5433:5432 postgres:16` y `DATABASE_URL=postgresql://postgres:pg@localhost:5433/postgres`):

```ts
// web/tests/integration/schema.test.ts
import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
it('inserta y lee un usuario', async () => {
  const [u] = await db.insert(usuarios).values({ nombre: 'Test', email: `t${Date.now()}@x.cl`, passwordHash: 'x' }).returning()
  expect(u.id).toBeGreaterThan(0)
})
```

- [ ] **Step 4:** Generar migración: `pnpm drizzle-kit generate` y aplicarla `pnpm drizzle-kit migrate`. Correr test → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(web): schema Drizzle + cliente"`

### Task 1.2: Schema de tablas better-auth

**Files:** Modify `web/lib/db/schema.ts`; Test extiende `schema.test.ts`

- [ ] **Step 1:** Añadir tablas `accounts(id serial, userId integer, accountId text, providerId text, password text, ...)`, `sessions(id serial, userId integer, token text unique, expiresAt timestamp, ipAddress, userAgent)`, `verifications(id serial, identifier text, value text, expiresAt timestamp)`. (Confirmar columnas exactas contra la doc de better-auth vigente.)
- [ ] **Step 2:** Generar y aplicar migración. Test: insertar una `account` con `userId` válido → PASS.
- [ ] **Step 3: Commit** — `git commit -am "feat(web): tablas better-auth"`

---

## Fase 2 — Auth (better-auth)

### Task 2.1: Config better-auth + handler

**Files:** Create `web/lib/auth.ts`, `web/lib/auth-client.ts`, `web/app/api/auth/[...all]/route.ts`; Test `web/tests/integration/auth.test.ts`

**Interfaces:**
- Produces: `auth` (server), `authClient` (browser) con `signIn`, `signUp`, `signOut`, `useSession`; helper `getSession()`.

- [ ] **Step 1: Config** con adaptador Drizzle, IDs numéricos, mapeo a `usuarios`, email/password:

```ts
// web/lib/auth.ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema: {
    user: schema.usuarios, account: schema.accounts,
    session: schema.sessions, verification: schema.verifications,
  }}),
  advanced: { database: { useNumberId: true } },
  user: { fields: { name: 'nombre', createdAt: 'created_at' } },
  emailAndPassword: { enabled: true, password: { hash: hashPw, verify: verifyPw } },
})
```

(`hashPw`/`verifyPw` se definen en Task 2.2.)

- [ ] **Step 2: Handler + cliente**

```ts
// web/app/api/auth/[...all]/route.ts
import { auth } from '@/lib/auth'; import { toNextJsHandler } from 'better-auth/next-js'
export const { GET, POST } = toNextJsHandler(auth)
```
```ts
// web/lib/auth-client.ts
import { createAuthClient } from 'better-auth/react'
export const authClient = createAuthClient()
```

- [ ] **Step 3: Test integración** — signUp de un usuario nuevo y signIn devuelven sesión con cookie. (Usa el Postgres de prueba.)
- [ ] **Step 4:** Correr → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(web): better-auth config + handler"`

### Task 2.2: Verificador de contraseña legacy (SHA-256) + rehash

**Files:** Create `web/lib/auth-password.ts`; Test `web/tests/unit/auth-password.test.ts`

**Interfaces:**
- Produces: `hashPw(password): Promise<string>` (scrypt vía better-auth), `verifyPw({hash, password}): Promise<boolean>` que entiende el prefijo `legacy-sha256:` y re-hashea.

- [ ] **Step 1: Test (falla primero)**

```ts
// web/tests/unit/auth-password.test.ts
import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { verifyPw, hashPw } from '@/lib/auth-password'
it('acepta hash legacy sha256 correcto', async () => {
  const pw = 'secreto123'
  const legacy = 'legacy-sha256:' + crypto.createHash('sha256').update(pw).digest('hex')
  expect(await verifyPw({ hash: legacy, password: pw })).toBe(true)
  expect(await verifyPw({ hash: legacy, password: 'malo' })).toBe(false)
})
it('verifica hash scrypt nuevo', async () => {
  const h = await hashPw('abc'); expect(await verifyPw({ hash: h, password: 'abc' })).toBe(true)
})
```

- [ ] **Step 2: Implementación** — como definimos `hash`/`verify` custom, controlamos el formato propio (`scrypt:salt:dk`); el legacy se detecta por prefijo. El rehash al éxito se hace en un hook `after` de signIn que actualiza `accounts.password`.

```ts
// web/lib/auth-password.ts
import crypto from 'node:crypto'
const LEGACY = 'legacy-sha256:'
const N = 16384, r = 8, p = 1, KEYLEN = 64

function scrypt(pw: string, salt: Buffer): Promise<Buffer> {
  return new Promise((res, rej) =>
    crypto.scrypt(pw, salt, KEYLEN, { N, r, p }, (e, d) => (e ? rej(e) : res(d as Buffer))))
}
export async function hashPw(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const dk = await scrypt(password, salt)
  return `scrypt:${salt.toString('hex')}:${dk.toString('hex')}`
}
export async function verifyPw({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  if (hash.startsWith(LEGACY)) {
    const expected = hash.slice(LEGACY.length)
    const actual = crypto.createHash('sha256').update(password).digest('hex')
    if (actual.length !== expected.length) return false
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  }
  const [scheme, saltHex, keyHex] = hash.split(':')
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false
  const dk = await scrypt(password, Buffer.from(saltHex, 'hex'))
  const key = Buffer.from(keyHex, 'hex')
  return dk.length === key.length && crypto.timingSafeEqual(dk, key)
}
```
- [ ] **Step 3:** Correr → PASS.
- [ ] **Step 4: Commit** — `git commit -am "feat(web): verificador password legacy + rehash"`

### Task 2.3: Páginas login / registro / cambiar contraseña

**Files:** Create `web/app/(auth)/login/page.tsx`, `registro/page.tsx`, componente cambiar-password en el topbar; Test `web/tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `authClient`.

- [ ] **Step 1: Test E2E (Playwright)** — registrar usuario nuevo, cerrar sesión, iniciar sesión → llega a `/dashboard`. (Define "hecho".)
- [ ] **Step 2:** Implementar formularios (shadcn `Form`+`Input`+`Button`, validación Zod), errores en español equivalentes al MVP ("Correo no encontrado", "Contraseña incorrecta", "Ya existe una cuenta con ese correo").
- [ ] **Step 3:** Correr E2E → PASS.
- [ ] **Step 4: Commit** — `git commit -am "feat(web): páginas auth"`

---

## Fase 3 — Migración de datos (Render → Azure)

### Task 3.1: Backfill de `accounts` con marcador legacy (lógica testeable)

**Files:** Create `web/scripts/migrate-render-to-azure.ts`, `web/lib/migration/backfill.ts`; Test `web/tests/unit/backfill.test.ts`

**Interfaces:**
- Produces: `legacyAccountRow(usuario): {userId, accountId, providerId:'credential', password}` y `backfillAccounts(db)`.

- [ ] **Step 1: Test** — dado un usuario `{id:7, email, password_hash:'abc'}`, `legacyAccountRow` retorna `password === 'legacy-sha256:abc'`, `providerId === 'credential'`, `userId === 7`.
- [ ] **Step 2:** Implementar `legacyAccountRow` + `backfillAccounts` (idempotente: no duplica si ya existe account para el userId).
- [ ] **Step 3:** PASS.
- [ ] **Step 4: Commit** — `git commit -am "feat(web): backfill accounts legacy"`

### Task 3.2: Script de migración dump/restore + verificación (runbook)

**Files:** Modify `web/scripts/migrate-render-to-azure.ts`; Docs `web/docs/migracion-azure.md`

- [ ] **Step 1:** Documentar y scriptar: `pg_dump` de Render (`--no-owner --no-privileges`) → `psql` a Azure; luego `pnpm drizzle-kit migrate` (columnas/tablas auth) y `backfillAccounts`; reajustar secuencias.
- [ ] **Step 2: Verificación** — el script imprime conteos por tabla origen vs destino y aborta si difieren. (Se ejecuta en Fase 8 contra la base real; aquí queda el runbook + dry-run con la base de prueba.)
- [ ] **Step 3: Commit** — `git commit -am "feat(web): runbook migración Render→Azure"`

---

## Fase 4 — App shell & diseño

### Task 4.1: Layout autenticado (sidebar grafito + topbar)

**Files:** Create `web/app/(app)/layout.tsx`, `components/shell/sidebar.tsx`, `topbar.tsx`, `subject-switcher.tsx`; Test `web/tests/e2e/shell.spec.ts`

**Interfaces:**
- Produces: layout que protege rutas (redirige a `/login` sin sesión); contexto de asignatura en URL searchParam `?asignatura=`.
- Consumes: `getSession()`.

- [ ] **Step 1: Test E2E** — sin sesión, `/dashboard` redirige a `/login`; con sesión, se ven las 7 secciones en el sidebar y el switcher de asignatura.
- [ ] **Step 2:** Implementar shell según mockup north star (sidebar grafito `#14241D`, ítem activo esmeralda, topbar con switcher+perfil). Responsive: sidebar colapsa en menú en móvil.
- [ ] **Step 3:** PASS.
- [ ] **Step 4: Commit** — `git commit -am "feat(web): shell autenticado"`

### Task 4.2: Dashboard

**Files:** Create `web/app/(app)/dashboard/page.tsx`; Test e2e

- [ ] **Step 1: Test** — dashboard muestra conteos (preguntas propias, compartidas, textos) y accesos directos.
- [ ] **Step 2:** Implementar con queries agregadas.
- [ ] **Step 3:** PASS + Commit.

---

## Fase 5 — Verticales de features

> Cada feature: schema Zod + server actions + queries + UI + test. Las actions definen el contrato; el test E2E define "hecho".

### Task 5.1: Almacenamiento en Blob (wrapper)

**Files:** Create `web/lib/storage/blob.ts`, `web/app/api/uploads/[...path]/route.ts`; Test `web/tests/unit/blob.test.ts` (con mock del SDK)

**Interfaces:**
- Produces: `uploadImage(file): Promise<string>` (retorna clave del blob), `getImageStream(key)`, `imageUrl(key)`.

- [ ] **Step 1: Test** con `@azure/storage-blob` mockeado: `uploadImage` sube y retorna una clave `uuid.ext`; `getImageStream` pide el blob por esa clave.
- [ ] **Step 2:** Implementar wrapper + route handler que valida sesión y hace proxy del stream.
- [ ] **Step 3:** PASS + Commit.

### Task 5.2: Mis Preguntas — CRUD + imágenes + LaTeX + filtros

**Files:** Create `web/lib/validation/pregunta.ts`, `web/lib/actions/preguntas.ts`, `web/lib/queries/preguntas.ts`, páginas `preguntas/`, `preguntas/nueva`, `preguntas/[id]/editar`, componentes en `components/preguntas/`; Test `web/tests/e2e/preguntas.spec.ts`

**Interfaces:**
- Produces (actions): `crearPregunta(input)`, `actualizarPregunta(id, input)`, `eliminarPregunta(id)`, `toggleCompartida(id, valor)`; (queries) `listarPreguntasPropias(userId, asignatura, filtros)`.
- Consumes: `uploadImage` (5.1), `db`, `getSession`.

- [ ] **Step 1: Test E2E** — crear pregunta de selección múltiple con imagen en enunciado y alternativa, verla en la lista filtrada por materia, editarla, marcar compartida, eliminarla.
- [ ] **Step 2:** Schema Zod (campos del MVP: asignatura, materia, contenido, nivel, pregunta, A–E, correcta, explicacion, tipo, compartida, imágenes). Actions validan propiedad (`user_id`). Soporta los 3 `tipo`.
- [ ] **Step 3:** UI: lista con tarjetas (badge materia, estado, correcta marcada, acciones), filtros chips (materia/nivel/estado), formulario nueva/editar con subida de imágenes y preview de LaTeX inline.
- [ ] **Step 4:** PASS + Commit.

### Task 5.3: Banco Compartido

**Files:** Create `web/lib/queries/compartido.ts`, `web/app/(app)/compartido/page.tsx`; Test e2e

**Interfaces:**
- Produces: `cargarBancoCompartido(userId, asignatura)` (preguntas de colaboradores con `compartida=1`).

- [ ] **Step 1: Test** — usuario B comparte una pregunta; usuario A (colaborador) la ve en Compartido; no-colaborador no la ve.
- [ ] **Step 2:** Query con join a `colaboraciones`. UI de solo lectura con filtro por asignatura.
- [ ] **Step 3:** PASS + Commit.

### Task 5.4: Mis Textos

**Files:** Create `web/lib/validation/texto.ts`, `web/lib/actions/textos.ts`, `web/lib/queries/textos.ts`, `web/app/(app)/textos/page.tsx`; Test e2e

**Interfaces:**
- Produces: `guardarTexto(input)`, `eliminarTexto(id)` (al borrar, set `texto_id=NULL` en preguntas), `cargarTextosPropios(userId, asignatura)`, `cargarPreguntasDeTexto(textoId)`.

- [ ] **Step 1: Test** — crear texto, asociarle una pregunta, verlo; al eliminar el texto las preguntas quedan con `texto_id` null y no se borran.
- [ ] **Step 2:** Implementar actions/queries + UI (tabs ver/crear como el MVP, adaptado al shell).
- [ ] **Step 3:** PASS + Commit.

### Task 5.5: Colaboradores

**Files:** Create `web/lib/actions/colaboradores.ts`, `web/lib/queries/colaboradores.ts`, `web/app/(app)/colaboradores/page.tsx`; Test e2e

**Interfaces:**
- Produces: `agregarColaborador(fromId, toEmail)`, `eliminarColaborador(fromId, toId)`, `cargarColaboradores(userId)`, `cargarQuienesMeInvitaron(userId)`, `buscarUsuarioPorEmail(email, excludeId)`.

- [ ] **Step 1: Test** — invitar colega por email, aparece en "colegas que puedo ver"; el invitado ve al invitador en "quién me puede ver"; quitar colaborador.
- [ ] **Step 2:** Actions/queries sobre `colaboraciones` + UI con 2 tabs como el MVP.
- [ ] **Step 3:** PASS + Commit.

---

## Fase 6 — Crear Prueba (PDF + LaTeX)

### Task 6.1: Render LaTeX → PNG

**Files:** Create `web/lib/latex/render.ts`; Test `web/tests/unit/latex.test.ts`

**Interfaces:**
- Produces: `latexToPng(expr): Promise<Buffer>` (MathJax TeX→SVG → sharp/resvg → PNG).

- [ ] **Step 1: Test** — `latexToPng('x^2+1')` retorna un Buffer PNG no vacío (cabecera `\x89PNG`).
- [ ] **Step 2:** Implementar con `mathjax-full` (tex2svg) + conversión a PNG.
- [ ] **Step 3:** PASS + Commit.

### Task 6.2: Documento react-pdf + generación

**Files:** Create `web/lib/pdf/prueba.tsx`, `web/lib/actions/prueba.ts`, `web/app/(app)/prueba/page.tsx`; Test `web/tests/unit/pdf.test.ts` + e2e

**Interfaces:**
- Produces: `generarPruebaPdf(config): Promise<Buffer>` (header colegio/profesor/logo, instrucciones, fórmulas, textos, preguntas numeradas con imágenes y alternativas); action `crearPrueba(seleccion, opciones)`.
- Consumes: `latexToPng`, `getImageStream`.

- [ ] **Step 1: Test smoke** — `generarPruebaPdf` con 2 preguntas retorna PDF (`%PDF`) > 1KB; incluye número de preguntas correcto (parse básico).
- [ ] **Step 2:** Implementar documento react-pdf con la estructura del MVP (`generar_pdf`/`agregar_pregunta_pdf`); soportar tipos desarrollo (líneas en blanco). Página `/prueba`: seleccionar preguntas, opciones de header, descargar.
- [ ] **Step 3:** PASS + e2e descarga PDF + Commit.

---

## Fase 7 — Importar Documento (IA)

### Task 7.1: Extracción de texto (PDF/DOCX/imagen)

**Files:** Create `web/lib/docparse/extract.ts`; Test `web/tests/unit/docparse.test.ts`

**Interfaces:**
- Produces: `extraerTexto(file): Promise<string>` (PDF vía pdfjs-dist, DOCX vía mammoth, imagen → marca para visión).

- [ ] **Step 1: Test** — con un PDF y un DOCX de fixture, retorna el texto esperado (substring conocido).
- [ ] **Step 2:** Implementar extractores por tipo MIME.
- [ ] **Step 3:** PASS + Commit.

### Task 7.2: Detección de preguntas con Anthropic

**Files:** Create `web/lib/ai/import.ts`, `web/lib/validation/import.ts`, `web/app/(app)/importar/page.tsx`; Test `web/tests/unit/ai-import.test.ts` (SDK mockeado)

**Interfaces:**
- Produces: `detectarPreguntas(texto, asignatura): Promise<PreguntaDetectada[]>` (estructura: pregunta, A–E, correcta, explicacion, materia, nivel, tipo).
- Consumes: `@anthropic-ai/sdk`, `ANTHROPIC_API_KEY`.

- [ ] **Step 1: Test** con SDK mockeado retornando JSON de 2 preguntas → `detectarPreguntas` las parsea/valida con Zod y descarta inválidas.
- [ ] **Step 2:** Implementar prompt equivalente al del MVP (`detectar_preguntas_con_claude`), modelo Sonnet vigente, salida JSON estructurada. UI: subir documento → previsualizar preguntas detectadas → seleccionar/editar → guardar en lote (reusa `crearPregunta`).
- [ ] **Step 3:** PASS + e2e con IA mockeada + Commit.

---

## Fase 8 — Infra Azure + deploy

### Task 8.1: Bicep (RG, Postgres, App Service, Storage, Key Vault)

**Files:** Create `web/infra/main.bicep`, `web/infra/modules/{postgres,appservice,storage,keyvault}.bicep`, `web/infra/deploy.sh`; Test: `az deployment ... --what-if`

**Interfaces:**
- Produces: RG `rg-mispreguntas-prod` en East US 2 con Postgres Flexible (B1ms), App Service Plan+WebApp (B1, Node 20) con **managed identity system-assigned**, Storage Account + contenedor `uploads`, **Key Vault** con los secretos; outputs: hostname de la app.

- [ ] **Step 1:** Escribir Bicep con parámetros (location=eastus2, sku económicos). Postgres con `sslmode=require`, regla de firewall temporal para migración.
- [ ] **Step 2: Key Vault + identidad** — crear Key Vault; guardar secretos `database-url`, `better-auth-secret`, `anthropic-api-key`, `storage-connection`. Asignar a la managed identity de la WebApp el rol **Key Vault Secrets User** (RBAC).
- [ ] **Step 3: App settings como Key Vault references** — `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`, `AZURE_STORAGE_CONNECTION_STRING` = `@Microsoft.KeyVault(SecretUri=https://<kv>.vault.azure.net/secrets/<name>)`; `BETTER_AUTH_URL`, `BLOB_CONTAINER`, `NODE_ENV` en claro.
- [ ] **Step 4: What-if** — `az deployment sub create --location eastus2 --template-file infra/main.bicep --what-if` sin errores.
- [ ] **Step 5: Commit** — `git commit -m "feat(infra): Bicep Azure (RG, Postgres, App Service, Storage, Key Vault)"`

### Task 8.2: Provisión real + deploy app + migración de datos

**Files:** usa `infra/deploy.sh`, `scripts/migrate-render-to-azure.ts`

> Requiere `az login` (ya hecho) y confirmación del usuario antes de crear recursos facturables.

- [ ] **Step 1:** `bash infra/deploy.sh` crea el RG y todos los recursos. Verificar en `az resource list -g rg-mispreguntas-prod`.
- [ ] **Step 2:** Deploy de la app (`az webapp deploy` o GitHub Actions). App responde en su hostname.
- [ ] **Step 3:** Correr migración Render→Azure; verificación de conteos OK.
- [ ] **Step 4:** Smoke: login con un usuario migrado (password legacy) funciona y re-hashea.
- [ ] **Step 5: Commit** — `git commit -m "chore(infra): provisión + deploy + migración"`

### Task 8.3: CI/CD GitHub Actions (OIDC)

**Files:** Create `.github/workflows/deploy.yml`

- [ ] **Step 1:** Workflow: en push a la rama, build (`pnpm build`) + deploy a App Service vía OIDC. Federated credential en una App Registration.
- [ ] **Step 2:** Push de prueba dispara deploy verde.
- [ ] **Step 3: Commit** — `git commit -m "ci: deploy a Azure App Service (OIDC)"`

### Task 8.4: Validación E2E final

- [ ] **Step 1:** Ejecutar el agente **e2e-validation-runner** contra el hostname de Azure: login (migrado + nuevo), CRUD pregunta con imagen, compartir, crear prueba (PDF), importar (mock o real), colaboradores.
- [ ] **Step 2:** Generar reporte de evidencia (screenshots).
- [ ] **Step 3:** Actualizar `docs/` y memoria (app ahora en Azure, no Render).

---

## Notas de ejecución por workflows

- Fases 0–3 son secuenciales (fundación). Fase 5 (verticales) puede paralelizarse por feature una vez exista la fundación. Fases 6 y 7 dependen de 5.1 (blob) y 5.2 (crearPregunta). Fase 8 al final.
- Cada workflow corre una fase, valida (tests verdes), y para en un gate de revisión antes de la siguiente.
