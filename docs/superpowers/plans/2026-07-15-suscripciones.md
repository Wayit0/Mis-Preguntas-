# Modelo de suscripción EduBox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Planes Free/Pro/Colegio con cobro recurrente vía MercadoPago Suscripciones (trial 15 días con tarjeta), límites de importación IA, página /precios, sección Plan en /cuenta y tab admin «Suscripciones» (cortesías, licencias de colegio, cancelación, historial de pagos).

**Architecture:** El estado local (tabla `suscripciones`) es un cache del estado en MercadoPago, sincronizado por webhook y por reconciliación al cargar /cuenta. Ser «Pro» se **deriva** (suscripción propia vigente OR licencia del colegio), nunca se guarda como columna en `usuarios`. La cuota de importaciones IA se cuenta desde la tabla `usos_ia` que ya existe.

**Tech Stack:** Next.js 16 (App Router, `web/`), Drizzle + Postgres, better-auth, MercadoPago API REST (sin SDK, igual que Resend), vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-modelo-suscripcion-design.md`

## Global Constraints

- Todo el código vive en `web/`. **Todos los comandos de este plan se corren desde `web/`.**
- `web/AGENTS.md`: este Next.js tiene breaking changes — leer la guía relevante en `node_modules/next/dist/docs/` antes de escribir páginas/rutas. `searchParams` y `params` son `Promise`.
- Precios exactos (CLP, IVA incluido): **Pro mensual $3.490** · **Pro anual $35.880**. Trial: **15 días con tarjeta**. Cuotas IA: **free 3/mes · pro 100/mes**. Gracia de morosidad: **7 días**.
- Mes calendario en zona **America/Santiago** para la cuota de IA.
- **Nunca** borrar ni bloquear contenido al perder Pro: solo vuelven los límites.
- Un solo trial por usuario de por vida (`usuarios.trial_usado_el`), marcado cuando la suscripción **se autoriza** (no al iniciar el checkout).
- Código, comentarios y strings de UI en español (es-CL), siguiendo el estilo del repo.
- Tests de integración: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec vitest run <archivo>`. Tras cambiar el schema: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec drizzle-kit migrate`.
- Commits sin footers de "Generated with…" ni "Co-Authored-By".
- Los estados de suscripción son: `'pendiente' | 'trial' | 'activa' | 'morosa' | 'cancelada'` (`pendiente` = checkout iniciado sin autorizar; es una adición menor sobre el spec).

---

### Task 1: Schema y migración (suscripciones, pagos, licencia, candado de trial)

**Files:**
- Modify: `lib/db/schema.ts` (agregar 2 tablas al final; columnas en `usuarios` y `colegios`)
- Create: `drizzle/0013_*.sql` (generado)
- Test: `tests/integration/suscripciones.test.ts` (nuevo, primeros casos)

**Interfaces:**
- Produces: tablas Drizzle `suscripciones` y `pagosSuscripcion` exportadas desde `@/lib/db/schema`; columnas `usuarios.trialUsadoEl`, `colegios.licenciaHasta`, `colegios.licenciaNota`. Tipos inferidos `typeof suscripciones.$inferSelect`.

- [ ] **Step 1: Escribir el test que falla (existencia y constraints de las tablas)**

Crear `tests/integration/suscripciones.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { suscripciones, pagosSuscripcion, usuarios, colegios } from '@/lib/db/schema'

async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

describe('schema de suscripciones', () => {
  it('inserta una suscripción y respeta el unique por usuario', async () => {
    const u = await crearUsuario('subs-schema')
    const [s] = await db
      .insert(suscripciones)
      .values({ userId: u.id, origen: 'mercadopago', estado: 'pendiente' })
      .returning()
    expect(s.id).toBeGreaterThan(0)
    expect(s.createdAt).toBeInstanceOf(Date)

    await expect(
      db.insert(suscripciones).values({ userId: u.id, origen: 'cortesia', estado: 'activa' }),
    ).rejects.toThrow()
  })

  it('pagos_suscripcion es idempotente por mp_payment_id (unique)', async () => {
    const u = await crearUsuario('subs-pago')
    const [s] = await db
      .insert(suscripciones)
      .values({ userId: u.id, origen: 'mercadopago', estado: 'activa' })
      .returning()
    const mpPaymentId = `pay-${Date.now()}`
    await db.insert(pagosSuscripcion).values({
      userId: u.id, suscripcionId: s.id, mpPaymentId, montoClp: 3490, estado: 'approved',
    })
    await db
      .insert(pagosSuscripcion)
      .values({ userId: u.id, suscripcionId: s.id, mpPaymentId, montoClp: 3490, estado: 'approved' })
      .onConflictDoNothing({ target: pagosSuscripcion.mpPaymentId })
    const filas = await db
      .select()
      .from(pagosSuscripcion)
      .where(eq(pagosSuscripcion.mpPaymentId, mpPaymentId))
    expect(filas.length).toBe(1)
  })

  it('usuarios.trialUsadoEl y colegios.licenciaHasta existen y son nullables', async () => {
    const u = await crearUsuario('subs-cols')
    expect(u.trialUsadoEl).toBeNull()
    const [c] = await db
      .insert(colegios)
      .values({ nombre: 'Colegio Subs', joinCode: `js-${Date.now()}` })
      .returning()
    expect(c.licenciaHasta).toBeNull()
    expect(c.licenciaNota).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec vitest run tests/integration/suscripciones.test.ts`
Expected: FAIL — `suscripciones` no se exporta de `@/lib/db/schema`.

- [ ] **Step 3: Agregar tablas y columnas al schema**

En `lib/db/schema.ts`: dentro de `usuarios` (después de `instruccionesDefault`) agregar:

```ts
  // Candado de un-trial-por-vida: se marca cuando MercadoPago AUTORIZA la
  // primera suscripción con trial (no al abrir el checkout). Nullable.
  trialUsadoEl: timestamp('trial_usado_el'),
```

Dentro de `colegios` (después de `dominio`) agregar:

```ts
  // Licencia B2B activada a mano desde el admin global. Vigente si
  // licenciaHasta > now(); NULL = sin licencia. La nota guarda n° de factura
  // o contacto comercial.
  licenciaHasta: timestamp('licencia_hasta'),
  licenciaNota: text('licencia_nota'),
```

Al final del archivo agregar:

```ts
// ---------------------------------------------------------------------------
// Suscripciones (plan Pro individual). UNA fila por usuario (unique user_id):
// la fila refleja el estado actual — es un CACHE del estado en MercadoPago
// (origen 'mercadopago') o una concesión manual del admin (origen 'cortesia').
// Estados: 'pendiente' (checkout iniciado) | 'trial' | 'activa' | 'morosa' |
// 'cancelada'. Ser "Pro" NUNCA se guarda en usuarios: se deriva en
// lib/suscripciones/entitlements.ts.
// ---------------------------------------------------------------------------

export const suscripciones = pgTable('suscripciones', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .unique()
    .references(() => usuarios.id),
  origen: text('origen').notNull(), // 'mercadopago' | 'cortesia'
  periodicidad: text('periodicidad'), // 'mensual' | 'anual' (NULL en cortesías)
  estado: text('estado').notNull(),
  mpPreapprovalId: text('mp_preapproval_id').unique(),
  trialTerminaEl: timestamp('trial_termina_el'),
  // Fin del período pagado/concedido. Para MP se sincroniza con
  // next_payment_date; para cortesías es el vencimiento fijado por el admin.
  periodoHasta: timestamp('periodo_hasta'),
  nota: text('nota'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Historial de cobros de MP (webhook subscription_authorized_payment).
// Idempotente por mp_payment_id. Sirve al admin para responder reclamos sin
// entrar a MercadoPago.
export const pagosSuscripcion = pgTable('pagos_suscripcion', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  suscripcionId: integer('suscripcion_id').notNull(),
  mpPaymentId: text('mp_payment_id').notNull().unique(),
  montoClp: integer('monto_clp').notNull().default(0),
  estado: text('estado').notNull(), // 'approved' | 'rejected' | ... (status de MP)
  detalle: jsonb('detalle').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

- [ ] **Step 4: Generar y aplicar la migración**

Run: `pnpm exec drizzle-kit generate` (crea `drizzle/0013_*.sql` + meta — revisar que sea ADITIVA: 2 CREATE TABLE + 3 ALTER TABLE ADD COLUMN)
Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec drizzle-kit migrate`
Expected: migración aplicada sin errores.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec vitest run tests/integration/suscripciones.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts drizzle tests/integration/suscripciones.test.ts
git commit -m "feat(suscripciones): schema — tablas suscripciones/pagos, licencia de colegio y candado de trial"
```

---

### Task 2: Entitlements — plan efectivo y cuota de importaciones

**Files:**
- Create: `lib/suscripciones/entitlements.ts`
- Test: `tests/integration/suscripciones.test.ts` (extender)

**Interfaces:**
- Consumes: tablas de Task 1.
- Produces:
  - `LIMITE_IMPORTACIONES = { free: 3, pro: 100 }`, `DIAS_GRACIA_MOROSA = 7`
  - `type Suscripcion = typeof suscripciones.$inferSelect`
  - `esProSuscripcion(s: Suscripcion, ahora?: Date): boolean` (pura, exportada para tests)
  - `planEfectivo(userId: number): Promise<{ plan: 'free' | 'pro'; origen: 'suscripcion' | 'cortesia' | 'colegio' | null; suscripcion: Suscripcion | null }>`
  - `cuotaImportaciones(userId: number): Promise<{ plan: 'free' | 'pro'; limite: number; usadas: number; restantes: number }>`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `tests/integration/suscripciones.test.ts` (imports arriba: `usosIa` de schema; `sql` no hace falta):

```ts
import {
  esProSuscripcion,
  planEfectivo,
  cuotaImportaciones,
  DIAS_GRACIA_MOROSA,
} from '@/lib/suscripciones/entitlements'
import { usosIa } from '@/lib/db/schema'

const DIA = 86_400_000
const enDias = (n: number) => new Date(Date.now() + n * DIA)

describe('entitlements', () => {
  it('esProSuscripcion cubre los 5 estados', () => {
    const base = {
      id: 1, userId: 1, origen: 'mercadopago', periodicidad: 'mensual',
      mpPreapprovalId: 'x', trialTerminaEl: null, periodoHasta: null, nota: null,
      createdAt: new Date(), updatedAt: new Date(),
    }
    expect(esProSuscripcion({ ...base, estado: 'pendiente' } as never)).toBe(false)
    expect(esProSuscripcion({ ...base, estado: 'trial' } as never)).toBe(true)
    expect(esProSuscripcion({ ...base, estado: 'activa' } as never)).toBe(true)
    // morosa: gracia de 7 días desde periodoHasta
    expect(
      esProSuscripcion({ ...base, estado: 'morosa', periodoHasta: enDias(-3) } as never),
    ).toBe(true)
    expect(
      esProSuscripcion({
        ...base, estado: 'morosa', periodoHasta: enDias(-(DIAS_GRACIA_MOROSA + 1)),
      } as never),
    ).toBe(false)
    // cancelada: Pro hasta el fin del período pagado
    expect(
      esProSuscripcion({ ...base, estado: 'cancelada', periodoHasta: enDias(10) } as never),
    ).toBe(true)
    expect(
      esProSuscripcion({ ...base, estado: 'cancelada', periodoHasta: enDias(-1) } as never),
    ).toBe(false)
    // cortesía vigente/vencida (estado 'activa' + periodoHasta obligatorio)
    expect(
      esProSuscripcion({ ...base, origen: 'cortesia', estado: 'activa', periodoHasta: enDias(30) } as never),
    ).toBe(true)
    expect(
      esProSuscripcion({ ...base, origen: 'cortesia', estado: 'activa', periodoHasta: enDias(-1) } as never),
    ).toBe(false)
  })

  it('planEfectivo deriva Pro por licencia del colegio', async () => {
    const [c] = await db
      .insert(colegios)
      .values({
        nombre: 'Colegio Lic', joinCode: `lic-${Date.now()}`, licenciaHasta: enDias(30),
      })
      .returning()
    const u = await crearUsuario('ent-colegio')
    await db.update(usuarios).set({ colegioId: c.id }).where(eq(usuarios.id, u.id))

    const plan = await planEfectivo(u.id)
    expect(plan.plan).toBe('pro')
    expect(plan.origen).toBe('colegio')

    await db.update(colegios).set({ licenciaHasta: enDias(-1) }).where(eq(colegios.id, c.id))
    const plan2 = await planEfectivo(u.id)
    expect(plan2.plan).toBe('free')
  })

  it('cuotaImportaciones cuenta solo importar_documento del usuario en el mes', async () => {
    const u = await crearUsuario('ent-cuota')
    const otro = await crearUsuario('ent-cuota-otro')
    const uso = { modelo: 'claude-x', inputTokens: 1, outputTokens: 1 }
    await db.insert(usosIa).values([
      { userId: u.id, accion: 'importar_documento', ...uso },
      { userId: u.id, accion: 'importar_documento', ...uso },
      { userId: u.id, accion: 'otra_cosa', ...uso },
      { userId: otro.id, accion: 'importar_documento', ...uso },
      // Fuera del mes actual: no cuenta.
      { userId: u.id, accion: 'importar_documento', ...uso, createdAt: new Date('2020-01-15') },
    ])
    const cuota = await cuotaImportaciones(u.id)
    expect(cuota.plan).toBe('free')
    expect(cuota.limite).toBe(3)
    expect(cuota.usadas).toBe(2)
    expect(cuota.restantes).toBe(1)

    // Con Pro (cortesía) el límite sube a 100.
    await db.insert(suscripciones).values({
      userId: u.id, origen: 'cortesia', estado: 'activa', periodoHasta: enDias(30),
    })
    const cuotaPro = await cuotaImportaciones(u.id)
    expect(cuotaPro.limite).toBe(100)
    expect(cuotaPro.restantes).toBe(98)
  })
})
```

- [ ] **Step 2: Correr y verificar FAIL** (módulo no existe)

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec vitest run tests/integration/suscripciones.test.ts`

- [ ] **Step 3: Implementar `lib/suscripciones/entitlements.ts`**

```ts
import { and, count, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colegios, suscripciones, usosIa, usuarios } from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// Derivación de entitlements. Ser "Pro" NUNCA es una columna: se calcula aquí
// a partir de la suscripción propia (MercadoPago o cortesía) O de la licencia
// vigente del colegio del usuario. Ver spec 2026-07-15-modelo-suscripcion.
// ---------------------------------------------------------------------------

export const LIMITE_IMPORTACIONES = { free: 3, pro: 100 } as const
export const DIAS_GRACIA_MOROSA = 7

export type Suscripcion = typeof suscripciones.$inferSelect
export type OrigenPro = 'suscripcion' | 'cortesia' | 'colegio'

export interface PlanEfectivo {
  plan: 'free' | 'pro'
  origen: OrigenPro | null
  suscripcion: Suscripcion | null
}

const masDias = (fecha: Date, dias: number) =>
  new Date(fecha.getTime() + dias * 86_400_000)

/** Regla pura: ¿esta suscripción otorga Pro en `ahora`? */
export function esProSuscripcion(s: Suscripcion, ahora = new Date()): boolean {
  switch (s.estado) {
    case 'trial':
      return true
    case 'activa':
      // Las cortesías siempre tienen vencimiento; MP 'activa' es Pro sin más
      // (el vencimiento real lo gobierna MercadoPago con sus cobros).
      return s.origen === 'cortesia'
        ? s.periodoHasta != null && s.periodoHasta > ahora
        : true
    case 'morosa': {
      // Gracia de 7 días manteniendo Pro mientras MP reintenta el cobro.
      const base = s.periodoHasta ?? s.updatedAt
      return ahora < masDias(base, DIAS_GRACIA_MOROSA)
    }
    case 'cancelada':
      // Conserva Pro hasta el fin del período ya pagado.
      return s.periodoHasta != null && ahora < s.periodoHasta
    default:
      return false // 'pendiente' u otro
  }
}

export async function planEfectivo(userId: number): Promise<PlanEfectivo> {
  const [s] = await db
    .select()
    .from(suscripciones)
    .where(eq(suscripciones.userId, userId))
    .limit(1)
  if (s && esProSuscripcion(s)) {
    return {
      plan: 'pro',
      origen: s.origen === 'cortesia' ? 'cortesia' : 'suscripcion',
      suscripcion: s,
    }
  }
  const [fila] = await db
    .select({ licenciaHasta: colegios.licenciaHasta })
    .from(usuarios)
    .leftJoin(colegios, eq(usuarios.colegioId, colegios.id))
    .where(eq(usuarios.id, userId))
    .limit(1)
  if (fila?.licenciaHasta && fila.licenciaHasta > new Date()) {
    return { plan: 'pro', origen: 'colegio', suscripcion: s ?? null }
  }
  return { plan: 'free', origen: null, suscripcion: s ?? null }
}

// Inicio del mes calendario actual en America/Santiago, expresado como el
// timestamp naive-UTC con que se comparan los created_at (que Postgres guarda
// sin zona). Todo el cálculo ocurre en SQL para no reimplementar zonas en JS.
const INICIO_MES_SANTIAGO_SQL = sql`(date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago') at time zone 'UTC'`

export interface CuotaImportaciones {
  plan: 'free' | 'pro'
  limite: number
  usadas: number
  restantes: number
}

export async function cuotaImportaciones(userId: number): Promise<CuotaImportaciones> {
  const { plan } = await planEfectivo(userId)
  const limite = LIMITE_IMPORTACIONES[plan]
  const [fila] = await db
    .select({ usadas: count() })
    .from(usosIa)
    .where(
      and(
        eq(usosIa.userId, userId),
        eq(usosIa.accion, 'importar_documento'),
        gte(usosIa.createdAt, INICIO_MES_SANTIAGO_SQL),
      ),
    )
  const usadas = Number(fila?.usadas ?? 0)
  return { plan, limite, usadas, restantes: Math.max(0, limite - usadas) }
}
```

- [ ] **Step 4: Correr y verificar PASS**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec vitest run tests/integration/suscripciones.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/suscripciones/entitlements.ts tests/integration/suscripciones.test.ts
git commit -m "feat(suscripciones): entitlements derivados y cuota de importaciones IA"
```

---

### Task 3: Enforcement de la cuota en /api/importar + aviso en la UI

**Files:**
- Modify: `app/api/importar/route.ts` (chequeo antes de analizar)
- Modify: `lib/import/analizar.ts` (tipo `ResultadoAnalisis`: variante de error gana `sinCupo?: boolean`)
- Modify: `app/(app)/importar/page.tsx` (pasar cuota al componente)
- Modify: `components/import/importar-documento.tsx` (contador + upsell)

**Interfaces:**
- Consumes: `cuotaImportaciones(userId)` de Task 2.
- Produces: la línea final del stream puede ser `{"resultado":{"ok":false,"error":"…","sinCupo":true}}`; `ImportarDocumento` recibe prop nueva `cuota: { limite: number; restantes: number }`.

- [ ] **Step 1: Tipo `ResultadoAnalisis`**

En `lib/import/analizar.ts`, ubicar la definición de `ResultadoAnalisis` (línea ~26) y agregar `sinCupo?: boolean` a la variante `{ ok: false; error: string }` (queda `{ ok: false; error: string; sinCupo?: boolean }`).

- [ ] **Step 2: Chequeo en la ruta**

En `app/api/importar/route.ts`, después de `const userId = Number(session.user.id)` y **antes** de leer el formData, agregar:

```ts
  // Cuota de importaciones IA del plan (free 3/mes, pro 100/mes). Se corta
  // ANTES de gastar tokens. La respuesta usa la misma forma {resultado} que el
  // stream para que el cliente la procese sin caso especial.
  const cuota = await cuotaImportaciones(userId)
  if (cuota.restantes <= 0) {
    const resultado: ResultadoAnalisis = {
      ok: false,
      sinCupo: true,
      error: `Alcanzaste tus ${cuota.limite} importaciones con IA de este mes.`,
    }
    return Response.json({ resultado })
  }
```

Import arriba: `import { cuotaImportaciones } from '@/lib/suscripciones/entitlements'`.

- [ ] **Step 3: Verificación del corte (test de integración ligero)**

La lógica pesada (conteo/límites) ya quedó testeada en Task 2; el corte de la ruta se verifica manualmente en Step 6. No agregar test de la ruta streaming (requeriría montar Next).

- [ ] **Step 4: Cuota visible en la página de importar**

En `app/(app)/importar/page.tsx`: obtener el actor (patrón existente de la página), llamar `cuotaImportaciones(actor.userId)` y pasar `cuota={{ limite: cuota.limite, restantes: cuota.restantes }}` a `<ImportarDocumento />`.

En `components/import/importar-documento.tsx`:
1. Agregar prop `cuota: { limite: number; restantes: number }`.
2. Renderizar sobre el formulario: `Te quedan {cuota.restantes} de {cuota.limite} importaciones con IA este mes.` (usar `text-sm text-muted-foreground`). Si `cuota.restantes === 0`, mostrar en su lugar una tarjeta con borde `border-accent-amber` y CTA `<Link href="/precios">Conoce EduBox Pro — 100 importaciones al mes</Link>` y deshabilitar el submit.
3. En el manejo de la línea `{resultado}` del stream: si `resultado.ok === false && resultado.sinCupo`, mostrar el error con el mismo CTA a `/precios` (no como error genérico).

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Verificación manual**

Run: `pnpm dev` → como usuario free con 3 usos ya registrados este mes (insertarlos a mano en la BD local si hace falta), `/importar` muestra el upsell y el POST devuelve `sinCupo`.

- [ ] **Step 7: Commit**

```bash
git add app/api/importar/route.ts lib/import/analizar.ts "app/(app)/importar/page.tsx" components/import/importar-documento.tsx
git commit -m "feat(suscripciones): cuota de importaciones IA aplicada en /api/importar con upsell"
```

---

### Task 4: Cliente MercadoPago (REST, sin SDK)

**Files:**
- Create: `lib/suscripciones/mercadopago.ts`
- Test: `tests/unit/mercadopago.test.ts`

**Interfaces:**
- Produces:
  - `PRECIOS_CLP = { mensual: 3490, anual: 35880 }`, `type Periodicidad = 'mensual' | 'anual'`
  - `mpHabilitado(): boolean`
  - `mpCrearPreapproval(opts: { userId: number; email: string; periodicidad: Periodicidad; conTrial: boolean }): Promise<MpPreapproval>`
  - `mpObtenerPreapproval(id: string): Promise<MpPreapproval>`
  - `mpCancelarPreapproval(id: string): Promise<MpPreapproval>`
  - `mpObtenerPagoAutorizado(id: string): Promise<MpPagoAutorizado>`
  - `interface MpPreapproval { id: string; status: 'pending' | 'authorized' | 'paused' | 'cancelled'; external_reference?: string; init_point?: string; next_payment_date?: string; auto_recurring?: { frequency: number; frequency_type: string; transaction_amount: number; currency_id: string; start_date?: string } }`
  - `interface MpPagoAutorizado { id: string | number; preapproval_id: string; status: string; transaction_amount?: number; payment?: { id?: number; status?: string; status_detail?: string } }`

- [ ] **Step 1: Test unitario que falla (fetch mockeado)**

Crear `tests/unit/mercadopago.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('cliente MercadoPago', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubEnv('MP_ACCESS_TOKEN', 'TEST-token')
    vi.stubEnv('BETTER_AUTH_URL', 'https://qa.edubox.cl')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('mpCrearPreapproval arma el preapproval mensual con trial de 15 días', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'pre-1', status: 'pending', init_point: 'https://mp/x' })),
    )
    const { mpCrearPreapproval } = await import('@/lib/suscripciones/mercadopago')
    const pre = await mpCrearPreapproval({
      userId: 7, email: 'profe@x.cl', periodicidad: 'mensual', conTrial: true,
    })
    expect(pre.init_point).toBe('https://mp/x')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.mercadopago.com/preapproval')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.external_reference).toBe('7')
    expect(body.payer_email).toBe('profe@x.cl')
    expect(body.status).toBe('pending')
    expect(body.back_url).toBe('https://qa.edubox.cl/cuenta?suscripcion=retorno')
    expect(body.auto_recurring.transaction_amount).toBe(3490)
    expect(body.auto_recurring.frequency).toBe(1)
    expect(body.auto_recurring.currency_id).toBe('CLP')
    // Trial: primer cobro ~15 días en el futuro.
    const inicio = new Date(body.auto_recurring.start_date).getTime()
    expect(inicio).toBeGreaterThan(Date.now() + 14 * 86_400_000)
  })

  it('anual sin trial: frequency 12, monto 35880, sin start_date', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'pre-2', status: 'pending' })))
    const { mpCrearPreapproval } = await import('@/lib/suscripciones/mercadopago')
    await mpCrearPreapproval({ userId: 7, email: 'p@x.cl', periodicidad: 'anual', conTrial: false })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.auto_recurring.frequency).toBe(12)
    expect(body.auto_recurring.transaction_amount).toBe(35880)
    expect(body.auto_recurring.start_date).toBeUndefined()
  })

  it('propaga errores HTTP con contexto', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"bad"}', { status: 400 }))
    const { mpObtenerPreapproval } = await import('@/lib/suscripciones/mercadopago')
    await expect(mpObtenerPreapproval('pre-x')).rejects.toThrow(/MercadoPago 400/)
  })

  it('mpHabilitado depende de MP_ACCESS_TOKEN', async () => {
    const { mpHabilitado } = await import('@/lib/suscripciones/mercadopago')
    expect(mpHabilitado()).toBe(true)
    vi.stubEnv('MP_ACCESS_TOKEN', '')
    expect(mpHabilitado()).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y verificar FAIL**

Run: `pnpm exec vitest run tests/unit/mercadopago.test.ts`

- [ ] **Step 3: Implementar `lib/suscripciones/mercadopago.ts`**

```ts
// ---------------------------------------------------------------------------
// Cliente mínimo de la API de MercadoPago (suscripciones "sin plan asociado"):
// cada suscripción se crea como un preapproval con su auto_recurring inline y
// status 'pending' — la respuesta trae un init_point donde el pagador ingresa
// su tarjeta. Sin SDK (patrón Resend: fetch directo). El trial de 15 días se
// modela con start_date = hoy+15d (MP no cobra nada antes de esa fecha).
// ---------------------------------------------------------------------------

const MP_API = 'https://api.mercadopago.com'

export const PRECIOS_CLP = { mensual: 3490, anual: 35880 } as const
export type Periodicidad = keyof typeof PRECIOS_CLP
export const TRIAL_DIAS = 15

export interface MpPreapproval {
  id: string
  status: 'pending' | 'authorized' | 'paused' | 'cancelled'
  external_reference?: string
  payer_email?: string
  init_point?: string
  next_payment_date?: string
  reason?: string
  auto_recurring?: {
    frequency: number
    frequency_type: string
    transaction_amount: number
    currency_id: string
    start_date?: string
  }
}

export interface MpPagoAutorizado {
  id: string | number
  preapproval_id: string
  status: string
  transaction_amount?: number
  date_created?: string
  payment?: { id?: number; status?: string; status_detail?: string }
}

export function mpHabilitado(): boolean {
  return Boolean(process.env.MP_ACCESS_TOKEN)
}

async function mpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) throw new Error('MP_ACCESS_TOKEN no configurado')
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '')
    throw new Error(`MercadoPago ${res.status} en ${path}: ${cuerpo.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

export async function mpCrearPreapproval(opts: {
  userId: number
  email: string
  periodicidad: Periodicidad
  conTrial: boolean
}): Promise<MpPreapproval> {
  const { userId, email, periodicidad, conTrial } = opts
  const base = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  const startDate = conTrial
    ? new Date(Date.now() + TRIAL_DIAS * 86_400_000).toISOString()
    : undefined
  return mpFetch<MpPreapproval>('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: periodicidad === 'anual' ? 'EduBox Pro (anual)' : 'EduBox Pro (mensual)',
      external_reference: String(userId),
      payer_email: email,
      back_url: `${base}/cuenta?suscripcion=retorno`,
      status: 'pending',
      auto_recurring: {
        frequency: periodicidad === 'anual' ? 12 : 1,
        frequency_type: 'months',
        transaction_amount: PRECIOS_CLP[periodicidad],
        currency_id: 'CLP',
        ...(startDate ? { start_date: startDate } : {}),
      },
    }),
  })
}

export const mpObtenerPreapproval = (id: string) =>
  mpFetch<MpPreapproval>(`/preapproval/${id}`)

export const mpCancelarPreapproval = (id: string) =>
  mpFetch<MpPreapproval>(`/preapproval/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'cancelled' }),
  })

export const mpObtenerPagoAutorizado = (id: string) =>
  mpFetch<MpPagoAutorizado>(`/authorized_payments/${id}`)
```

- [ ] **Step 4: Correr y verificar PASS**

Run: `pnpm exec vitest run tests/unit/mercadopago.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/suscripciones/mercadopago.ts tests/unit/mercadopago.test.ts
git commit -m "feat(suscripciones): cliente REST de MercadoPago (preapproval con trial)"
```

---

### Task 5: Sincronización de estado y registro de pagos

**Files:**
- Create: `lib/suscripciones/sync.ts`
- Test: `tests/integration/suscripciones.test.ts` (extender)

**Interfaces:**
- Consumes: tablas Task 1, tipos `MpPreapproval`/`MpPagoAutorizado` Task 4.
- Produces:
  - `estadoDesdeMp(status: MpPreapproval['status'], trialTerminaEl: Date | null, ahora?: Date): 'pendiente' | 'trial' | 'activa' | 'morosa' | 'cancelada'` (pura)
  - `sincronizarPreapproval(pre: MpPreapproval): Promise<void>` — upsert de la fila del usuario (resuelve `userId` por `mpPreapprovalId` existente o `external_reference`); al entrar a `trial` marca `usuarios.trialUsadoEl` si es null.
  - `registrarPagoAutorizado(pago: MpPagoAutorizado): Promise<void>` — inserta en `pagos_suscripcion` (idempotente); `rejected` → estado `morosa`; `approved` → estado `activa` (salvo `cancelada`).

- [ ] **Step 1: Tests que fallan**

Agregar a `tests/integration/suscripciones.test.ts`:

```ts
import {
  estadoDesdeMp,
  sincronizarPreapproval,
  registrarPagoAutorizado,
} from '@/lib/suscripciones/sync'
import type { MpPreapproval } from '@/lib/suscripciones/mercadopago'

describe('sincronización con MercadoPago', () => {
  it('estadoDesdeMp mapea los estados de MP', () => {
    const futuro = enDias(10)
    const pasado = enDias(-1)
    expect(estadoDesdeMp('pending', null)).toBe('pendiente')
    expect(estadoDesdeMp('authorized', futuro)).toBe('trial')
    expect(estadoDesdeMp('authorized', pasado)).toBe('activa')
    expect(estadoDesdeMp('authorized', null)).toBe('activa')
    expect(estadoDesdeMp('paused', null)).toBe('morosa')
    expect(estadoDesdeMp('cancelled', null)).toBe('cancelada')
  })

  it('sincronizarPreapproval crea la fila vía external_reference y marca el trial', async () => {
    const u = await crearUsuario('sync-alta')
    const pre: MpPreapproval = {
      id: `pre-${Date.now()}`,
      status: 'authorized',
      external_reference: String(u.id),
      next_payment_date: enDias(15).toISOString(),
      auto_recurring: {
        frequency: 1, frequency_type: 'months', transaction_amount: 3490,
        currency_id: 'CLP', start_date: enDias(15).toISOString(),
      },
    }
    await sincronizarPreapproval(pre)

    const [s] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s.estado).toBe('trial')
    expect(s.origen).toBe('mercadopago')
    expect(s.periodicidad).toBe('mensual')
    expect(s.mpPreapprovalId).toBe(pre.id)
    expect(s.periodoHasta).toBeInstanceOf(Date)

    const [u2] = await db.select().from(usuarios).where(eq(usuarios.id, u.id))
    expect(u2.trialUsadoEl).toBeInstanceOf(Date)

    // Reentrega del webhook con cancelación: actualiza la MISMA fila.
    await sincronizarPreapproval({ ...pre, status: 'cancelled' })
    const [s2] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s2.id).toBe(s.id)
    expect(s2.estado).toBe('cancelada')
  })

  it('registrarPagoAutorizado inserta idempotente y ajusta el estado', async () => {
    const u = await crearUsuario('sync-pago')
    const preId = `pre-pago-${Date.now()}`
    await db.insert(suscripciones).values({
      userId: u.id, origen: 'mercadopago', estado: 'activa', mpPreapprovalId: preId,
    })
    const pago = {
      id: `ap-${Date.now()}`, preapproval_id: preId, status: 'rejected',
      transaction_amount: 3490, payment: { status_detail: 'cc_rejected_insufficient_amount' },
    }
    await registrarPagoAutorizado(pago)
    await registrarPagoAutorizado(pago) // reentrega del webhook

    const filas = await db
      .select()
      .from(pagosSuscripcion)
      .where(eq(pagosSuscripcion.mpPaymentId, String(pago.id)))
    expect(filas.length).toBe(1)
    expect(filas[0].montoClp).toBe(3490)

    const [s] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s.estado).toBe('morosa')

    await registrarPagoAutorizado({ ...pago, id: `ap2-${Date.now()}`, status: 'approved' })
    const [s2] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s2.estado).toBe('activa')
  })
})
```

- [ ] **Step 2: Correr y verificar FAIL**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec vitest run tests/integration/suscripciones.test.ts`

- [ ] **Step 3: Implementar `lib/suscripciones/sync.ts`**

```ts
import { eq, isNull, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pagosSuscripcion, suscripciones, usuarios } from '@/lib/db/schema'
import type { MpPagoAutorizado, MpPreapproval } from '@/lib/suscripciones/mercadopago'

// ---------------------------------------------------------------------------
// La fila de `suscripciones` es un CACHE del preapproval en MercadoPago. Estas
// funciones son el ÚNICO punto que escribe estado desde MP (webhook y
// reconciliación llaman aquí), así el mapeo vive en un solo lugar.
// ---------------------------------------------------------------------------

export type EstadoSuscripcion = 'pendiente' | 'trial' | 'activa' | 'morosa' | 'cancelada'

export function estadoDesdeMp(
  status: MpPreapproval['status'],
  trialTerminaEl: Date | null,
  ahora = new Date(),
): EstadoSuscripcion {
  if (status === 'authorized') {
    return trialTerminaEl && ahora < trialTerminaEl ? 'trial' : 'activa'
  }
  if (status === 'paused') return 'morosa'
  if (status === 'cancelled') return 'cancelada'
  return 'pendiente'
}

export async function sincronizarPreapproval(pre: MpPreapproval): Promise<void> {
  const [fila] = await db
    .select()
    .from(suscripciones)
    .where(eq(suscripciones.mpPreapprovalId, pre.id))
    .limit(1)

  let userId = fila?.userId ?? null
  if (userId == null) {
    const ref = Number(pre.external_reference)
    if (Number.isFinite(ref) && ref > 0) userId = ref
  }
  if (userId == null) {
    console.warn(`[suscripciones] preapproval ${pre.id} sin usuario resoluble; se ignora`)
    return
  }

  const ahora = new Date()
  const trialTerminaEl =
    fila?.trialTerminaEl ??
    (pre.auto_recurring?.start_date ? new Date(pre.auto_recurring.start_date) : null)
  const estado = estadoDesdeMp(pre.status, trialTerminaEl, ahora)
  const valores = {
    origen: 'mercadopago' as const,
    estado,
    periodicidad: pre.auto_recurring?.frequency === 12 ? 'anual' : 'mensual',
    mpPreapprovalId: pre.id,
    trialTerminaEl,
    periodoHasta: pre.next_payment_date
      ? new Date(pre.next_payment_date)
      : (fila?.periodoHasta ?? null),
    updatedAt: ahora,
  }

  if (fila) {
    await db.update(suscripciones).set(valores).where(eq(suscripciones.id, fila.id))
  } else {
    // onConflict por user_id: si el usuario ya tenía otra fila (p. ej. una
    // cortesía vencida o un checkout anterior), la suscripción de MP la pisa.
    await db
      .insert(suscripciones)
      .values({ userId, ...valores })
      .onConflictDoUpdate({ target: suscripciones.userId, set: valores })
  }

  // Candado un-trial-por-vida: se quema cuando MP autoriza un trial.
  if (estado === 'trial') {
    await db
      .update(usuarios)
      .set({ trialUsadoEl: ahora })
      .where(and(eq(usuarios.id, userId), isNull(usuarios.trialUsadoEl)))
  }
}

export async function registrarPagoAutorizado(pago: MpPagoAutorizado): Promise<void> {
  const [s] = await db
    .select()
    .from(suscripciones)
    .where(eq(suscripciones.mpPreapprovalId, pago.preapproval_id))
    .limit(1)
  if (!s) {
    console.warn(`[suscripciones] pago ${pago.id} de preapproval desconocido ${pago.preapproval_id}`)
    return
  }

  await db
    .insert(pagosSuscripcion)
    .values({
      userId: s.userId,
      suscripcionId: s.id,
      mpPaymentId: String(pago.id),
      montoClp: Math.round(pago.transaction_amount ?? 0),
      estado: pago.status ?? 'desconocido',
      detalle: { status_detail: pago.payment?.status_detail ?? null },
    })
    .onConflictDoNothing({ target: pagosSuscripcion.mpPaymentId })

  const ahora = new Date()
  if (pago.status === 'rejected' && (s.estado === 'activa' || s.estado === 'trial')) {
    await db
      .update(suscripciones)
      .set({ estado: 'morosa', updatedAt: ahora })
      .where(eq(suscripciones.id, s.id))
  } else if (pago.status === 'approved' && s.estado !== 'cancelada') {
    await db
      .update(suscripciones)
      .set({ estado: 'activa', updatedAt: ahora })
      .where(eq(suscripciones.id, s.id))
  }
}
```

- [ ] **Step 4: Correr y verificar PASS**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec vitest run tests/integration/suscripciones.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/suscripciones/sync.ts tests/integration/suscripciones.test.ts
git commit -m "feat(suscripciones): sincronización de estado y registro de pagos desde MP"
```

---

### Task 6: Webhook de MercadoPago (firma + ruta)

**Files:**
- Create: `lib/suscripciones/webhook.ts`
- Create: `app/api/webhooks/mercadopago/route.ts`
- Test: `tests/unit/mp-webhook.test.ts`

**Interfaces:**
- Consumes: `sincronizarPreapproval`/`registrarPagoAutorizado` (Task 5), `mpObtenerPreapproval`/`mpObtenerPagoAutorizado` (Task 4).
- Produces:
  - `validarFirmaMp(opts: { xSignature: string | null; xRequestId: string | null; dataId: string; secret: string }): boolean`
  - `procesarEventoMp(tipo: string, dataId: string, deps?: { obtenerPreapproval: typeof mpObtenerPreapproval; obtenerPagoAutorizado: typeof mpObtenerPagoAutorizado }): Promise<void>`
  - Endpoint `POST /api/webhooks/mercadopago` (URL a registrar en el panel de MP).

- [ ] **Step 1: Test unitario de la firma que falla**

Crear `tests/unit/mp-webhook.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { validarFirmaMp } from '@/lib/suscripciones/webhook'

// Formato oficial de MP: header `x-signature: ts=<ts>,v1=<hmac>` donde
// v1 = HMAC-SHA256(secret, `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`).
describe('validarFirmaMp', () => {
  const secret = 'secreto-mp'
  const dataId = 'pre-123'
  const requestId = 'req-abc'
  const ts = '1700000000'
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex')

  it('acepta una firma válida', () => {
    expect(
      validarFirmaMp({
        xSignature: `ts=${ts},v1=${v1}`, xRequestId: requestId, dataId, secret,
      }),
    ).toBe(true)
  })

  it('rechaza firma alterada, header ausente o malformado', () => {
    expect(
      validarFirmaMp({ xSignature: `ts=${ts},v1=${'0'.repeat(64)}`, xRequestId: requestId, dataId, secret }),
    ).toBe(false)
    expect(validarFirmaMp({ xSignature: null, xRequestId: requestId, dataId, secret })).toBe(false)
    expect(validarFirmaMp({ xSignature: 'basura', xRequestId: requestId, dataId, secret })).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y verificar FAIL**

Run: `pnpm exec vitest run tests/unit/mp-webhook.test.ts`

- [ ] **Step 3: Implementar `lib/suscripciones/webhook.ts`**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  mpObtenerPagoAutorizado,
  mpObtenerPreapproval,
} from '@/lib/suscripciones/mercadopago'
import {
  registrarPagoAutorizado,
  sincronizarPreapproval,
} from '@/lib/suscripciones/sync'

/**
 * Valida el header x-signature de MercadoPago (`ts=...,v1=...`):
 * v1 = HMAC-SHA256(secret, `id:{data.id};request-id:{x-request-id};ts:{ts};`).
 */
export function validarFirmaMp(opts: {
  xSignature: string | null
  xRequestId: string | null
  dataId: string
  secret: string
}): boolean {
  const { xSignature, xRequestId, dataId, secret } = opts
  if (!xSignature) return false
  const partes = new Map(
    xSignature
      .split(',')
      .map((p) => p.split('=', 2).map((s) => s.trim()) as [string, string])
      .filter((p) => p.length === 2 && p[0] && p[1]),
  )
  const ts = partes.get('ts')
  const v1 = partes.get('v1')
  if (!ts || !v1) return false
  const manifest = `id:${dataId};request-id:${xRequestId ?? ''};ts:${ts};`
  const esperado = createHmac('sha256', secret).update(manifest).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(esperado), Buffer.from(v1))
  } catch {
    return false
  }
}

/**
 * Procesa una notificación: consulta la entidad real en MP (nunca confía en el
 * cuerpo del webhook) y sincroniza. `deps` permite inyectar fakes en tests.
 */
export async function procesarEventoMp(
  tipo: string,
  dataId: string,
  deps = {
    obtenerPreapproval: mpObtenerPreapproval,
    obtenerPagoAutorizado: mpObtenerPagoAutorizado,
  },
): Promise<void> {
  if (tipo === 'subscription_preapproval') {
    await sincronizarPreapproval(await deps.obtenerPreapproval(dataId))
  } else if (tipo === 'subscription_authorized_payment') {
    await registrarPagoAutorizado(await deps.obtenerPagoAutorizado(dataId))
  }
  // Otros tipos (payment, plan) se ignoran a propósito.
}
```

- [ ] **Step 4: Implementar la ruta `app/api/webhooks/mercadopago/route.ts`**

```ts
import { procesarEventoMp, validarFirmaMp } from '@/lib/suscripciones/webhook'

export const runtime = 'nodejs'

/**
 * Webhook de MercadoPago (suscripciones). MP reintenta ante respuestas no-2xx,
 * así que: firma inválida → 401 (no reintentable con otra firma igual da
 * igual), error de proceso → 500 (queremos el reintento). El tipo y data.id
 * llegan por query string y/o cuerpo según el evento; se aceptan ambos.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  const body = (await request.json().catch(() => null)) as {
    type?: string
    data?: { id?: string | number }
  } | null

  const dataId = url.searchParams.get('data.id') ?? String(body?.data?.id ?? '')
  const tipo = url.searchParams.get('type') ?? body?.type ?? ''
  if (!dataId || !tipo) return Response.json({ ok: true })

  const secret = process.env.MP_WEBHOOK_SECRET
  if (secret) {
    const ok = validarFirmaMp({
      xSignature: request.headers.get('x-signature'),
      xRequestId: request.headers.get('x-request-id'),
      dataId: dataId.toLowerCase(),
      secret,
    })
    if (!ok) return new Response('Firma inválida', { status: 401 })
  }

  try {
    await procesarEventoMp(tipo, dataId)
  } catch (err) {
    console.error('[mp-webhook] error procesando evento:', err)
    return new Response('Error', { status: 500 })
  }
  return Response.json({ ok: true })
}
```

- [ ] **Step 5: Test de integración de `procesarEventoMp` con deps fake**

Agregar a `tests/integration/suscripciones.test.ts`:

```ts
import { procesarEventoMp } from '@/lib/suscripciones/webhook'

describe('procesarEventoMp', () => {
  it('subscription_preapproval consulta MP y sincroniza', async () => {
    const u = await crearUsuario('wh-pre')
    const pre: MpPreapproval = {
      id: `wh-${Date.now()}`, status: 'authorized', external_reference: String(u.id),
      next_payment_date: enDias(30).toISOString(),
    }
    await procesarEventoMp('subscription_preapproval', pre.id, {
      obtenerPreapproval: async () => pre,
      obtenerPagoAutorizado: async () => { throw new Error('no debe llamarse') },
    })
    const [s] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s.estado).toBe('activa')
  })
})
```

- [ ] **Step 6: Correr ambos y verificar PASS**

Run: `pnpm exec vitest run tests/unit/mp-webhook.test.ts`
Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec vitest run tests/integration/suscripciones.test.ts`

- [ ] **Step 7: Commit**

```bash
git add lib/suscripciones/webhook.ts app/api/webhooks/mercadopago tests/unit/mp-webhook.test.ts tests/integration/suscripciones.test.ts
git commit -m "feat(suscripciones): webhook de MercadoPago con validación de firma"
```

---

### Task 7: Server actions del usuario (iniciar, cancelar, reconciliar)

**Files:**
- Create: `lib/actions/suscripciones.ts`
- Create: `lib/queries/suscripciones.ts`
- Test: `tests/integration/suscripciones-actions.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5 (`planEfectivo`, `esProSuscripcion`, `mpCrearPreapproval`, `mpCancelarPreapproval`, `mpObtenerPreapproval`, `sincronizarPreapproval`).
- Produces:
  - `suscripcionDeUsuario(userId: number): Promise<Suscripcion | null>` (query)
  - `iniciarSuscripcion(periodicidad: 'mensual' | 'anual'): Promise<{ error: string } | { initPoint: string }>`
  - `cancelarMiSuscripcion(): Promise<{ error: string } | { ok: true }>`
  - `reconciliarMiSuscripcion(): Promise<void>` — si hay fila MP, consulta el preapproval y sincroniza; nunca lanza.

- [ ] **Step 1: Query `lib/queries/suscripciones.ts`**

```ts
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { suscripciones } from '@/lib/db/schema'
import type { Suscripcion } from '@/lib/suscripciones/entitlements'

export async function suscripcionDeUsuario(userId: number): Promise<Suscripcion | null> {
  const [s] = await db
    .select()
    .from(suscripciones)
    .where(eq(suscripciones.userId, userId))
    .limit(1)
  return s ?? null
}
```

- [ ] **Step 2: Tests que fallan**

Crear `tests/integration/suscripciones-actions.test.ts` (mismo patrón de mocks que `tests/integration/carpetas.test.ts`; el módulo `mercadopago` se mockea completo):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { suscripciones, usuarios } from '@/lib/db/schema'

let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const mpCrearPreapproval = vi.fn()
const mpCancelarPreapproval = vi.fn()
const mpObtenerPreapproval = vi.fn()
vi.mock('@/lib/suscripciones/mercadopago', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  mpHabilitado: () => true,
  mpCrearPreapproval: (...a: unknown[]) => mpCrearPreapproval(...a),
  mpCancelarPreapproval: (...a: unknown[]) => mpCancelarPreapproval(...a),
  mpObtenerPreapproval: (...a: unknown[]) => mpObtenerPreapproval(...a),
}))

const { iniciarSuscripcion, cancelarMiSuscripcion } = await import(
  '@/lib/actions/suscripciones'
)

async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

beforeEach(() => {
  mpCrearPreapproval.mockReset()
  mpCancelarPreapproval.mockReset()
  mpObtenerPreapproval.mockReset()
})

describe('iniciarSuscripcion', () => {
  it('crea el preapproval con trial (primera vez) y guarda la fila pendiente', async () => {
    const u = await crearUsuario('act-inicio')
    currentUserId = u.id
    mpCrearPreapproval.mockResolvedValue({
      id: 'pre-nuevo', status: 'pending', init_point: 'https://mp/checkout',
      auto_recurring: { start_date: new Date(Date.now() + 15 * 86_400_000).toISOString() },
    })

    const r = await iniciarSuscripcion('mensual')
    expect(r).toEqual({ initPoint: 'https://mp/checkout' })
    expect(mpCrearPreapproval).toHaveBeenCalledWith(
      expect.objectContaining({ userId: u.id, periodicidad: 'mensual', conTrial: true }),
    )
    const [s] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s.estado).toBe('pendiente')
    expect(s.mpPreapprovalId).toBe('pre-nuevo')
  })

  it('sin trial si trialUsadoEl ya está marcado; error si ya es Pro', async () => {
    const u = await crearUsuario('act-retrial')
    await db.update(usuarios).set({ trialUsadoEl: new Date() }).where(eq(usuarios.id, u.id))
    currentUserId = u.id
    mpCrearPreapproval.mockResolvedValue({ id: 'pre-2', status: 'pending', init_point: 'https://mp/2' })

    await iniciarSuscripcion('anual')
    expect(mpCrearPreapproval).toHaveBeenCalledWith(
      expect.objectContaining({ conTrial: false, periodicidad: 'anual' }),
    )

    // Ya Pro → error, sin llamar a MP de nuevo.
    await db
      .update(suscripciones)
      .set({ estado: 'activa' })
      .where(eq(suscripciones.userId, u.id))
    mpCrearPreapproval.mockClear()
    const r = await iniciarSuscripcion('mensual')
    expect('error' in r).toBe(true)
    expect(mpCrearPreapproval).not.toHaveBeenCalled()
  })
})

describe('cancelarMiSuscripcion', () => {
  it('cancela en MP y sincroniza el estado local', async () => {
    const u = await crearUsuario('act-cancel')
    currentUserId = u.id
    await db.insert(suscripciones).values({
      userId: u.id, origen: 'mercadopago', estado: 'activa',
      mpPreapprovalId: 'pre-cancel', periodoHasta: new Date(Date.now() + 10 * 86_400_000),
    })
    mpCancelarPreapproval.mockResolvedValue({
      id: 'pre-cancel', status: 'cancelled', external_reference: String(u.id),
    })
    const r = await cancelarMiSuscripcion()
    expect(r).toEqual({ ok: true })
    const [s] = await db.select().from(suscripciones).where(eq(suscripciones.userId, u.id))
    expect(s.estado).toBe('cancelada')
    // Conserva Pro hasta periodoHasta (no se borra).
    expect(s.periodoHasta).toBeInstanceOf(Date)
  })

  it('error si no hay suscripción de MP', async () => {
    const u = await crearUsuario('act-cancel-nada')
    currentUserId = u.id
    const r = await cancelarMiSuscripcion()
    expect('error' in r).toBe(true)
  })
})
```

- [ ] **Step 3: Correr y verificar FAIL**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec vitest run tests/integration/suscripciones-actions.test.ts`

- [ ] **Step 4: Implementar `lib/actions/suscripciones.ts`**

```ts
'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { suscripciones, usuarios } from '@/lib/db/schema'
import { getSession } from '@/lib/get-session'
import { esProSuscripcion } from '@/lib/suscripciones/entitlements'
import {
  mpCancelarPreapproval,
  mpCrearPreapproval,
  mpHabilitado,
  mpObtenerPreapproval,
  type Periodicidad,
} from '@/lib/suscripciones/mercadopago'
import { sincronizarPreapproval } from '@/lib/suscripciones/sync'
import { suscripcionDeUsuario } from '@/lib/queries/suscripciones'

export type ResultadoInicio = { error: string } | { initPoint: string }
export type ResultadoCancelar = { error: string } | { ok: true }

async function usuarioActual() {
  const session = await getSession()
  if (!session) return null
  return Number(session.user.id)
}

/** Crea el preapproval en MP y devuelve el init_point para redirigir. */
export async function iniciarSuscripcion(
  periodicidad: Periodicidad,
): Promise<ResultadoInicio> {
  const userId = await usuarioActual()
  if (!userId) return { error: 'Debes iniciar sesión.' }
  if (periodicidad !== 'mensual' && periodicidad !== 'anual') {
    return { error: 'Periodicidad no válida.' }
  }
  if (!mpHabilitado()) {
    return { error: 'Los pagos aún no están habilitados. Escríbenos a contacto@edubox.cl.' }
  }

  const existente = await suscripcionDeUsuario(userId)
  if (existente && esProSuscripcion(existente)) {
    return { error: 'Ya tienes EduBox Pro activo.' }
  }

  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, userId)).limit(1)
  if (!u) return { error: 'Usuario no encontrado.' }
  const conTrial = u.trialUsadoEl == null

  try {
    const pre = await mpCrearPreapproval({
      userId, email: u.email, periodicidad, conTrial,
    })
    if (!pre.init_point) return { error: 'MercadoPago no devolvió el checkout. Intenta de nuevo.' }

    const valores = {
      origen: 'mercadopago' as const,
      periodicidad,
      estado: 'pendiente' as const,
      mpPreapprovalId: pre.id,
      trialTerminaEl: pre.auto_recurring?.start_date
        ? new Date(pre.auto_recurring.start_date)
        : null,
      updatedAt: new Date(),
    }
    await db
      .insert(suscripciones)
      .values({ userId, ...valores })
      .onConflictDoUpdate({ target: suscripciones.userId, set: valores })

    revalidatePath('/cuenta')
    return { initPoint: pre.init_point }
  } catch (err) {
    console.error('[suscripciones] error creando preapproval:', err)
    return { error: 'No pudimos iniciar la suscripción. Intenta de nuevo en unos minutos.' }
  }
}

/** Cancela en MP; el usuario conserva Pro hasta el fin del período pagado. */
export async function cancelarMiSuscripcion(): Promise<ResultadoCancelar> {
  const userId = await usuarioActual()
  if (!userId) return { error: 'Debes iniciar sesión.' }

  const s = await suscripcionDeUsuario(userId)
  if (!s || s.origen !== 'mercadopago' || !s.mpPreapprovalId) {
    return { error: 'No tienes una suscripción que cancelar.' }
  }
  if (s.estado === 'cancelada') return { error: 'Tu suscripción ya está cancelada.' }

  try {
    const pre = await mpCancelarPreapproval(s.mpPreapprovalId)
    await sincronizarPreapproval({ ...pre, external_reference: String(userId) })
    revalidatePath('/cuenta')
    return { ok: true }
  } catch (err) {
    console.error('[suscripciones] error cancelando:', err)
    return { error: 'No pudimos cancelar. Intenta de nuevo o escríbenos.' }
  }
}

/**
 * Reconciliación: re-consulta MP y sincroniza (red de seguridad si un webhook
 * se perdió). Se llama al cargar /cuenta cuando la fila lo amerita. Nunca lanza.
 */
export async function reconciliarMiSuscripcion(): Promise<void> {
  const userId = await usuarioActual()
  if (!userId) return
  const s = await suscripcionDeUsuario(userId)
  if (!s || s.origen !== 'mercadopago' || !s.mpPreapprovalId || !mpHabilitado()) return
  try {
    const pre = await mpObtenerPreapproval(s.mpPreapprovalId)
    await sincronizarPreapproval({ ...pre, external_reference: String(userId) })
  } catch (err) {
    console.warn('[suscripciones] reconciliación falló (se reintenta en la próxima carga):', err)
  }
}
```

- [ ] **Step 5: Correr y verificar PASS**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec vitest run tests/integration/suscripciones-actions.test.ts`

- [ ] **Step 6: Commit**

```bash
git add lib/actions/suscripciones.ts lib/queries/suscripciones.ts tests/integration/suscripciones-actions.test.ts
git commit -m "feat(suscripciones): actions de usuario — iniciar, cancelar y reconciliar"
```

---

### Task 8: /cuenta — sección «Plan»

**Files:**
- Create: `components/cuenta/plan-cuenta.tsx` (client)
- Modify: `app/(app)/cuenta/page.tsx`

**Interfaces:**
- Consumes: `planEfectivo`, `cuotaImportaciones` (Task 2), actions de Task 7, `mpHabilitado`, `PRECIOS_CLP`.
- Produces: `<PlanCuenta datos={DatosPlan} />` con `interface DatosPlan { plan: 'free' | 'pro'; origen: 'suscripcion' | 'cortesia' | 'colegio' | null; estado: string | null; periodicidad: string | null; periodoHasta: string | null; trialTerminaEl: string | null; cuota: { limite: number; usadas: number; restantes: number }; pagosHabilitados: boolean }` (fechas serializadas como ISO string — las server actions/props no pasan `Date` a client components sin serializar).

- [ ] **Step 1: Página `app/(app)/cuenta/page.tsx`**

`searchParams` es `Promise` en este Next (ver `node_modules/next/dist/docs/`). Reescribir la página para: (a) aceptar `searchParams: Promise<{ suscripcion?: string }>`, (b) reconciliar cuando corresponde, (c) renderizar `PlanCuenta` arriba del bloque existente:

```tsx
import { planEfectivo, cuotaImportaciones } from '@/lib/suscripciones/entitlements'
import { reconciliarMiSuscripcion } from '@/lib/actions/suscripciones'
import { mpHabilitado } from '@/lib/suscripciones/mercadopago'
import { PlanCuenta } from '@/components/cuenta/plan-cuenta'
```

Dentro del componente (tras `requireActor()`):

```tsx
  const { suscripcion: retorno } = await searchParams

  // Red de seguridad: al volver del checkout de MP (?suscripcion=retorno) o si
  // quedó una fila 'pendiente', re-consultar MP antes de renderizar.
  const previo = await planEfectivo(actor.userId)
  if (retorno === 'retorno' || previo.suscripcion?.estado === 'pendiente') {
    await reconciliarMiSuscripcion()
  }
  const plan = await planEfectivo(actor.userId)
  const cuota = await cuotaImportaciones(actor.userId)
  const s = plan.suscripcion
  const datosPlan = {
    plan: plan.plan,
    origen: plan.origen,
    estado: s?.estado ?? null,
    periodicidad: s?.periodicidad ?? null,
    periodoHasta: s?.periodoHasta?.toISOString() ?? null,
    trialTerminaEl: s?.trialTerminaEl?.toISOString() ?? null,
    cuota: { limite: cuota.limite, usadas: cuota.usadas, restantes: cuota.restantes },
    pagosHabilitados: mpHabilitado(),
  }
```

Y en el JSX, como primer hijo del contenedor: `<PlanCuenta datos={datosPlan} />`.

- [ ] **Step 2: Componente `components/cuenta/plan-cuenta.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { iniciarSuscripcion, cancelarMiSuscripcion } from '@/lib/actions/suscripciones'

export interface DatosPlan {
  plan: 'free' | 'pro'
  origen: 'suscripcion' | 'cortesia' | 'colegio' | null
  estado: string | null
  periodicidad: string | null
  periodoHasta: string | null
  trialTerminaEl: string | null
  cuota: { limite: number; usadas: number; restantes: number }
  pagosHabilitados: boolean
}

const fecha = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
    : null

export function PlanCuenta({ datos }: { datos: DatosPlan }) {
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const suscribir = (periodicidad: 'mensual' | 'anual') =>
    startTransition(async () => {
      setError(null)
      const r = await iniciarSuscripcion(periodicidad)
      if ('error' in r) setError(r.error)
      else window.location.href = r.initPoint
    })

  const cancelar = () =>
    startTransition(async () => {
      if (!window.confirm('¿Cancelar tu suscripción? Conservas Pro hasta el fin del período ya pagado.')) return
      setError(null)
      const r = await cancelarMiSuscripcion()
      if ('error' in r) setError(r.error)
      else router.refresh()
    })

  const esProPropio = datos.plan === 'pro' && datos.origen === 'suscripcion'

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Tu plan</h2>
          <Badge variant={datos.plan === 'pro' ? 'default' : 'secondary'}>
            {datos.plan === 'pro' ? 'EduBox Pro' : 'Gratis'}
          </Badge>
        </div>

        {datos.origen === 'colegio' && (
          <p className="text-sm text-muted-foreground">
            Tienes Pro por la licencia de tu colegio.
          </p>
        )}
        {datos.origen === 'cortesia' && (
          <p className="text-sm text-muted-foreground">
            Tienes Pro de cortesía hasta el {fecha(datos.periodoHasta)}.
          </p>
        )}
        {datos.estado === 'trial' && (
          <p className="text-sm text-muted-foreground">
            Estás en tu prueba gratis: el primer cobro será el {fecha(datos.trialTerminaEl)}.
          </p>
        )}
        {datos.estado === 'morosa' && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            Tu último pago falló. Actualiza tu medio de pago en MercadoPago o tu
            plan volverá a Gratis en unos días. No perderás nada de tu contenido.
          </p>
        )}
        {datos.estado === 'cancelada' && datos.plan === 'pro' && (
          <p className="text-sm text-muted-foreground">
            Suscripción cancelada: conservas Pro hasta el {fecha(datos.periodoHasta)}.
          </p>
        )}

        <p className="text-sm text-muted-foreground">
          Importaciones con IA este mes: {datos.cuota.usadas} de {datos.cuota.limite}.
        </p>

        {datos.plan === 'free' && (
          <div className="flex flex-col gap-2">
            <Button onClick={() => suscribir('mensual')} disabled={pendiente || !datos.pagosHabilitados}>
              Pro mensual — $3.490/mes
            </Button>
            <Button variant="outline" onClick={() => suscribir('anual')} disabled={pendiente || !datos.pagosHabilitados}>
              Pro anual — $35.880/año (equivale a $2.990/mes)
            </Button>
            {!datos.pagosHabilitados && (
              <p className="text-xs text-muted-foreground">Los pagos estarán disponibles muy pronto.</p>
            )}
            <Link href="/precios" className="text-sm text-primary underline-offset-4 hover:underline">
              Ver qué incluye cada plan
            </Link>
          </div>
        )}

        {esProPropio && datos.estado !== 'cancelada' && (
          <div className="flex flex-col gap-1">
            <Button variant="outline" onClick={cancelar} disabled={pendiente}>
              Cancelar suscripción
            </Button>
            <p className="text-xs text-muted-foreground">
              ¿Quieres cambiar entre mensual y anual? Cancela y vuelve a
              suscribirte con la otra periodicidad (sin trial; conservas Pro
              hasta el fin del período ya pagado).
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
```

Nota: el primer cobro con trial es 15 días después de suscribirse; el copy usa `trialTerminaEl`. Ajustar imports de `Button`/`Badge`/`Card` a los paths reales de `components/ui/`.

- [ ] **Step 3: Lint + typecheck + verificación manual**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Run: `pnpm dev` → `/cuenta` muestra la tarjeta «Tu plan» (Gratis, botones deshabilitados sin `MP_ACCESS_TOKEN` con el aviso «muy pronto»).

- [ ] **Step 4: Commit**

```bash
git add components/cuenta/plan-cuenta.tsx "app/(app)/cuenta/page.tsx"
git commit -m "feat(suscripciones): sección Plan en /cuenta (suscribir, cancelar, estados)"
```

---

### Task 9: Página pública /precios + enlaces en el landing

**Files:**
- Create: `app/precios/page.tsx`
- Modify: `app/page.tsx` (enlace «Precios» en la nav y el footer)

**Interfaces:**
- Consumes: nada del servidor (página estática con los precios hardcodeados — la fuente de verdad de montos para COBRAR sigue siendo `PRECIOS_CLP`).

- [ ] **Step 1: Crear `app/precios/page.tsx`**

Página server, misma identidad del landing (tokens de marca, `font-heading`). Estructura completa:

```tsx
import Link from 'next/link'
import type { Metadata } from 'next'
import { Logo } from '@/components/brand/logo'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Precios — EduBox',
  description:
    'Planes de EduBox: Gratis para partir, Pro para importar sin límites y licencias para colegios.',
}

const PLANES = [
  {
    nombre: 'Gratis',
    precio: '$0',
    detalle: 'para siempre',
    cta: { href: '/registro', texto: 'Crear cuenta' },
    destacado: false,
    incluye: [
      'Banco de preguntas ilimitado',
      'Pruebas en PDF ilimitadas',
      'Textos de comprensión y carpetas',
      'Banco compartido del colegio',
      '3 importaciones con IA al mes',
    ],
  },
  {
    nombre: 'Pro',
    precio: '$3.490',
    detalle: '/mes · o $35.880/año (equivale a $2.990/mes)',
    cta: { href: '/cuenta', texto: 'Probar gratis 15 días' },
    destacado: true,
    incluye: [
      'Todo lo del plan Gratis',
      '100 importaciones con IA al mes',
      'Prueba gratis de 15 días',
      'Acceso anticipado a nuevas funciones (formas A/B, exportar a Word)',
    ],
  },
  {
    nombre: 'Colegio',
    precio: 'Conversemos',
    detalle: 'licencia anual por factura',
    cta: { href: 'mailto:contacto@edubox.cl?subject=Licencia%20EduBox%20para%20colegio', texto: 'Escríbenos' },
    destacado: false,
    incluye: [
      'Pro para todos los profesores del colegio',
      'Banco compartido y logo en las pruebas',
      'Factura y pago por transferencia',
      'Acompañamiento en la puesta en marcha',
    ],
  },
]

export default function PreciosPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-12">
      <header className="flex items-center justify-between">
        <Link href="/"><Logo /></Link>
        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
          Iniciar sesión
        </Link>
      </header>

      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Precios simples</h1>
        <p className="text-muted-foreground">
          Parte gratis. Paga solo si la IA te ahorra horas todos los meses.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {PLANES.map((p) => (
          <div
            key={p.nombre}
            className={
              p.destacado
                ? 'flex flex-col gap-4 rounded-2xl border-2 border-primary bg-card p-6 shadow-sm'
                : 'flex flex-col gap-4 rounded-2xl border border-border bg-card p-6'
            }
          >
            <div>
              <h2 className="font-heading text-xl font-semibold">{p.nombre}</h2>
              <p className="mt-1">
                <span className="font-heading text-3xl font-bold text-primary">{p.precio}</span>{' '}
                <span className="text-sm text-muted-foreground">{p.detalle}</span>
              </p>
            </div>
            <ul className="flex flex-1 flex-col gap-2 text-sm">
              {p.incluye.map((linea) => (
                <li key={linea} className="flex gap-2">
                  <span className="text-primary">✓</span>
                  <span>{linea}</span>
                </li>
              ))}
            </ul>
            <Link
              href={p.cta.href}
              className={buttonVariants({ variant: p.destacado ? 'default' : 'outline' })}
            >
              {p.cta.texto}
            </Link>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Precios en pesos chilenos, IVA incluido. Cancela cuando quieras: conservas
        todo tu contenido y vuelves al plan Gratis.
      </p>
    </main>
  )
}
```

Ajustar imports (`Logo`, `buttonVariants`) a los paths reales usados por `app/page.tsx`.

- [ ] **Step 2: Enlaces en el landing (`app/page.tsx`)**

- En la nav (junto a los anchors `#como-funciona`, `#funciones`, `#preguntas`): agregar `<Link href="/precios">Precios</Link>` con las mismas clases de los demás enlaces.
- En el footer (junto a `/privacidad` y `/terminos`): agregar `<Link href="/precios" className="hover:text-foreground">Precios</Link>`.

- [ ] **Step 3: Verificar**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Run: `pnpm dev` → `/precios` renderiza los 3 planes; landing muestra el enlace.

- [ ] **Step 4: Commit**

```bash
git add app/precios app/page.tsx
git commit -m "feat(suscripciones): página pública /precios enlazada desde el landing"
```

---

### Task 10: Admin — queries, actions y tab «Suscripciones»

**Files:**
- Create: `lib/queries/suscripciones-admin.ts`
- Create: `lib/actions/suscripciones-admin.ts`
- Create: `components/admin/conceder-cortesia.tsx`, `components/admin/licencia-colegio.tsx`
- Modify: `app/(app)/admin/page.tsx` (tab nueva)
- Test: `tests/integration/suscripciones-admin.test.ts`

**Interfaces:**
- Consumes: tablas Task 1, `mpCancelarPreapproval` + `sincronizarPreapproval` (Tasks 4-5).
- Produces:
  - Queries: `listarSuscripcionesAdmin(): Promise<Array<{ id: number; usuario: string; email: string; origen: string; periodicidad: string | null; estado: string; periodoHasta: Date | null; nota: string | null; createdAt: Date; userId: number }>>` · `resumenSuscripciones(): Promise<{ activas: number; enTrial: number; morosas: number; ingresoMesClp: number }>` · `pagosDeUsuario(userId: number): Promise<Array<typeof pagosSuscripcion.$inferSelect>>` · `listarLicencias(): Promise<Array<{ id: number; nombre: string; licenciaHasta: Date | null; licenciaNota: string | null }>>`
  - Actions (guard `global_admin` con `getActor()`, patrón de `lib/actions/admin.ts`): `concederCortesia(email: string, hastaISO: string, nota: string): Promise<{ error: string } | { ok: true }>` · `cancelarSuscripcionDeUsuario(userId: number): Promise<{ error: string } | { ok: true }>` · `fijarLicenciaColegio(colegioId: number, hastaISO: string | null, nota: string): Promise<{ error: string } | { ok: true }>`

- [ ] **Step 1: Tests de queries/actions que fallan**

Crear `tests/integration/suscripciones-admin.test.ts` (mock de `get-session` como en Task 7; crear un usuario `role: 'global_admin'` como actor y usuarios objetivo):

```ts
import { describe, it, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colegios, suscripciones, usuarios, pagosSuscripcion } from '@/lib/db/schema'

let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { concederCortesia, fijarLicenciaColegio, cancelarSuscripcionDeUsuario } =
  await import('@/lib/actions/suscripciones-admin')
const { resumenSuscripciones, pagosDeUsuario } = await import(
  '@/lib/queries/suscripciones-admin'
)
const { planEfectivo } = await import('@/lib/suscripciones/entitlements')

async function crearUsuario(prefijo: string, role = 'teacher') {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x', role })
    .returning()
  return u
}

describe('admin de suscripciones', () => {
  it('concederCortesia da Pro hasta la fecha indicada; teacher no puede', async () => {
    const admin = await crearUsuario('adm', 'global_admin')
    const profe = await crearUsuario('adm-profe')
    const hasta = new Date(Date.now() + 60 * 86_400_000).toISOString()

    currentUserId = profe.id
    expect('error' in (await concederCortesia(profe.email, hasta, 'piloto'))).toBe(true)

    currentUserId = admin.id
    const r = await concederCortesia(profe.email, hasta, 'piloto liceo A')
    expect(r).toEqual({ ok: true })
    const plan = await planEfectivo(profe.id)
    expect(plan.plan).toBe('pro')
    expect(plan.origen).toBe('cortesia')
  })

  it('no pisa una suscripción de MercadoPago vigente con una cortesía', async () => {
    const admin = await crearUsuario('adm2', 'global_admin')
    const profe = await crearUsuario('adm2-profe')
    await db.insert(suscripciones).values({
      userId: profe.id, origen: 'mercadopago', estado: 'activa', mpPreapprovalId: `p-${Date.now()}`,
    })
    currentUserId = admin.id
    const r = await concederCortesia(
      profe.email, new Date(Date.now() + 86_400_000).toISOString(), 'x',
    )
    expect('error' in r).toBe(true)
  })

  it('fijarLicenciaColegio activa y corta la licencia', async () => {
    const admin = await crearUsuario('adm3', 'global_admin')
    const [c] = await db
      .insert(colegios)
      .values({ nombre: 'Colegio Adm', joinCode: `adm-${Date.now()}` })
      .returning()
    currentUserId = admin.id
    const hasta = new Date(Date.now() + 365 * 86_400_000).toISOString()
    expect(await fijarLicenciaColegio(c.id, hasta, 'factura 123')).toEqual({ ok: true })
    let [fila] = await db.select().from(colegios).where(eq(colegios.id, c.id))
    expect(fila.licenciaHasta).toBeInstanceOf(Date)
    expect(fila.licenciaNota).toBe('factura 123')

    expect(await fijarLicenciaColegio(c.id, null, 'corte')).toEqual({ ok: true })
    ;[fila] = await db.select().from(colegios).where(eq(colegios.id, c.id))
    expect(fila.licenciaHasta).toBeNull()
  })

  it('cancelarSuscripcionDeUsuario termina una cortesía de inmediato', async () => {
    const admin = await crearUsuario('adm4', 'global_admin')
    const profe = await crearUsuario('adm4-profe')
    await db.insert(suscripciones).values({
      userId: profe.id, origen: 'cortesia', estado: 'activa',
      periodoHasta: new Date(Date.now() + 30 * 86_400_000),
    })
    currentUserId = admin.id
    expect(await cancelarSuscripcionDeUsuario(profe.id)).toEqual({ ok: true })
    expect((await planEfectivo(profe.id)).plan).toBe('free')
  })

  it('resumen y pagos por usuario', async () => {
    const profe = await crearUsuario('adm5-profe')
    const [s] = await db
      .insert(suscripciones)
      .values({ userId: profe.id, origen: 'mercadopago', estado: 'activa', mpPreapprovalId: `r-${Date.now()}` })
      .returning()
    await db.insert(pagosSuscripcion).values({
      userId: profe.id, suscripcionId: s.id, mpPaymentId: `pr-${Date.now()}`,
      montoClp: 3490, estado: 'approved',
    })
    const resumen = await resumenSuscripciones()
    expect(resumen.activas).toBeGreaterThanOrEqual(1)
    expect(resumen.ingresoMesClp).toBeGreaterThanOrEqual(3490)
    const pagos = await pagosDeUsuario(profe.id)
    expect(pagos.length).toBe(1)
  })
})
```

- [ ] **Step 2: Correr y verificar FAIL**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec vitest run tests/integration/suscripciones-admin.test.ts`

- [ ] **Step 3: Implementar `lib/queries/suscripciones-admin.ts`**

```ts
import { and, count, desc, eq, gte, sql, sum } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colegios, pagosSuscripcion, suscripciones, usuarios } from '@/lib/db/schema'

const INICIO_MES_SANTIAGO_SQL = sql`(date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago') at time zone 'UTC'`

export async function listarSuscripcionesAdmin() {
  return db
    .select({
      id: suscripciones.id,
      userId: suscripciones.userId,
      usuario: usuarios.nombre,
      email: usuarios.email,
      origen: suscripciones.origen,
      periodicidad: suscripciones.periodicidad,
      estado: suscripciones.estado,
      periodoHasta: suscripciones.periodoHasta,
      nota: suscripciones.nota,
      createdAt: suscripciones.createdAt,
    })
    .from(suscripciones)
    .leftJoin(usuarios, eq(suscripciones.userId, usuarios.id))
    .orderBy(desc(suscripciones.updatedAt))
    .limit(200)
}

export async function resumenSuscripciones() {
  const porEstado = async (estado: string) => {
    const [r] = await db
      .select({ n: count() })
      .from(suscripciones)
      .where(eq(suscripciones.estado, estado))
    return Number(r?.n ?? 0)
  }
  const [ingreso] = await db
    .select({ total: sum(pagosSuscripcion.montoClp) })
    .from(pagosSuscripcion)
    .where(
      and(
        eq(pagosSuscripcion.estado, 'approved'),
        gte(pagosSuscripcion.createdAt, INICIO_MES_SANTIAGO_SQL),
      ),
    )
  return {
    activas: await porEstado('activa'),
    enTrial: await porEstado('trial'),
    morosas: await porEstado('morosa'),
    ingresoMesClp: Number(ingreso?.total ?? 0),
  }
}

export async function pagosDeUsuario(userId: number) {
  return db
    .select()
    .from(pagosSuscripcion)
    .where(eq(pagosSuscripcion.userId, userId))
    .orderBy(desc(pagosSuscripcion.createdAt))
    .limit(50)
}

export async function listarLicencias() {
  return db
    .select({
      id: colegios.id,
      nombre: colegios.nombre,
      licenciaHasta: colegios.licenciaHasta,
      licenciaNota: colegios.licenciaNota,
    })
    .from(colegios)
    .orderBy(colegios.nombre)
}
```

- [ ] **Step 4: Implementar `lib/actions/suscripciones-admin.ts`**

```ts
'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { colegios, suscripciones, usuarios } from '@/lib/db/schema'
import { getActor } from '@/lib/authz'
import { esProSuscripcion } from '@/lib/suscripciones/entitlements'
import { mpCancelarPreapproval } from '@/lib/suscripciones/mercadopago'
import { sincronizarPreapproval } from '@/lib/suscripciones/sync'

export type ResultadoAdmin = { error: string } | { ok: true }

async function requireGlobalAdmin() {
  const actor = await getActor()
  if (!actor || actor.role !== 'global_admin') return null
  return actor
}

/** Pro de cortesía: sin cobro, con vencimiento y nota. Busca al usuario por email. */
export async function concederCortesia(
  email: string,
  hastaISO: string,
  nota: string,
): Promise<ResultadoAdmin> {
  if (!(await requireGlobalAdmin())) return { error: 'No autorizado.' }

  const hasta = new Date(hastaISO)
  if (Number.isNaN(hasta.getTime()) || hasta <= new Date()) {
    return { error: 'La fecha de vencimiento debe ser futura.' }
  }
  const [u] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.email, email.trim().toLowerCase()))
    .limit(1)
  if (!u) return { error: 'No existe un usuario con ese correo.' }

  const [existente] = await db
    .select()
    .from(suscripciones)
    .where(eq(suscripciones.userId, u.id))
    .limit(1)
  if (existente && existente.origen === 'mercadopago' && esProSuscripcion(existente)) {
    return { error: 'El usuario ya tiene una suscripción de MercadoPago vigente.' }
  }

  const valores = {
    origen: 'cortesia' as const,
    periodicidad: null,
    estado: 'activa' as const,
    mpPreapprovalId: null,
    trialTerminaEl: null,
    periodoHasta: hasta,
    nota: nota.trim() || null,
    updatedAt: new Date(),
  }
  await db
    .insert(suscripciones)
    .values({ userId: u.id, ...valores })
    .onConflictDoUpdate({ target: suscripciones.userId, set: valores })
  revalidatePath('/admin')
  return { ok: true }
}

/** Cancela la suscripción de un usuario (reclamos/fraude). */
export async function cancelarSuscripcionDeUsuario(userId: number): Promise<ResultadoAdmin> {
  if (!(await requireGlobalAdmin())) return { error: 'No autorizado.' }

  const [s] = await db
    .select()
    .from(suscripciones)
    .where(eq(suscripciones.userId, userId))
    .limit(1)
  if (!s) return { error: 'El usuario no tiene suscripción.' }

  if (s.origen === 'mercadopago' && s.mpPreapprovalId) {
    try {
      const pre = await mpCancelarPreapproval(s.mpPreapprovalId)
      await sincronizarPreapproval({ ...pre, external_reference: String(userId) })
    } catch (err) {
      console.error('[admin-subs] error cancelando en MP:', err)
      return { error: 'MercadoPago rechazó la cancelación. Revisa el panel de MP.' }
    }
  } else {
    // Cortesía: termina de inmediato.
    await db
      .update(suscripciones)
      .set({ estado: 'cancelada', periodoHasta: new Date(), updatedAt: new Date() })
      .where(eq(suscripciones.id, s.id))
  }
  revalidatePath('/admin')
  return { ok: true }
}

/** Activa/extiende (hastaISO) o corta (null) la licencia B2B de un colegio. */
export async function fijarLicenciaColegio(
  colegioId: number,
  hastaISO: string | null,
  nota: string,
): Promise<ResultadoAdmin> {
  if (!(await requireGlobalAdmin())) return { error: 'No autorizado.' }

  let hasta: Date | null = null
  if (hastaISO != null) {
    hasta = new Date(hastaISO)
    if (Number.isNaN(hasta.getTime())) return { error: 'Fecha no válida.' }
  }
  const [c] = await db.select().from(colegios).where(eq(colegios.id, colegioId)).limit(1)
  if (!c) return { error: 'El colegio no existe.' }

  await db
    .update(colegios)
    .set({ licenciaHasta: hasta, licenciaNota: nota.trim() || null })
    .where(eq(colegios.id, colegioId))
  revalidatePath('/admin')
  return { ok: true }
}
```

- [ ] **Step 5: Correr y verificar PASS**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec vitest run tests/integration/suscripciones-admin.test.ts`

- [ ] **Step 6: UI — tab en `app/(app)/admin/page.tsx` + componentes**

1. `type Tab` += `'suscripciones'`; `normalizarTab` reconoce `'suscripciones'`; array `tabs` += `{ id: 'suscripciones', etiqueta: 'Suscripciones' }`.
2. La página acepta `searchParams: Promise<{ tab?: string; pagos?: string }>` (el param `pagos` = userId para expandir el historial).
3. Nuevo `async function SuscripcionesTab({ pagosDe }: { pagosDe?: number })` siguiendo el patrón de `AccesosTab` (misma página):
   - `Promise.all([resumenSuscripciones(), listarSuscripcionesAdmin(), listarLicencias(), pagosDe ? pagosDeUsuario(pagosDe) : []])`.
   - 4 tarjetas resumen (Activas, En trial, Morosas, `Ingreso del mes` con `Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' })`).
   - `<ConcederCortesia />` (formulario).
   - Lista de suscripciones como `Card`s: nombre/email, `Badge` de estado (verde `activa`/`trial`, rojo `morosa`, gris `cancelada`/`pendiente`), badge de origen (`cortesía` en `bg-accent text-accent-foreground`), periodicidad, `periodoHasta` formateado, y dos acciones por fila: enlace `?tab=suscripciones&pagos=<userId>` («Ver pagos») + botón de cancelar (client component pequeño que llama `cancelarSuscripcionDeUsuario` con `window.confirm`).
   - Si `pagosDe`: sección «Pagos de <email>» con la lista de `pagosDeUsuario` (fecha, `montoClp` formateado CLP, badge estado, `status_detail` del jsonb si existe).
   - Sección «Licencias de colegio»: una fila por colegio con `<LicenciaColegio colegio={...} />`.
4. `components/admin/conceder-cortesia.tsx` (client): inputs email + fecha (`<input type="date">`) + nota, submit → `concederCortesia(email, new Date(fecha + 'T23:59:59').toISOString(), nota)`, estado de error/éxito, `router.refresh()` al ok. Seguir el estilo de `components/admin/crear-colegio.tsx`.
5. `components/admin/licencia-colegio.tsx` (client): muestra nombre + estado de licencia (vigente hasta X / sin licencia, en rojo si vencida); inputs fecha + nota y botones «Guardar» (`fijarLicenciaColegio(id, iso, nota)`) y «Cortar licencia» (`fijarLicenciaColegio(id, null, nota)` con confirm). Seguir el estilo de `components/admin/editar-colegio.tsx`.

- [ ] **Step 7: Lint, typecheck y verificación manual**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Run: `pnpm dev` → como `global_admin`, `/admin?tab=suscripciones` muestra resumen, cortesías, licencias; conceder una cortesía a un usuario de prueba y verla en la lista.

- [ ] **Step 8: Commit**

```bash
git add lib/queries/suscripciones-admin.ts lib/actions/suscripciones-admin.ts components/admin/conceder-cortesia.tsx components/admin/licencia-colegio.tsx "app/(app)/admin/page.tsx" tests/integration/suscripciones-admin.test.ts
git commit -m "feat(suscripciones): tab admin — métricas, cortesías, licencias, pagos y cancelación"
```

---

### Task 11: Aviso de licencia por vencer (school_admin)

**Files:**
- Create: `components/colegio/aviso-licencia.tsx` (server component)
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `colegios.licenciaHasta` (Task 1), `Actor` de `@/lib/authz`.

- [ ] **Step 1: Componente `components/colegio/aviso-licencia.tsx`**

```tsx
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { colegios } from '@/lib/db/schema'

const DIA = 86_400_000

/**
 * Banner para school_admin cuando la licencia del colegio vence en ≤30 días
 * (o ya venció). Sin licencia registrada no muestra nada (colegios free).
 */
export async function AvisoLicencia({ colegioId }: { colegioId: number }) {
  const [c] = await db
    .select({ licenciaHasta: colegios.licenciaHasta })
    .from(colegios)
    .where(eq(colegios.id, colegioId))
    .limit(1)
  if (!c?.licenciaHasta) return null

  const dias = Math.ceil((c.licenciaHasta.getTime() - Date.now()) / DIA)
  if (dias > 30) return null

  const fecha = new Intl.DateTimeFormat('es-CL', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(c.licenciaHasta)

  return (
    <div className="rounded-xl border border-accent-amber bg-accent-amber/10 p-4 text-sm">
      {dias >= 0 ? (
        <>La licencia EduBox de tu colegio vence el <strong>{fecha}</strong>. </>
      ) : (
        <>La licencia EduBox de tu colegio venció el <strong>{fecha}</strong>:
        los profesores volvieron al plan Gratis. </>
      )}
      Escríbenos a{' '}
      <a href="mailto:contacto@edubox.cl" className="font-medium text-primary underline-offset-4 hover:underline">
        contacto@edubox.cl
      </a>{' '}
      para renovarla.
    </div>
  )
}
```

- [ ] **Step 2: Renderizarlo en el dashboard**

En `app/(app)/dashboard/page.tsx`: tras obtener el actor, si `actor.role === 'school_admin' && actor.colegioId != null`, renderizar `<AvisoLicencia colegioId={actor.colegioId} />` como primer elemento del contenido (leer la página primero y respetar su estructura).

- [ ] **Step 3: Verificar**

Run: `pnpm lint && pnpm exec tsc --noEmit`. Manual: poner `licencia_hasta = now() + interval '10 days'` a un colegio en la BD local y entrar como su school_admin → banner visible.

- [ ] **Step 4: Commit**

```bash
git add components/colegio/aviso-licencia.tsx "app/(app)/dashboard/page.tsx"
git commit -m "feat(suscripciones): aviso al school_admin cuando la licencia está por vencer"
```

---

### Task 12: Infra, env y guía de operación de MercadoPago

**Files:**
- Modify: `.env.example`
- Modify: `infra/modules/keyvault.bicep`, `infra/main.bicep`, `infra/modules/appservice.bicep`, `infra/deploy.sh`
- Create: `docs/mercadopago.md`

**Interfaces:**
- Consumes: nombres de env `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` (Tasks 4 y 6).

- [ ] **Step 1: `.env.example`**

Agregar al final del bloque de servicios:

```bash
# MercadoPago (suscripciones EduBox Pro). Sin MP_ACCESS_TOKEN los botones de
# suscripción muestran "muy pronto" y el webhook ignora eventos. El secret
# valida la firma x-signature del webhook (panel de MP → Webhooks).
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
```

- [ ] **Step 2: Bicep + deploy.sh**

Seguir EXACTAMENTE el patrón de los secretos opcionales OAuth/Resend ya existentes (parámetros `@secure()` con default `''`, recurso condicional `if (x != '')`, `optionalSecretUris` con acceso seguro `.?`, `optionalAppSettings` concatenados):
- `infra/modules/keyvault.bicep`: params `mpAccessToken`, `mpWebhookSecret` → secretos `mp-access-token`, `mp-webhook-secret`.
- `infra/main.bicep`: propagar params y URIs.
- `infra/modules/appservice.bicep`: app settings `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` como Key Vault references condicionales.
- `infra/deploy.sh`: aceptar/propagar ambos valores opcionales.

- [ ] **Step 3: Crear `docs/mercadopago.md`**

Guía operativa con: (1) obtener credenciales de producción y de prueba en el panel de desarrolladores de MercadoPago (aplicación tipo «Pagos recurrentes/Suscripciones»); (2) registrar el webhook `https://edubox.cl/api/webhooks/mercadopago` (y `https://qa.edubox.cl/...` con credenciales de prueba), eventos `subscription_preapproval` y `subscription_authorized_payment`, copiar el secret; (3) comandos `az keyvault secret set` para `mp-access-token`/`mp-webhook-secret` en `kv-mispreguntas-ecupwarm` + `az webapp config appsettings set` para `app-mispreguntas-ecupwarmwaeb6` (prod) y `app-mispreguntas-qa` (QA) con las Key Vault references, + restart (mismo formato que `docs/oauth-y-correo.md`); (4) tarjetas de prueba de MP para el sandbox y cómo probar el ciclo completo en QA; (5) checklist de lanzamiento: correo de anuncio a los usuarios existentes (todos pasan a Gratis, invitación al trial — se envía a mano vía Resend), y emisión manual de boletas SII con el reporte del tab admin mientras no se automatice.

- [ ] **Step 4: Verificar y commitear**

Run: `pnpm lint` (los .bicep no se lintean con eslint; revisar con `az bicep build --file infra/main.bicep` si `az` está disponible).

```bash
git add .env.example infra docs/mercadopago.md
git commit -m "feat(suscripciones): infra opcional de MercadoPago (Key Vault + app settings) y guía"
```

---

### Task 13: Suite completa y cierre

- [ ] **Step 1: Correr TODA la suite**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm test`
Expected: PASS completo (unit + integración, incluidas las suites preexistentes).

- [ ] **Step 2: Build de producción**

Run: `pnpm build`
Expected: build OK; `/precios` y el webhook compilan; ninguna página rompe por `searchParams`.

- [ ] **Step 3: Commit final si hubo arreglos**

```bash
git add -A && git commit -m "test(suscripciones): ajustes de suite completa"
```

---

## Notas para la ejecución

- **Merge a `devel`** → auto-deploy a QA (la migración `0013` se aplica sola en el boot). Probar en QA con credenciales de PRUEBA de MP antes de promover a `main`.
- El flujo completo de checkout (init_point → tarjeta → webhook) **no puede probarse hasta que el usuario cree la aplicación en MercadoPago** y entregue las credenciales; el código queda funcional detrás de `mpHabilitado()` (igual que OAuth con Google/Microsoft).
- Los montos que se COBRAN salen de `PRECIOS_CLP` en `lib/suscripciones/mercadopago.ts`; la página `/precios` y `plan-cuenta.tsx` los repiten como copy — si se cambia el precio, actualizar los tres lugares (grep por `3490`/`35880`/`3.490`/`35.880`).
