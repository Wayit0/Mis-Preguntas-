# Borradores de importación retomables — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada análisis de «Importar Documento» se guarda como borrador retomable; las ediciones de la revisión se auto-guardan y una sección «Importaciones en curso» en `/importar` permite retomarlas sin gastar cuota de IA.

**Architecture:** Tabla nueva `borradores_importacion` (jsonb para el resultado crudo del análisis y para el estado editable del cliente). El route handler `/api/importar` crea el borrador al terminar el análisis (best-effort) y devuelve `borradorId` en el stream. El cliente auto-guarda su `PreguntaEditable[]` con debounce vía server action; retomar carga `edicion ?? aEditable(resultado)`. Al guardar en el banco el borrador se elimina. Retención: máx. 10 por usuario + limpieza perezosa a 30 días.

**Tech Stack:** Next.js 16 (`web/`), Drizzle + Postgres (jsonb), zod v4 (`zod/v4`), server actions, vitest (integración con Postgres local), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-24-borradores-importacion-design.md`

## Global Constraints

- Todo el código, comentarios y copy en español (es-CL), estilo del código existente (comentarios que explican el porqué).
- `lib/validation/import.ts` usa `import { z } from 'zod/v4'`.
- Convención del repo: tablas sin FKs; `userId` como integer plano.
- El borrador es **best-effort**: un fallo al crearlo o auto-guardarlo NUNCA rompe la importación ni la revisión (log + silencio).
- El `resultado` del borrador lo escribe sólo el servidor; el cliente sólo escribe `edicion` (validada con zod, tope 25 MB).
- Retomar NO llama a la IA ni gasta cuota.
- Comandos desde `web/` con pnpm. Migración: `pnpm exec drizzle-kit generate`; para los tests de integración, migrar el Postgres local: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec drizzle-kit migrate`, y correr los tests con esa misma `DATABASE_URL` (CI no corre tests).
- Commits SIN footers de coautoría; CON trailer `Claude-Session: https://claude.ai/code/session_013Jdiv4PDt26jugFCwQjmCJ`.
- Rama de trabajo: `devel`.

## Estructura de archivos

- **Modificar** `web/lib/db/schema.ts` — tabla `borradoresImportacion`; **Crear** migración drizzle generada.
- **Modificar** `web/lib/validation/import.ts` — `preguntaEditableBorradorSchema`, `edicionBorradorSchema`, tipo `PreguntaEditableBorrador`.
- **Crear** `web/lib/import/borradores.ts` — helpers de BD: `crearBorrador`, `listarBorradores`, retención. Server-only, sin sesión (la validan los llamadores).
- **Crear** `web/lib/actions/borradores-importacion.ts` — server actions con sesión: `obtenerBorradorImportacion`, `actualizarBorradorImportacion`, `descartarBorradorImportacion`.
- **Modificar** `web/lib/import/analizar.ts` — `ResultadoAnalisis` ok gana `borradorId?: number`.
- **Modificar** `web/app/api/importar/route.ts` — crea el borrador tras un análisis ok.
- **Modificar** `web/app/(app)/importar/page.tsx` — lista de borradores como prop.
- **Modificar** `web/components/import/importar-documento.tsx` — tipo compartido, auto-guardado, retomar/descartar, tarjeta «Importaciones en curso».
- **Crear** `web/tests/integration/borradores-importacion.test.ts`.
- **Modificar** `web/tests/e2e/importar.spec.ts` — e2e del ciclo completo.

---

### Task 1: Tabla `borradores_importacion` + migración

**Files:**
- Modify: `web/lib/db/schema.ts`
- Create: `web/drizzle/00XX_*.sql` (generada)

**Interfaces:**
- Produces: export Drizzle `borradoresImportacion` con columnas `id`, `userId`, `asignatura`, `nombreArchivo`, `resultado` (jsonb not null), `edicion` (jsonb nullable), `createdAt`, `updatedAt`.

- [ ] **Step 1: Agregar la tabla al schema**

En `web/lib/db/schema.ts`, después del bloque de `usosIa`, agregar:

```ts
// ---------------------------------------------------------------------------
// Borradores de "Importar Documento con IA": cada análisis exitoso se guarda
// como borrador retomable, para que cerrar la página a mitad de la revisión
// (o un deploy que invalide las server actions del bundle abierto) no pierda
// el trabajo ni obligue a gastar otra importación de la cuota. Diseño en
// docs/superpowers/specs/2026-07-24-borradores-importacion-design.md.
// ---------------------------------------------------------------------------

export const borradoresImportacion = pgTable('borradores_importacion', {
  id: serial('id').primaryKey(),
  // Dueño del borrador (convención del repo: sin FK).
  userId: integer('user_id').notNull(),
  asignatura: text('asignatura').notNull(),
  nombreArchivo: text('nombre_archivo').notNull(),
  // El ResultadoAnalisis ok crudo ({preguntas, imagenes}, imágenes en base64).
  // Lo escribe SOLO el servidor al terminar el análisis; inmutable después.
  resultado: jsonb('resultado').$type<Record<string, unknown>>().notNull(),
  // Estado editable del cliente (PreguntaEditable[]), sobrescrito completo por
  // cada auto-guardado. NULL = nunca se editó (retomar deriva de `resultado`).
  edicion: jsonb('edicion').$type<unknown[]>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Se toca en cada auto-guardado: es la base del tope por usuario (se elimina
  // el más antiguo) y de la limpieza perezosa a 30 días.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

(Los imports `pgTable, serial, integer, text, jsonb, timestamp` ya existen en el archivo.)

- [ ] **Step 2: Generar la migración**

Run: `pnpm exec drizzle-kit generate`
Expected: crea `drizzle/00XX_<nombre>.sql` con `CREATE TABLE "borradores_importacion" (...)`. Inspeccionarla: debe tener las 8 columnas y ningún cambio ajeno.

- [ ] **Step 3: Migrar la base de tests y verificar**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec drizzle-kit migrate`
Expected: aplica la migración sin errores.

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm vitest run tests/integration/schema.test.ts`
Expected: PASS (el schema sigue consistente).

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(importar): tabla borradores_importacion

Claude-Session: https://claude.ai/code/session_013Jdiv4PDt26jugFCwQjmCJ"
```

---

### Task 2: Validación de `edicion` + módulo de borradores (crear/listar/retención)

**Files:**
- Modify: `web/lib/validation/import.ts`
- Create: `web/lib/import/borradores.ts`
- Test: `web/tests/integration/borradores-importacion.test.ts` (nuevo)

**Interfaces:**
- Consumes: `borradoresImportacion` (Task 1); `imagenObjetoSchema` interno de validation (ver Step 3a); `PreguntaAnalizada`, `ImagenExtraida` existentes.
- Produces:
  - `preguntaEditableBorradorSchema` / `edicionBorradorSchema` (zod) y `type PreguntaEditableBorrador = z.infer<...>` en `lib/validation/import.ts`.
  - En `lib/import/borradores.ts`: `MAX_BORRADORES_POR_USUARIO = 10`; `DIAS_RETENCION_BORRADOR = 30`; `interface BorradorResumen { id: number; nombreArchivo: string; asignatura: string; numPreguntas: number; actualizadoEn: string }`; `interface ResultadoBorrador { preguntas: PreguntaAnalizada[]; imagenes: ImagenExtraida[] }`; `crearBorrador(userId: number, datos: { asignatura: string; nombreArchivo: string; resultado: ResultadoBorrador }): Promise<number>`; `listarBorradores(userId: number): Promise<BorradorResumen[]>`.

- [ ] **Step 1: Tests que fallan**

Crear `web/tests/integration/borradores-importacion.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, borradoresImportacion } from '@/lib/db/schema'

// Las server actions (Task 3) resuelven identidad con getSession(); se mockea
// igual que en carpetas.test.ts. Los helpers de este task no usan sesión.
let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const {
  crearBorrador,
  listarBorradores,
  MAX_BORRADORES_POR_USUARIO,
} = await import('@/lib/import/borradores')

async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db
    .insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x' })
    .returning()
  return u
}

/** ResultadoBorrador mínimo válido (sin imágenes, 1 pregunta). */
function resultadoMinimo(n = 1) {
  return {
    preguntas: Array.from({ length: n }, (_, i) => ({
      pregunta: `¿Pregunta ${i}?`,
      tipo: 'seleccion_multiple' as const,
    })),
    imagenes: [],
  }
}

beforeEach(() => {
  currentUserId = 0
})

describe('lib/import/borradores (crear, listar, retención)', () => {
  it('crea un borrador y lo lista con numPreguntas del resultado', async () => {
    const u = await crearUsuario('borr')
    const id = await crearBorrador(u.id, {
      asignatura: 'Física',
      nombreArchivo: 'prueba.docx',
      resultado: resultadoMinimo(3),
    })
    expect(id).toBeGreaterThan(0)

    const lista = await listarBorradores(u.id)
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({
      id,
      nombreArchivo: 'prueba.docx',
      asignatura: 'Física',
      numPreguntas: 3,
    })
    expect(new Date(lista[0].actualizadoEn).getTime()).not.toBeNaN()
  })

  it('tope por usuario: al crear el 11º elimina el más antiguo por updatedAt', async () => {
    const u = await crearUsuario('borr-tope')
    // 10 borradores con updatedAt escalonado (el id=primero es el más viejo).
    const ids: number[] = []
    for (let i = 0; i < MAX_BORRADORES_POR_USUARIO; i++) {
      const [fila] = await db
        .insert(borradoresImportacion)
        .values({
          userId: u.id,
          asignatura: 'Física',
          nombreArchivo: `doc-${i}.docx`,
          resultado: resultadoMinimo(),
          updatedAt: new Date(Date.now() - (100 - i) * 60_000),
        })
        .returning({ id: borradoresImportacion.id })
      ids.push(fila.id)
    }

    await crearBorrador(u.id, {
      asignatura: 'Física',
      nombreArchivo: 'nuevo.docx',
      resultado: resultadoMinimo(),
    })

    const lista = await listarBorradores(u.id)
    expect(lista).toHaveLength(MAX_BORRADORES_POR_USUARIO)
    // El más antiguo (ids[0]) ya no está; el nuevo sí.
    expect(lista.map((b) => b.id)).not.toContain(ids[0])
    expect(lista.map((b) => b.nombreArchivo)).toContain('nuevo.docx')
  })

  it('limpieza perezosa: un borrador con updatedAt de hace 31 días desaparece al listar', async () => {
    const u = await crearUsuario('borr-exp')
    await db.insert(borradoresImportacion).values({
      userId: u.id,
      asignatura: 'Física',
      nombreArchivo: 'viejo.docx',
      resultado: resultadoMinimo(),
      updatedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    })

    const lista = await listarBorradores(u.id)
    expect(lista).toHaveLength(0)
    const filas = await db
      .select()
      .from(borradoresImportacion)
      .where(eq(borradoresImportacion.userId, u.id))
    expect(filas).toHaveLength(0)
  })

  it('listar sólo devuelve los borradores del usuario', async () => {
    const a = await crearUsuario('borr-a')
    const b = await crearUsuario('borr-b')
    await crearBorrador(a.id, {
      asignatura: 'Física',
      nombreArchivo: 'de-a.docx',
      resultado: resultadoMinimo(),
    })
    expect(await listarBorradores(b.id)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm vitest run tests/integration/borradores-importacion.test.ts`
Expected: FAIL — `@/lib/import/borradores` no existe.

- [ ] **Step 3: Implementar**

3a. En `web/lib/validation/import.ts`, exportar el schema de imagen (hoy es const interno): cambiar `const imagenObjetoSchema = z.object({...})` por `export const imagenObjetoSchema = z.object({...})` (sin tocar su contenido). Luego, al final del archivo, agregar:

```ts
// ---------------------------------------------------------------------------
// Borradores de importación: estado editable de la revisión.
// ---------------------------------------------------------------------------

const imagenEditableSchema = imagenObjetoSchema.nullable()

/**
 * Una pregunta tal como vive en el estado editable de la revisión (la forma
 * `PreguntaEditable` del cliente). Es lo que el auto-guardado persiste en
 * `borradores_importacion.edicion` y lo que retomar restaura. Los campos
 * `…Original` guardan la imagen pre-recorte (para re-recortar sin degradar).
 */
export const preguntaEditableBorradorSchema = z.object({
  id: z.string(),
  incluir: z.boolean(),
  pregunta: z.string(),
  A: z.string(),
  B: z.string(),
  C: z.string(),
  D: z.string(),
  E: z.string(),
  correcta: z.string(),
  explicacion: z.string(),
  materia: z.string(),
  nivel: z.string(),
  tipo: z.enum(TIPOS_PREGUNTA_IMPORT),
  imagenPregunta: imagenEditableSchema,
  imagenPreguntaOriginal: imagenEditableSchema,
  imagenA: imagenEditableSchema,
  imagenAOriginal: imagenEditableSchema,
  imagenB: imagenEditableSchema,
  imagenBOriginal: imagenEditableSchema,
  imagenC: imagenEditableSchema,
  imagenCOriginal: imagenEditableSchema,
  imagenD: imagenEditableSchema,
  imagenDOriginal: imagenEditableSchema,
  imagenE: imagenEditableSchema,
  imagenEOriginal: imagenEditableSchema,
})

/** El payload completo del auto-guardado: el arreglo de preguntas editables. */
export const edicionBorradorSchema = z.array(preguntaEditableBorradorSchema)

export type PreguntaEditableBorrador = z.infer<typeof preguntaEditableBorradorSchema>
```

3b. Crear `web/lib/import/borradores.ts`:

```ts
import { and, asc, desc, eq, lt } from 'drizzle-orm'

import { db } from '@/lib/db'
import { borradoresImportacion } from '@/lib/db/schema'
import type { ImagenExtraida } from '@/lib/docparse/extract'
import type { PreguntaAnalizada } from '@/lib/validation/import'

// ---------------------------------------------------------------------------
// Helpers de BD para los borradores de importación. SIN validación de sesión:
// el route handler ya conoce el userId autenticado y las server actions
// (lib/actions/borradores-importacion.ts) validan la suya. Diseño en
// docs/superpowers/specs/2026-07-24-borradores-importacion-design.md.
// ---------------------------------------------------------------------------

/** Máximo de borradores por usuario: al crear uno más se elimina el más antiguo. */
export const MAX_BORRADORES_POR_USUARIO = 10
/** Días sin tocar tras los cuales un borrador se limpia (limpieza perezosa). */
export const DIAS_RETENCION_BORRADOR = 30

/** Resumen para la tarjeta «Importaciones en curso». */
export interface BorradorResumen {
  id: number
  nombreArchivo: string
  asignatura: string
  numPreguntas: number
  /** ISO 8601 (los server components serializan props a JSON). */
  actualizadoEn: string
}

/** El resultado crudo del análisis, tal como se persiste en `resultado`. */
export interface ResultadoBorrador {
  preguntas: PreguntaAnalizada[]
  imagenes: ImagenExtraida[]
}

/**
 * Limpieza perezosa: elimina los borradores del usuario no tocados en
 * `DIAS_RETENCION_BORRADOR`. Se invoca al crear y al listar — sin cron.
 */
async function limpiarExpirados(userId: number): Promise<void> {
  const limite = new Date(Date.now() - DIAS_RETENCION_BORRADOR * 24 * 60 * 60 * 1000)
  await db
    .delete(borradoresImportacion)
    .where(
      and(
        eq(borradoresImportacion.userId, userId),
        lt(borradoresImportacion.updatedAt, limite),
      ),
    )
}

/**
 * Crea un borrador con el resultado crudo del análisis y devuelve su id.
 * Aplica la limpieza perezosa y el tope por usuario (elimina los más antiguos
 * por `updatedAt` hasta dejar espacio). Puede lanzar: el route handler lo
 * trata como best-effort (la importación nunca falla por el borrador).
 */
export async function crearBorrador(
  userId: number,
  datos: { asignatura: string; nombreArchivo: string; resultado: ResultadoBorrador },
): Promise<number> {
  await limpiarExpirados(userId)

  const existentes = await db
    .select({ id: borradoresImportacion.id })
    .from(borradoresImportacion)
    .where(eq(borradoresImportacion.userId, userId))
    .orderBy(asc(borradoresImportacion.updatedAt))
  const sobran = existentes.length - (MAX_BORRADORES_POR_USUARIO - 1)
  for (const b of existentes.slice(0, Math.max(0, sobran))) {
    await db.delete(borradoresImportacion).where(eq(borradoresImportacion.id, b.id))
  }

  const [fila] = await db
    .insert(borradoresImportacion)
    .values({
      userId,
      asignatura: datos.asignatura,
      nombreArchivo: datos.nombreArchivo,
      resultado: datos.resultado as unknown as Record<string, unknown>,
    })
    .returning({ id: borradoresImportacion.id })
  return fila.id
}

/** Lista los borradores del usuario, más reciente primero. Aplica limpieza. */
export async function listarBorradores(userId: number): Promise<BorradorResumen[]> {
  await limpiarExpirados(userId)
  const filas = await db
    .select()
    .from(borradoresImportacion)
    .where(eq(borradoresImportacion.userId, userId))
    .orderBy(desc(borradoresImportacion.updatedAt))
  return filas.map((f) => {
    const resultado = f.resultado as unknown as ResultadoBorrador
    const edicion = f.edicion as unknown[] | null
    return {
      id: f.id,
      nombreArchivo: f.nombreArchivo,
      asignatura: f.asignatura,
      // Si hay edición, es la verdad más fresca (el usuario pudo... no: la
      // edición no agrega ni quita preguntas hoy, pero contar de ahí es igual
      // de correcto y refleja lo que verá al retomar).
      numPreguntas: edicion?.length ?? resultado.preguntas.length,
      actualizadoEn: f.updatedAt.toISOString(),
    }
  })
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm vitest run tests/integration/borradores-importacion.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/validation/import.ts lib/import/borradores.ts tests/integration/borradores-importacion.test.ts
git commit -m "feat(importar): módulo de borradores (crear/listar/retención) y schema de edición

Claude-Session: https://claude.ai/code/session_013Jdiv4PDt26jugFCwQjmCJ"
```

---

### Task 3: Server actions (obtener / actualizar / descartar)

**Files:**
- Create: `web/lib/actions/borradores-importacion.ts`
- Test: `web/tests/integration/borradores-importacion.test.ts` (ampliar)

**Interfaces:**
- Consumes: `crearBorrador`, `ResultadoBorrador` (Task 2); `edicionBorradorSchema`, `PreguntaEditableBorrador` (Task 2); `getSession` existente.
- Produces (en `lib/actions/borradores-importacion.ts`):
  - `interface BorradorParaRetomar { id: number; asignatura: string; nombreArchivo: string; resultado: ResultadoBorrador; edicion: PreguntaEditableBorrador[] | null }`
  - `obtenerBorradorImportacion(id: number): Promise<{ ok: true; borrador: BorradorParaRetomar } | { ok: false; error: string }>`
  - `actualizarBorradorImportacion(id: number, edicion: unknown): Promise<{ ok: true } | { ok: false; error: string }>`
  - `descartarBorradorImportacion(id: number): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: Tests que fallan**

Agregar a `web/tests/integration/borradores-importacion.test.ts` (los mocks de sesión ya existen; agregar el import junto a los otros `await import`):

```ts
const {
  obtenerBorradorImportacion,
  actualizarBorradorImportacion,
  descartarBorradorImportacion,
} = await import('@/lib/actions/borradores-importacion')

/** Una PreguntaEditableBorrador válida mínima. */
function preguntaEditable(texto: string) {
  const sinImagen = null
  return {
    id: 'det-0',
    incluir: true,
    pregunta: texto,
    A: 'a', B: 'b', C: 'c', D: 'd', E: '',
    correcta: 'A',
    explicacion: '',
    materia: '',
    nivel: '',
    tipo: 'seleccion_multiple' as const,
    imagenPregunta: sinImagen, imagenPreguntaOriginal: sinImagen,
    imagenA: sinImagen, imagenAOriginal: sinImagen,
    imagenB: sinImagen, imagenBOriginal: sinImagen,
    imagenC: sinImagen, imagenCOriginal: sinImagen,
    imagenD: sinImagen, imagenDOriginal: sinImagen,
    imagenE: sinImagen, imagenEOriginal: sinImagen,
  }
}

describe('actions/borradores-importacion (sesión + pertenencia)', () => {
  it('actualiza la edición y obtener la devuelve; numPreguntas cuenta la edición', async () => {
    const u = await crearUsuario('borr-act')
    currentUserId = u.id
    const id = await crearBorrador(u.id, {
      asignatura: 'Física',
      nombreArchivo: 'doc.docx',
      resultado: resultadoMinimo(3),
    })

    const upd = await actualizarBorradorImportacion(id, [
      preguntaEditable('editada 1'),
      preguntaEditable('editada 2'),
    ])
    expect(upd.ok).toBe(true)

    const res = await obtenerBorradorImportacion(id)
    if (!res.ok) throw new Error(res.error)
    expect(res.borrador.edicion).toHaveLength(2)
    expect(res.borrador.edicion?.[0].pregunta).toBe('editada 1')
    expect(res.borrador.resultado.preguntas).toHaveLength(3)

    const lista = await listarBorradores(u.id)
    expect(lista[0].numPreguntas).toBe(2)
  })

  it('rechaza una edición malformada sin guardar nada', async () => {
    const u = await crearUsuario('borr-mal')
    currentUserId = u.id
    const id = await crearBorrador(u.id, {
      asignatura: 'Física',
      nombreArchivo: 'doc.docx',
      resultado: resultadoMinimo(),
    })

    const upd = await actualizarBorradorImportacion(id, [{ pregunta: 'sin campos' }])
    expect(upd.ok).toBe(false)

    const res = await obtenerBorradorImportacion(id)
    if (!res.ok) throw new Error(res.error)
    expect(res.borrador.edicion).toBeNull()
  })

  it('un usuario no puede obtener/actualizar/descartar borradores ajenos', async () => {
    const a = await crearUsuario('borr-own-a')
    const b = await crearUsuario('borr-own-b')
    const id = await crearBorrador(a.id, {
      asignatura: 'Física',
      nombreArchivo: 'de-a.docx',
      resultado: resultadoMinimo(),
    })

    currentUserId = b.id
    expect((await obtenerBorradorImportacion(id)).ok).toBe(false)
    expect((await actualizarBorradorImportacion(id, [preguntaEditable('x')])).ok).toBe(false)
    expect((await descartarBorradorImportacion(id)).ok).toBe(false)

    // El de A sigue intacto.
    currentUserId = a.id
    expect((await obtenerBorradorImportacion(id)).ok).toBe(true)
  })

  it('descartar elimina el borrador; sin sesión todo falla', async () => {
    const u = await crearUsuario('borr-del')
    currentUserId = u.id
    const id = await crearBorrador(u.id, {
      asignatura: 'Física',
      nombreArchivo: 'doc.docx',
      resultado: resultadoMinimo(),
    })
    expect((await descartarBorradorImportacion(id)).ok).toBe(true)
    expect((await obtenerBorradorImportacion(id)).ok).toBe(false)

    currentUserId = 0
    expect((await obtenerBorradorImportacion(id)).ok).toBe(false)
    expect((await actualizarBorradorImportacion(id, [])).ok).toBe(false)
    expect((await descartarBorradorImportacion(id)).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm vitest run tests/integration/borradores-importacion.test.ts`
Expected: FAIL — `@/lib/actions/borradores-importacion` no existe.

- [ ] **Step 3: Crear `web/lib/actions/borradores-importacion.ts`**

```ts
'use server'

import { and, eq } from 'drizzle-orm'

import { getSession } from '@/lib/get-session'
import { db } from '@/lib/db'
import { borradoresImportacion } from '@/lib/db/schema'
import type { ResultadoBorrador } from '@/lib/import/borradores'
import {
  edicionBorradorSchema,
  type PreguntaEditableBorrador,
} from '@/lib/validation/import'

// ---------------------------------------------------------------------------
// Server actions de los borradores de importación. Todas exigen sesión y
// acotan cada consulta por (id, userId): un borrador ajeno y uno inexistente
// devuelven el MISMO error (no filtramos existencia). La creación NO vive
// aquí: la hace el route handler /api/importar (server-side, best-effort).
// ---------------------------------------------------------------------------

/** Tope del payload de edición: 14 imágenes reales caben con holgura. */
const MAX_BYTES_EDICION = 25 * 1024 * 1024

const NO_ENCONTRADO = 'El borrador ya no existe (fue completado o eliminado).'

/** Borrador completo para retomar la revisión. */
export interface BorradorParaRetomar {
  id: number
  asignatura: string
  nombreArchivo: string
  resultado: ResultadoBorrador
  edicion: PreguntaEditableBorrador[] | null
}

export async function obtenerBorradorImportacion(
  id: number,
): Promise<{ ok: true; borrador: BorradorParaRetomar } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)

  const [fila] = await db
    .select()
    .from(borradoresImportacion)
    .where(and(eq(borradoresImportacion.id, id), eq(borradoresImportacion.userId, userId)))
  if (!fila) return { ok: false, error: NO_ENCONTRADO }

  return {
    ok: true,
    borrador: {
      id: fila.id,
      asignatura: fila.asignatura,
      nombreArchivo: fila.nombreArchivo,
      resultado: fila.resultado as unknown as ResultadoBorrador,
      // La edición se validó al escribirse; al leer se confía en la BD.
      edicion: (fila.edicion as PreguntaEditableBorrador[] | null) ?? null,
    },
  }
}

export async function actualizarBorradorImportacion(
  id: number,
  edicion: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)

  // Tope de tamaño ANTES de validar forma (el stringify es más barato que un
  // parse de zod sobre un payload gigante malicioso).
  if (JSON.stringify(edicion).length > MAX_BYTES_EDICION) {
    return { ok: false, error: 'El borrador es demasiado grande para guardarse.' }
  }
  const parsed = edicionBorradorSchema.safeParse(edicion)
  if (!parsed.success) {
    return { ok: false, error: 'La edición del borrador no es válida.' }
  }

  const actualizadas = await db
    .update(borradoresImportacion)
    .set({ edicion: parsed.data, updatedAt: new Date() })
    .where(and(eq(borradoresImportacion.id, id), eq(borradoresImportacion.userId, userId)))
    .returning({ id: borradoresImportacion.id })
  if (actualizadas.length === 0) return { ok: false, error: NO_ENCONTRADO }
  return { ok: true }
}

export async function descartarBorradorImportacion(
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Debes iniciar sesión.' }
  const userId = Number(session.user.id)

  const eliminadas = await db
    .delete(borradoresImportacion)
    .where(and(eq(borradoresImportacion.id, id), eq(borradoresImportacion.userId, userId)))
    .returning({ id: borradoresImportacion.id })
  if (eliminadas.length === 0) return { ok: false, error: NO_ENCONTRADO }
  return { ok: true }
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm vitest run tests/integration/borradores-importacion.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/borradores-importacion.ts tests/integration/borradores-importacion.test.ts
git commit -m "feat(importar): server actions de borradores (obtener/actualizar/descartar)

Claude-Session: https://claude.ai/code/session_013Jdiv4PDt26jugFCwQjmCJ"
```

---

### Task 4: El análisis crea el borrador (route handler)

**Files:**
- Modify: `web/lib/import/analizar.ts` (tipo)
- Modify: `web/app/api/importar/route.ts`

**Interfaces:**
- Consumes: `crearBorrador` (Task 2).
- Produces: `ResultadoAnalisis` con rama ok `{ ok: true; preguntas: PreguntaAnalizada[]; imagenes: ImagenExtraida[]; borradorId?: number }` — el cliente (Task 5) lee `borradorId`.

- [ ] **Step 1: Ampliar el tipo en `web/lib/import/analizar.ts`**

```ts
/** Resultado del análisis de un documento. */
export type ResultadoAnalisis =
  | {
      ok: true
      preguntas: PreguntaAnalizada[]
      imagenes: ImagenExtraida[]
      /**
       * Id del borrador creado por el route handler tras el análisis (para el
       * auto-guardado y retomar). Ausente si el insert falló: el borrador es
       * best-effort y su fallo nunca rompe la importación.
       */
      borradorId?: number
    }
  | { ok: false; error: string; sinCupo?: boolean }
```

- [ ] **Step 2: Crear el borrador en `web/app/api/importar/route.ts`**

2a. Import nuevo: `import { crearBorrador } from '@/lib/import/borradores'`.

2b. En el `try` del stream, reemplazar:

```ts
        const resultado = await analizarArchivo(archivo, asignatura, userId)
        enviar({ resultado })
```

por:

```ts
        const resultado = await analizarArchivo(archivo, asignatura, userId)
        // Borrador retomable (best-effort): si el insert falla, la importación
        // sigue igual — el profesor simplemente no podrá retomarla después.
        if (resultado.ok) {
          try {
            resultado.borradorId = await crearBorrador(userId, {
              asignatura,
              nombreArchivo: archivo.name,
              resultado: {
                preguntas: resultado.preguntas,
                imagenes: resultado.imagenes,
              },
            })
          } catch (err) {
            console.error('[importar] no se pudo crear el borrador:', err)
          }
        }
        enviar({ resultado })
```

- [ ] **Step 3: Verificar**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores nuevos.

Run: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm vitest run tests/unit tests/integration/borradores-importacion.test.ts`
Expected: PASS (el cableado del route se verifica end-to-end en el e2e de Task 6).

- [ ] **Step 4: Commit**

```bash
git add lib/import/analizar.ts app/api/importar/route.ts
git commit -m "feat(importar): el análisis crea un borrador retomable (best-effort)

Claude-Session: https://claude.ai/code/session_013Jdiv4PDt26jugFCwQjmCJ"
```

---

### Task 5: Cliente — auto-guardado, retomar, descartar y lista

**Files:**
- Modify: `web/components/import/importar-documento.tsx`
- Modify: `web/app/(app)/importar/page.tsx`

**Interfaces:**
- Consumes: `BorradorResumen`, `listarBorradores` (Task 2); `obtenerBorradorImportacion`, `actualizarBorradorImportacion`, `descartarBorradorImportacion` (Task 3); `PreguntaEditableBorrador` (Task 2); `resultado.borradorId` (Task 4).
- Produces: prop nueva `borradores: BorradorResumen[]` en `ImportarDocumento`.

- [ ] **Step 1: `web/app/(app)/importar/page.tsx` — pasar la lista**

```ts
import { listarBorradores } from '@/lib/import/borradores'
```

y en el cuerpo:

```ts
  const borradores = await listarBorradores(userId)

  return (
    <ImportarDocumento
      asignaturaInicial={asignatura || undefined}
      cuota={{ limite: cuota.limite, restantes: cuota.restantes }}
      borradores={borradores}
    />
  )
```

- [ ] **Step 2: `web/components/import/importar-documento.tsx`**

2a. Imports nuevos (junto a los existentes):

```ts
import { useEffect, useRef, useState } from 'react' // (useEffect/useState ya están; sumar useRef si falta)
import {
  descartarBorradorImportacion,
  obtenerBorradorImportacion,
  actualizarBorradorImportacion,
} from '@/lib/actions/borradores-importacion'
import type { BorradorResumen } from '@/lib/import/borradores'
import type { PreguntaEditableBorrador } from '@/lib/validation/import'
```

2b. Reemplazar la `interface PreguntaEditable { ... }` local completa por el tipo compartido (una sola fuente de verdad con el schema del auto-guardado — si las formas divergen, `tsc` acusa):

```ts
/**
 * Una pregunta detectada, ya en forma editable (sin nulls) + selección.
 * La forma es el schema compartido `preguntaEditableBorradorSchema`: es lo
 * que el auto-guardado persiste y lo que retomar restaura.
 */
type PreguntaEditable = PreguntaEditableBorrador
```

(El resto del archivo no cambia por esto: los campos son idénticos.)

2c. Firma del componente — prop nueva:

```ts
export function ImportarDocumento({
  asignaturaInicial,
  cuota,
  borradores,
}: {
  asignaturaInicial?: string
  /** Cuota mensual de importaciones con IA del plan del usuario. */
  cuota: { limite: number; restantes: number }
  /** Borradores retomables del usuario (para «Importaciones en curso»). */
  borradores: BorradorResumen[]
}) {
```

2d. Estado nuevo, junto a los `useState` existentes:

```ts
  // Borrador activo de esta revisión (para el auto-guardado y el borrado al
  // completar). Null si el análisis no alcanzó a crear uno (best-effort).
  const [borradorId, setBorradorId] = useState<number | null>(null)
  // Copia local de la lista para reflejar retomas/descartes sin recargar.
  const [listaBorradores, setListaBorradores] = useState(borradores)
```

2e. Auto-guardado (después de la función `actualizar`):

```ts
  // Auto-guardado del borrador: 3 s después del último cambio en revisión.
  // Best-effort: un fallo se ignora (se reintenta con el próximo cambio).
  useEffect(() => {
    if (fase !== 'revisar' || borradorId == null) return
    const timer = setTimeout(() => {
      actualizarBorradorImportacion(borradorId, preguntas).catch(() => {})
    }, 3000)
    return () => clearTimeout(timer)
  }, [preguntas, fase, borradorId])
```

2f. En `onAnalizar`, justo antes de `setFase('revisar')`:

```ts
      setBorradorId(resultado.borradorId ?? null)
```

2g. En `onGuardar`, tras `if (!resultado.ok) {...}` y antes de `router.push(...)`:

```ts
      // El borrador ya cumplió su función; eliminarlo es best-effort.
      if (borradorId != null) {
        try {
          await descartarBorradorImportacion(borradorId)
        } catch {
          // La limpieza perezosa lo recogerá.
        }
      }
```

2h. En `reiniciar()`, agregar:

```ts
    setBorradorId(null)
    // La lista del server component puede estar desactualizada (p. ej. el
    // análisis recién hecho creó un borrador): recargar props.
    router.refresh()
```

2i. Handlers nuevos (junto a `reiniciar`):

```ts
  async function onRetomar(id: number) {
    setError(null)
    const res = await obtenerBorradorImportacion(id)
    if (!res.ok) {
      setError(res.error)
      setListaBorradores((prev) => prev.filter((b) => b.id !== id))
      return
    }
    const { borrador } = res
    setAsignatura(borrador.asignatura)
    setNombreArchivo(borrador.nombreArchivo)
    setPreguntas(
      borrador.edicion ??
        borrador.resultado.preguntas.map((p) =>
          aEditable(p, borrador.resultado.imagenes),
        ),
    )
    setBorradorId(borrador.id)
    setFase('revisar')
  }

  async function onDescartar(id: number) {
    if (!window.confirm('¿Eliminar este borrador? No se puede deshacer.')) return
    await descartarBorradorImportacion(id).catch(() => {})
    setListaBorradores((prev) => prev.filter((b) => b.id !== id))
  }
```

2j. Tarjeta «Importaciones en curso» — en la fase `subir`, después del `<Card>` del formulario (dentro del mismo contenedor raíz), agregar:

```tsx
      {fase !== 'analizando' && listaBorradores.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-semibold text-foreground">
                Importaciones en curso
              </h2>
              <p className="text-xs text-muted-foreground">
                Análisis ya hechos que puedes retomar sin gastar otra
                importación. Se guardan por 30 días.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {listaBorradores.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {b.nombreArchivo}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {b.asignatura} ·{' '}
                      {b.numPreguntas === 1
                        ? '1 pregunta'
                        : `${b.numPreguntas} preguntas`}{' '}
                      ·{' '}
                      {new Date(b.actualizadoEn).toLocaleString('es-CL', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" onClick={() => onRetomar(b.id)}>
                      Retomar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onDescartar(b.id)}
                    >
                      Descartar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
```

- [ ] **Step 3: Verificar**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores nuevos. (Si `tsc` acusa diferencias entre la antigua `PreguntaEditable` y `PreguntaEditableBorrador`, la forma del schema de Task 2 está desalineada — corregir el schema, no el componente.)

Verificación manual opcional: `IMPORT_AI_FAKE=1` + DATABASE_URL de test + `pnpm dev`, importar `tests/fixtures/sample-con-imagen.docx`, editar, recargar, retomar.

- [ ] **Step 4: Commit**

```bash
git add components/import/importar-documento.tsx 'app/(app)/importar/page.tsx'
git commit -m "feat(importar): auto-guardado y retome de borradores en la revisión

Claude-Session: https://claude.ai/code/session_013Jdiv4PDt26jugFCwQjmCJ"
```

---

### Task 6: E2E del ciclo completo

**Files:**
- Modify: `web/tests/e2e/importar.spec.ts`

**Interfaces:**
- Consumes: la UI de Task 5 (tarjeta «Importaciones en curso», botones «Retomar»/«Descartar») y el fixture `IMPORT_AI_FAKE` existente (2 preguntas).

- [ ] **Step 1: Agregar el test**

Al final de `web/tests/e2e/importar.spec.ts`:

```ts
test('importar: el borrador se retoma tras recargar y desaparece al guardar', async ({
  page,
}) => {
  const sufijo = Date.now()
  const password = 'clave-segura-123'

  // 1. Registro y análisis (IA mockeada) con una imagen 1x1.
  await page.goto('/registro')
  await page.locator('#nombre').fill(`Borrador ${sufijo}`)
  await page.locator('#email').fill(`borrador${sufijo}@x.cl`)
  await page.locator('#password').fill(password)
  await page.locator('#password2').fill(password)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.goto('/importar?asignatura=F%C3%ADsica')
  await page
    .locator('input[name="archivo"]')
    .setInputFiles({ name: 'prueba.png', mimeType: 'image/png', buffer: PNG_1x1 })
  await page.getByRole('button', { name: 'Analizar documento' }).click()
  await expect(page.getByText('2 preguntas detectadas')).toBeVisible()

  // 2. Editar el primer enunciado y esperar el auto-guardado (debounce 3 s).
  const enunciado = page.getByLabel('Enunciado').first()
  await enunciado.fill('¿Cuál es la unidad de fuerza? [EDITADO]')
  await page.waitForTimeout(4500)

  // 3. Recargar: el trabajo en curso aparece como borrador retomable.
  await page.reload()
  await expect(page.getByText('Importaciones en curso')).toBeVisible()
  await expect(page.getByText('prueba.png')).toBeVisible()

  // 4. Retomar: la edición sigue tal cual.
  await page.getByRole('button', { name: 'Retomar' }).click()
  await expect(page.getByText('2 preguntas detectadas')).toBeVisible()
  await expect(page.getByLabel('Enunciado').first()).toHaveValue(/\[EDITADO\]/)

  // 5. Guardar: redirige a Mis Preguntas y el borrador desaparece de /importar.
  await page.getByRole('button', { name: /Guardar 2 preguntas/ }).click()
  await expect(page).toHaveURL(/\/preguntas(\?|$)/)
  await page.goto('/importar')
  await expect(page.getByText('Importaciones en curso')).not.toBeVisible()
})
```

- [ ] **Step 2: Correr los e2e de importar**

Run (con el entorno local completo — ver Global Constraints y los env vars del reporte de Task 6 del plan de recortes: `DATABASE_URL` de test, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:3100`, `IMPORT_AI_FAKE=1`):
`pnpm test:e2e tests/e2e/importar.spec.ts`
Expected: PASS el test nuevo y los 3 existentes (el e2e «DOCX con imagen → guardar» puede fallar localmente por falta de `AZURE_STORAGE_CONNECTION_STRING` — gap ambiental documentado, no regresión). Si el entorno no permite e2e, correr al menos `pnpm exec tsc --noEmit && pnpm lint && DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm vitest run` y dejar el e2e anotado como no verificado — NO declararlo verificado.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/importar.spec.ts
git commit -m "test(importar): e2e de borradores (editar, recargar, retomar, guardar)

Claude-Session: https://claude.ai/code/session_013Jdiv4PDt26jugFCwQjmCJ"
```

---

## Verificación final

- [ ] `pnpm exec tsc --noEmit` — sin errores.
- [ ] `pnpm lint` — sin errores nuevos.
- [ ] `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm test` — suite completa verde.
- [ ] `pnpm test:e2e tests/e2e/importar.spec.ts` — verde (o verificación manual documentada).
