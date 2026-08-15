# Cursos y Tareas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuentas de estudiante con portal propio para responder pruebas asignadas en línea (un intento, corrección automática de alternativas) y panel de resultados para el profesor.

**Architecture:** Rol nuevo `student` sobre better-auth. Cuatro tablas nuevas (`cursos`, `inscripciones`, `asignaciones`, `entregas`); la asignación congela un snapshot jsonb de la prueba. Portal estudiante en route group `(estudiante)` separado del área `(app)` de profesor; separación por rol en los layouts + guardas en cada server action.

**Tech Stack:** Next.js App Router (`web/`), Drizzle + Postgres, better-auth, vitest (integración contra Postgres local), playwright.

**Spec:** `docs/superpowers/specs/2026-08-15-cursos-y-tareas-design.md`

## Global Constraints

- Todo el código vive en `web/`. Comandos se corren desde `web/`.
- Tests de integración: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm test <archivo>`. Tras cambios de schema, migrar la BD de test: `DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec drizzle-kit migrate`.
- CI no corre vitest: correr la suite completa localmente antes del commit final.
- Estilo del dominio: columnas `userId`/ids como `integer` SIN foreign key formal; integridad en las actions. Nombres de columnas snake_case, claves JS camelCase.
- Las server actions devuelven `{ ok: true } | { error: string }` y validan permisos con los helpers de `lib/authz.ts` (regla de seguridad del proyecto: nunca confiar en la UI).
- Commits sin footers de "Generated with"/"Co-Authored-By" (regla global del usuario).
- UI en español, mismo tono que el resto ("Mis Preguntas", botones con emoji).
- Antes de escribir código Next.js consultar `web/node_modules/next/dist/docs/` si hay dudas de API (instrucción de `web/AGENTS.md`).

---

### Task 1: Schema y migración

**Files:**
- Modify: `web/lib/db/schema.ts` (agregar 4 tablas al final, tras `borradoresImportacion`)
- Modify: `web/lib/authz.ts:21` (tipo `Rol`)
- Create: `web/drizzle/00XX_*.sql` (generado por drizzle-kit)

**Interfaces:**
- Produces: tablas `cursos`, `inscripciones`, `asignaciones`, `entregas` exportadas desde `@/lib/db/schema`; tipo `Rol` incluye `'student'`. El jsonb `asignaciones.contenido` se tipa con `ContenidoAsignacion` de la Task 2 — en esta task se declara `.$type<unknown>()` y la Task 2 lo ajusta.

- [ ] **Step 1: Agregar tablas al schema**

Al final de `web/lib/db/schema.ts`:

```ts
// ---------------------------------------------------------------------------
// Cursos y tareas (spec 2026-08-15): un profesor crea cursos con código de
// inscripción; los estudiantes (role 'student') se inscriben y responden
// asignaciones. `asignaciones.contenido` es un SNAPSHOT congelado de la prueba
// al momento de asignar: editar/borrar la prueba original no afecta la tarea.
// Ids enteros sin FK formal, igual que el resto del dominio.
// ---------------------------------------------------------------------------

export const cursos = pgTable('cursos', {
  id: serial('id').primaryKey(),
  // Profesor dueño del curso.
  userId: integer('user_id').notNull(),
  nombre: text('nombre').notNull(),
  // Código de inscripción (link /unirse/CODIGO). Único, largo y secreto.
  joinCode: text('join_code').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const inscripciones = pgTable(
  'inscripciones',
  {
    id: serial('id').primaryKey(),
    cursoId: integer('curso_id').notNull(),
    estudianteId: integer('estudiante_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [unique('inscripciones_curso_estudiante').on(t.cursoId, t.estudianteId)],
)

export const asignaciones = pgTable('asignaciones', {
  id: serial('id').primaryKey(),
  cursoId: integer('curso_id').notNull(),
  // Referencia informativa a la prueba de origen; puede quedar huérfana.
  pruebaId: integer('prueba_id').notNull(),
  titulo: text('titulo').notNull(),
  instrucciones: text('instrucciones'),
  // Snapshot congelado (ver lib/tareas/contenido.ts). Correctas y explicaciones
  // viven SOLO aquí en el servidor; nunca se serializan al estudiante antes de
  // que exista su entrega.
  contenido: jsonb('contenido').notNull(),
  fechaLimite: timestamp('fecha_limite'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const entregas = pgTable(
  'entregas',
  {
    id: serial('id').primaryKey(),
    asignacionId: integer('asignacion_id').notNull(),
    estudianteId: integer('estudiante_id').notNull(),
    // Respuestas por índice de pregunta aplanada: {"0":"A","1":"texto libre"}.
    respuestas: jsonb('respuestas').$type<Record<string, string>>().notNull(),
    // Puntaje de alternativas (las de desarrollo no puntúan).
    puntaje: integer('puntaje').notNull(),
    total: integer('total').notNull(),
    enviadoEl: timestamp('enviado_el').defaultNow().notNull(),
  },
  (t) => [unique('entregas_asignacion_estudiante').on(t.asignacionId, t.estudianteId)],
)
```

Añadir `unique` al import de `drizzle-orm/pg-core` en la línea 1-18 del archivo si no está.

- [ ] **Step 2: Ampliar el tipo Rol**

En `web/lib/authz.ts:21`:

```ts
export type Rol = 'global_admin' | 'school_admin' | 'teacher' | 'student'
```

- [ ] **Step 3: Generar y aplicar migración**

```bash
pnpm exec drizzle-kit generate
DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm exec drizzle-kit migrate
```

Verificar que el SQL generado crea las 4 tablas y los 2 unique constraints.

- [ ] **Step 4: Typecheck y commit**

```bash
pnpm exec tsc --noEmit
git add lib/db/schema.ts lib/authz.ts drizzle/
git commit -m "feat(tareas): schema de cursos, inscripciones, asignaciones y entregas"
```

---

### Task 2: Tipos del snapshot y corrección pura

**Files:**
- Create: `web/lib/tareas/contenido.ts`
- Test: `web/tests/unit/correccion.test.ts`
- Modify: `web/lib/db/schema.ts` (tipar `asignaciones.contenido`)

**Interfaces:**
- Produces:
  - `interface PreguntaSnapshot { preguntaId: number; tipo: string; enunciado: string; A: string|null; B: string|null; C: string|null; D: string|null; E: string|null; correcta: string|null; explicacion: string|null; imagenPregunta: string|null; imagenA: string|null; imagenB: string|null; imagenC: string|null; imagenD: string|null; imagenE: string|null; imagenTamano: string }`
  - `interface TextoSnapshot { titulo: string; contenido: string; preguntas: PreguntaSnapshot[] }`
  - `interface ContenidoAsignacion { textos: TextoSnapshot[]; preguntas: PreguntaSnapshot[] }`
  - `aplanarPreguntas(c: ContenidoAsignacion): PreguntaSnapshot[]` — textos primero (sus preguntas en orden), luego las sueltas. ESTE orden define el índice usado como clave de `respuestas`.
  - `corregir(c: ContenidoAsignacion, respuestas: Record<string,string>): { puntaje: number; total: number }` — `total` = nº de preguntas `seleccion_multiple` con `correcta` no vacía; `puntaje` = respuestas cuya letra coincide (case-insensitive, trim).
  - `type PreguntaEstudiante = Omit<PreguntaSnapshot, 'correcta' | 'explicacion'>` y `sinRespuestas(c: ContenidoAsignacion): { textos: ...; preguntas: PreguntaEstudiante[] }` (misma forma sin correcta/explicacion).

- [ ] **Step 1: Test unit de corrección**

`web/tests/unit/correccion.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  aplanarPreguntas,
  corregir,
  sinRespuestas,
  type ContenidoAsignacion,
  type PreguntaSnapshot,
} from '@/lib/tareas/contenido'

function sm(id: number, correcta: string | null): PreguntaSnapshot {
  return {
    preguntaId: id, tipo: 'seleccion_multiple', enunciado: `p${id}`,
    A: 'a', B: 'b', C: 'c', D: null, E: null,
    correcta, explicacion: 'porque sí',
    imagenPregunta: null, imagenA: null, imagenB: null, imagenC: null,
    imagenD: null, imagenE: null, imagenTamano: 'mediano',
  }
}

const contenido: ContenidoAsignacion = {
  textos: [{ titulo: 'Lectura', contenido: 'texto', preguntas: [sm(10, 'A')] }],
  preguntas: [sm(20, 'B'), { ...sm(30, null), tipo: 'desarrollo_corto' }, sm(40, 'C')],
}

describe('aplanarPreguntas', () => {
  it('textos primero, luego sueltas, en orden', () => {
    expect(aplanarPreguntas(contenido).map((p) => p.preguntaId)).toEqual([10, 20, 30, 40])
  })
})

describe('corregir', () => {
  it('cuenta solo selección múltiple con correcta; compara case-insensitive', () => {
    const r = corregir(contenido, { '0': 'a', '1': 'B ', '2': 'mi ensayo', '3': 'A' })
    expect(r).toEqual({ puntaje: 2, total: 3 }) // 10 y 20 buenas; 40 mala; 30 no puntúa
  })
  it('sin responder cuenta como mala', () => {
    expect(corregir(contenido, {})).toEqual({ puntaje: 0, total: 3 })
  })
  it('prueba 100% desarrollo: total 0', () => {
    const soloDes: ContenidoAsignacion = {
      textos: [], preguntas: [{ ...sm(1, null), tipo: 'desarrollo_largo' }],
    }
    expect(corregir(soloDes, { '0': 'x' })).toEqual({ puntaje: 0, total: 0 })
  })
})

describe('sinRespuestas', () => {
  it('elimina correcta y explicacion de todas las preguntas', () => {
    const s = sinRespuestas(contenido)
    const todas = [...s.textos.flatMap((t) => t.preguntas), ...s.preguntas]
    for (const p of todas) {
      expect('correcta' in p).toBe(false)
      expect('explicacion' in p).toBe(false)
    }
    expect(s.textos[0].titulo).toBe('Lectura')
  })
})
```

- [ ] **Step 2: Correr y ver fallar**

`pnpm test tests/unit/correccion.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `web/lib/tareas/contenido.ts`**

```ts
// ---------------------------------------------------------------------------
// Forma del snapshot congelado de una asignación y su corrección. Puro (sin
// BD): la construcción desde una prueba vive en lib/tareas/snapshot.ts.
// ---------------------------------------------------------------------------

export interface PreguntaSnapshot {
  /** id de la pregunta original, informativo (puede ya no existir). */
  preguntaId: number
  tipo: string
  enunciado: string
  A: string | null
  B: string | null
  C: string | null
  D: string | null
  E: string | null
  correcta: string | null
  explicacion: string | null
  imagenPregunta: string | null
  imagenA: string | null
  imagenB: string | null
  imagenC: string | null
  imagenD: string | null
  imagenE: string | null
  imagenTamano: string
}

export interface TextoSnapshot {
  titulo: string
  contenido: string
  preguntas: PreguntaSnapshot[]
}

export interface ContenidoAsignacion {
  textos: TextoSnapshot[]
  preguntas: PreguntaSnapshot[]
}

/** Versión sin respuestas, apta para serializar al estudiante ANTES de entregar. */
export type PreguntaEstudiante = Omit<PreguntaSnapshot, 'correcta' | 'explicacion'>
export interface ContenidoEstudiante {
  textos: { titulo: string; contenido: string; preguntas: PreguntaEstudiante[] }[]
  preguntas: PreguntaEstudiante[]
}

/**
 * Orden canónico de las preguntas de una asignación: las de cada texto (en
 * orden) y luego las sueltas. El ÍNDICE en esta lista es la clave del jsonb
 * `entregas.respuestas` — cambiarlo rompería entregas existentes.
 */
export function aplanarPreguntas(c: ContenidoAsignacion): PreguntaSnapshot[] {
  return [...c.textos.flatMap((t) => t.preguntas), ...c.preguntas]
}

/**
 * Corrige las alternativas: total = preguntas seleccion_multiple con correcta
 * definida; puntaje = coincidencias (trim + mayúsculas). Desarrollo no puntúa.
 */
export function corregir(
  c: ContenidoAsignacion,
  respuestas: Record<string, string>,
): { puntaje: number; total: number } {
  let puntaje = 0
  let total = 0
  aplanarPreguntas(c).forEach((p, i) => {
    if (p.tipo !== 'seleccion_multiple' || !p.correcta?.trim()) return
    total++
    const r = (respuestas[String(i)] ?? '').trim().toUpperCase()
    if (r && r === p.correcta.trim().toUpperCase()) puntaje++
  })
  return { puntaje, total }
}

function sinRespuestasDePregunta(p: PreguntaSnapshot): PreguntaEstudiante {
  const { correcta: _c, explicacion: _e, ...resto } = p
  return resto
}

/** Quita correcta/explicacion de todo el contenido (lo que ve el estudiante). */
export function sinRespuestas(c: ContenidoAsignacion): ContenidoEstudiante {
  return {
    textos: c.textos.map((t) => ({
      titulo: t.titulo,
      contenido: t.contenido,
      preguntas: t.preguntas.map(sinRespuestasDePregunta),
    })),
    preguntas: c.preguntas.map(sinRespuestasDePregunta),
  }
}
```

- [ ] **Step 4: Tipar el jsonb del schema**

En `web/lib/db/schema.ts`, en la tabla `asignaciones`:

```ts
import type { ContenidoAsignacion } from '@/lib/tareas/contenido'
// ...
contenido: jsonb('contenido').$type<ContenidoAsignacion>().notNull(),
```

(Import `type`-only: no crea ciclo en runtime.)

- [ ] **Step 5: Correr tests y commit**

```bash
pnpm test tests/unit/correccion.test.ts   # PASS
pnpm exec tsc --noEmit
git add lib/tareas/contenido.ts lib/db/schema.ts tests/unit/correccion.test.ts
git commit -m "feat(tareas): tipos del snapshot y corrección pura de alternativas"
```

---

### Task 3: Snapshot de una prueba

**Files:**
- Create: `web/lib/tareas/snapshot.ts`
- Test: `web/tests/integration/snapshot.test.ts`

**Interfaces:**
- Consumes: `ContenidoAsignacion`, `PreguntaSnapshot` (Task 2); tablas `preguntas`, `textos`, `pruebas` del schema.
- Produces: `construirSnapshot(prueba: { preguntasIds: number[]; textosIds: number[]; userId: number }): Promise<ContenidoAsignacion>` — lee de la BD las preguntas/textos DE ESE usuario (ignora ids ajenos o inexistentes) y arma el contenido en el orden de `preguntasIds`/`textosIds`.

- [ ] **Step 1: Test de integración**

`web/tests/integration/snapshot.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { usuarios, preguntas, textos } from '@/lib/db/schema'
import { construirSnapshot } from '@/lib/tareas/snapshot'

async function crearUsuario(prefijo: string) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db.insert(usuarios).values({ nombre: prefijo, email, passwordHash: 'x' }).returning()
  return u
}

describe('construirSnapshot (contra Postgres)', () => {
  it('copia preguntas sueltas y textos con sus preguntas, en orden', async () => {
    const u = await crearUsuario('snap')
    const [t] = await db.insert(textos)
      .values({ userId: u.id, asignatura: 'Física', titulo: 'Lectura', contenido: 'el texto' })
      .returning()
    const [pt] = await db.insert(preguntas)
      .values({ userId: u.id, asignatura: 'Física', pregunta: 'del texto', textoId: t.id, correcta: 'A', A: 'sí', explicacion: 'exp' })
      .returning()
    const [p2] = await db.insert(preguntas)
      .values({ userId: u.id, asignatura: 'Física', pregunta: 'suelta 2', correcta: 'B', A: 'x', B: 'y' })
      .returning()
    const [p1] = await db.insert(preguntas)
      .values({ userId: u.id, asignatura: 'Física', pregunta: 'suelta 1', tipo: 'desarrollo_corto' })
      .returning()

    // Orden pedido: p1 antes que p2 (no el orden de inserción).
    const snap = await construirSnapshot({ preguntasIds: [p1.id, p2.id], textosIds: [t.id], userId: u.id })

    expect(snap.textos).toHaveLength(1)
    expect(snap.textos[0].titulo).toBe('Lectura')
    expect(snap.textos[0].preguntas.map((p) => p.preguntaId)).toEqual([pt.id])
    expect(snap.textos[0].preguntas[0].correcta).toBe('A')
    expect(snap.textos[0].preguntas[0].explicacion).toBe('exp')
    expect(snap.preguntas.map((p) => p.preguntaId)).toEqual([p1.id, p2.id])
    expect(snap.preguntas[0].tipo).toBe('desarrollo_corto')
  })

  it('ignora ids ajenos o inexistentes', async () => {
    const a = await crearUsuario('snap-a')
    const b = await crearUsuario('snap-b')
    const [ajena] = await db.insert(preguntas)
      .values({ userId: b.id, asignatura: 'Física', pregunta: 'de b' })
      .returning()
    const snap = await construirSnapshot({ preguntasIds: [ajena.id, 999999], textosIds: [], userId: a.id })
    expect(snap.preguntas).toEqual([])
    expect(snap.textos).toEqual([])
  })
})
```

- [ ] **Step 2: Correr y ver fallar**

`DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm test tests/integration/snapshot.test.ts` → FAIL.

- [ ] **Step 3: Implementar `web/lib/tareas/snapshot.ts`**

```ts
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { preguntas, textos } from '@/lib/db/schema'
import type { ContenidoAsignacion, PreguntaSnapshot } from '@/lib/tareas/contenido'

function aSnapshot(f: typeof preguntas.$inferSelect): PreguntaSnapshot {
  return {
    preguntaId: f.id,
    tipo: f.tipo ?? 'seleccion_multiple',
    enunciado: f.pregunta,
    A: f.A, B: f.B, C: f.C, D: f.D, E: f.E,
    correcta: f.correcta,
    explicacion: f.explicacion,
    imagenPregunta: f.imagenPregunta,
    imagenA: f.imagenA, imagenB: f.imagenB, imagenC: f.imagenC,
    imagenD: f.imagenD, imagenE: f.imagenE,
    imagenTamano: f.imagenTamano,
  }
}

/**
 * Congela el contenido de una prueba para una asignación: preguntas sueltas en
 * el orden de `preguntasIds` y textos (con sus preguntas asociadas) en el orden
 * de `textosIds`. Solo incluye filas del `userId` dueño — ids ajenos o ya
 * borrados se ignoran en silencio.
 */
export async function construirSnapshot(prueba: {
  preguntasIds: number[]
  textosIds: number[]
  userId: number
}): Promise<ContenidoAsignacion> {
  const { preguntasIds, textosIds, userId } = prueba

  const sueltas = preguntasIds.length
    ? await db.select().from(preguntas)
        .where(and(inArray(preguntas.id, preguntasIds), eq(preguntas.userId, userId)))
    : []
  const porId = new Map(sueltas.map((p) => [p.id, p]))

  const filasTextos = textosIds.length
    ? await db.select().from(textos)
        .where(and(inArray(textos.id, textosIds), eq(textos.userId, userId)))
    : []
  const textosPorId = new Map(filasTextos.map((t) => [t.id, t]))

  const preguntasDeTextos = filasTextos.length
    ? await db.select().from(preguntas)
        .where(and(inArray(preguntas.textoId, textosIds), eq(preguntas.userId, userId)))
    : []

  return {
    textos: textosIds
      .map((id) => textosPorId.get(id))
      .filter((t) => t != null)
      .map((t) => ({
        titulo: t.titulo,
        contenido: t.contenido,
        preguntas: preguntasDeTextos.filter((p) => p.textoId === t.id).map(aSnapshot),
      })),
    preguntas: preguntasIds
      .map((id) => porId.get(id))
      .filter((p) => p != null)
      .map(aSnapshot),
  }
}
```

- [ ] **Step 4: Correr, typecheck, commit**

```bash
DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm test tests/integration/snapshot.test.ts  # PASS
pnpm exec tsc --noEmit
git add lib/tareas/snapshot.ts tests/integration/snapshot.test.ts
git commit -m "feat(tareas): snapshot congelado del contenido de una prueba"
```

---

### Task 4: Actions y queries de cursos e inscripciones

**Files:**
- Create: `web/lib/actions/cursos.ts`
- Create: `web/lib/queries/cursos.ts`
- Test: `web/tests/integration/cursos.test.ts`

**Interfaces:**
- Consumes: `getActor` de `@/lib/authz`; tablas `cursos`, `inscripciones`, `usuarios`.
- Produces (actions, todas `'use server'`):
  - `crearCurso(nombre: string): Promise<{ ok: true; id: number } | { error: string }>` — rol ≠ student; genera joinCode único (mismo patrón de `lib/actions/colegio.ts:50`).
  - `quitarAlumno(cursoId: number, estudianteId: number): Promise<{ ok: true } | { error: string }>` — solo dueño del curso; borra la inscripción, no las entregas.
  - `inscribirConCodigo(codigo: string): Promise<{ ok: true; cursoId: number } | { error: string }>` — actor con rol `student`; idempotente.
  - `eliminarCurso(cursoId: number)` NO existe en v1 (YAGNI).
- Produces (queries):
  - `listarCursosPropios(userId: number): Promise<{ id: number; nombre: string; joinCode: string; nAlumnos: number; nTareas: number }[]>`
  - `cargarCursoPorId(id: number, userId: number): Promise<{ id; nombre; joinCode; alumnos: { id: number; nombre: string; email: string }[] } | null>` — guard de propiedad.
  - `cursosDeEstudiante(estudianteId: number): Promise<{ id: number; nombre: string }[]>`

- [ ] **Step 1: Test de integración**

`web/tests/integration/cursos.test.ts` (mismo patrón de mocks que `adopcion.test.ts:8-16`):

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, cursos, inscripciones } from '@/lib/db/schema'

let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { crearCurso, quitarAlumno, inscribirConCodigo } = await import('@/lib/actions/cursos')
const { listarCursosPropios, cargarCursoPorId } = await import('@/lib/queries/cursos')

async function crearUsuario(prefijo: string, role = 'teacher') {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db.insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x', role })
    .returning()
  return u
}

beforeEach(() => { currentUserId = 0 })

describe('cursos e inscripciones (contra Postgres)', () => {
  it('el profesor crea un curso con joinCode y lo lista', async () => {
    const prof = await crearUsuario('curso-prof')
    currentUserId = prof.id
    const res = await crearCurso('8°A Física')
    expect('ok' in res).toBe(true)
    const lista = await listarCursosPropios(prof.id)
    expect(lista).toHaveLength(1)
    expect(lista[0].nombre).toBe('8°A Física')
    expect(lista[0].joinCode.length).toBeGreaterThan(8)
    expect(lista[0].nAlumnos).toBe(0)
  })

  it('un estudiante no puede crear cursos', async () => {
    const est = await crearUsuario('curso-est', 'student')
    currentUserId = est.id
    const res = await crearCurso('Curso pirata')
    expect('error' in res).toBe(true)
  })

  it('inscribirConCodigo: inscribe, es idempotente y rechaza códigos inválidos', async () => {
    const prof = await crearUsuario('insc-prof')
    currentUserId = prof.id
    const curso = await crearCurso('1°B')
    const cursoId = 'ok' in curso ? curso.id : 0
    const [fila] = await db.select().from(cursos).where(eq(cursos.id, cursoId))

    const est = await crearUsuario('insc-est', 'student')
    currentUserId = est.id
    expect(await inscribirConCodigo(fila.joinCode)).toEqual({ ok: true, cursoId })
    expect(await inscribirConCodigo(fila.joinCode)).toEqual({ ok: true, cursoId }) // idempotente
    const insc = await db.select().from(inscripciones).where(eq(inscripciones.estudianteId, est.id))
    expect(insc).toHaveLength(1)
    expect('error' in (await inscribirConCodigo('no-existe'))).toBe(true)
  })

  it('un profesor no puede inscribirse como alumno', async () => {
    const prof = await crearUsuario('insc-prof2')
    currentUserId = prof.id
    const curso = await crearCurso('2°C')
    const cursoId = 'ok' in curso ? curso.id : 0
    const [fila] = await db.select().from(cursos).where(eq(cursos.id, cursoId))
    expect('error' in (await inscribirConCodigo(fila.joinCode))).toBe(true)
  })

  it('quitarAlumno: solo el dueño; borra la inscripción', async () => {
    const prof = await crearUsuario('quitar-prof')
    const otro = await crearUsuario('quitar-otro')
    const est = await crearUsuario('quitar-est', 'student')
    currentUserId = prof.id
    const curso = await crearCurso('3°D')
    const cursoId = 'ok' in curso ? curso.id : 0
    await db.insert(inscripciones).values({ cursoId, estudianteId: est.id })

    currentUserId = otro.id
    expect('error' in (await quitarAlumno(cursoId, est.id))).toBe(true)

    currentUserId = prof.id
    expect(await quitarAlumno(cursoId, est.id)).toEqual({ ok: true })
    const detalle = await cargarCursoPorId(cursoId, prof.id)
    expect(detalle?.alumnos).toEqual([])
  })

  it('cargarCursoPorId devuelve null para un curso ajeno', async () => {
    const prof = await crearUsuario('detalle-prof')
    const otro = await crearUsuario('detalle-otro')
    currentUserId = prof.id
    const curso = await crearCurso('4°E')
    const cursoId = 'ok' in curso ? curso.id : 0
    expect(await cargarCursoPorId(cursoId, otro.id)).toBeNull()
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `DATABASE_URL=... pnpm test tests/integration/cursos.test.ts` → FAIL.

- [ ] **Step 3: Implementar `web/lib/actions/cursos.ts`**

```ts
'use server'

import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { cursos, inscripciones } from '@/lib/db/schema'
import { getActor } from '@/lib/authz'

export type ResultadoCurso = { ok: true; id: number } | { error: string }

function generarToken(bytes = 12): string {
  return randomBytes(bytes).toString('base64url')
}

/** joinCode único con reintento ante colisión (mismo patrón que colegios). */
async function generarJoinCodeUnico(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const codigo = generarToken(12)
    const [existe] = await db.select({ id: cursos.id }).from(cursos)
      .where(eq(cursos.joinCode, codigo)).limit(1)
    if (!existe) return codigo
  }
  return generarToken(24)
}

/** Crea un curso del profesor actual. Los estudiantes no pueden crear cursos. */
export async function crearCurso(nombre: string): Promise<ResultadoCurso> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }
  if (actor.role === 'student') return { error: 'No autorizado.' }

  const limpio = (nombre ?? '').trim()
  if (!limpio) return { error: 'Ingresa el nombre del curso.' }
  if (limpio.length > 120) return { error: 'El nombre es demasiado largo.' }

  const joinCode = await generarJoinCodeUnico()
  const [fila] = await db.insert(cursos)
    .values({ userId: actor.userId, nombre: limpio, joinCode })
    .returning()
  revalidatePath('/cursos')
  return { ok: true, id: fila.id }
}

/** Quita a un alumno del curso (borra la inscripción, no sus entregas). */
export async function quitarAlumno(
  cursoId: number,
  estudianteId: number,
): Promise<{ ok: true } | { error: string }> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }

  const [curso] = await db.select({ id: cursos.id }).from(cursos)
    .where(and(eq(cursos.id, cursoId), eq(cursos.userId, actor.userId)))
    .limit(1)
  if (!curso) return { error: 'Curso no encontrado.' }

  await db.delete(inscripciones).where(and(
    eq(inscripciones.cursoId, cursoId),
    eq(inscripciones.estudianteId, estudianteId),
  ))
  revalidatePath(`/cursos/${cursoId}`)
  return { ok: true }
}

/**
 * Inscribe al estudiante actual al curso del código. Idempotente si ya estaba.
 * Solo estudiantes: un profesor no se inscribe a cursos.
 */
export async function inscribirConCodigo(
  codigo: string,
): Promise<{ ok: true; cursoId: number } | { error: string }> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }
  if (actor.role !== 'student') return { error: 'Solo los estudiantes pueden unirse a un curso.' }

  const limpio = (codigo ?? '').trim()
  if (!limpio) return { error: 'Ingresa el código del curso.' }

  const [curso] = await db.select({ id: cursos.id }).from(cursos)
    .where(eq(cursos.joinCode, limpio)).limit(1)
  if (!curso) return { error: 'El código no corresponde a ningún curso.' }

  await db.insert(inscripciones)
    .values({ cursoId: curso.id, estudianteId: actor.userId })
    .onConflictDoNothing()
  revalidatePath('/tareas')
  return { ok: true, cursoId: curso.id }
}
```

- [ ] **Step 4: Implementar `web/lib/queries/cursos.ts`**

```ts
import { and, count, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { asignaciones, cursos, inscripciones, usuarios } from '@/lib/db/schema'

export interface CursoResumen {
  id: number
  nombre: string
  joinCode: string
  nAlumnos: number
  nTareas: number
}

/** Cursos del profesor con conteo de alumnos y tareas. */
export async function listarCursosPropios(userId: number): Promise<CursoResumen[]> {
  const filas = await db.select().from(cursos)
    .where(eq(cursos.userId, userId))
    .orderBy(desc(cursos.createdAt), desc(cursos.id))
  if (filas.length === 0) return []

  const ids = filas.map((c) => c.id)
  const [alumnos, tareas] = await Promise.all([
    db.select({ cursoId: inscripciones.cursoId, n: count() }).from(inscripciones)
      .where(eq(cursos.userId, userId))
      .innerJoin(cursos, eq(inscripciones.cursoId, cursos.id))
      .groupBy(inscripciones.cursoId),
    db.select({ cursoId: asignaciones.cursoId, n: count() }).from(asignaciones)
      .innerJoin(cursos, eq(asignaciones.cursoId, cursos.id))
      .where(eq(cursos.userId, userId))
      .groupBy(asignaciones.cursoId),
  ])
  const nAlumnos = new Map(alumnos.map((a) => [a.cursoId, Number(a.n)]))
  const nTareas = new Map(tareas.map((t) => [t.cursoId, Number(t.n)]))
  return filas.map((c) => ({
    id: c.id, nombre: c.nombre, joinCode: c.joinCode,
    nAlumnos: nAlumnos.get(c.id) ?? 0,
    nTareas: nTareas.get(c.id) ?? 0,
  }))
}

export interface CursoDetalle {
  id: number
  nombre: string
  joinCode: string
  alumnos: { id: number; nombre: string; email: string }[]
}

/** Detalle de un curso con guard de propiedad (null si no existe o es ajeno). */
export async function cargarCursoPorId(
  id: number,
  userId: number,
): Promise<CursoDetalle | null> {
  if (!Number.isFinite(id)) return null
  const [curso] = await db.select().from(cursos)
    .where(and(eq(cursos.id, id), eq(cursos.userId, userId))).limit(1)
  if (!curso) return null

  const alumnos = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email })
    .from(inscripciones)
    .innerJoin(usuarios, eq(inscripciones.estudianteId, usuarios.id))
    .where(eq(inscripciones.cursoId, id))
    .orderBy(usuarios.nombre)

  return { id: curso.id, nombre: curso.nombre, joinCode: curso.joinCode, alumnos }
}

/** Cursos en los que está inscrito un estudiante. */
export async function cursosDeEstudiante(
  estudianteId: number,
): Promise<{ id: number; nombre: string }[]> {
  return db.select({ id: cursos.id, nombre: cursos.nombre })
    .from(inscripciones)
    .innerJoin(cursos, eq(inscripciones.cursoId, cursos.id))
    .where(eq(inscripciones.estudianteId, estudianteId))
    .orderBy(cursos.nombre)
}
```

Nota: si drizzle rechaza el `innerJoin` después de `.where` en `listarCursosPropios`, reordenar a `.from(...).innerJoin(...).where(...).groupBy(...)` (el orden correcto del builder).

- [ ] **Step 5: Correr tests, typecheck, commit**

```bash
DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm test tests/integration/cursos.test.ts  # PASS
pnpm exec tsc --noEmit
git add lib/actions/cursos.ts lib/queries/cursos.ts tests/integration/cursos.test.ts
git commit -m "feat(cursos): crear curso con código, inscripciones y queries"
```

---

### Task 5: Asignar una prueba a un curso

**Files:**
- Create: `web/lib/actions/asignaciones.ts`
- Test: `web/tests/integration/asignaciones.test.ts`

**Interfaces:**
- Consumes: `construirSnapshot` (Task 3), `getActor`, `cargarPruebaPorId` de `@/lib/queries/pruebas`, tablas `cursos`, `asignaciones`, `entregas`.
- Produces:
  - `asignarPruebaACurso(input: { pruebaId: number; cursoId: number; fechaLimite?: string | null; instrucciones?: string | null }): Promise<{ ok: true; id: number } | { error: string }>` — dueño de curso Y prueba; `fechaLimite` ISO string o null; congela snapshot; rechaza pruebas sin preguntas.
  - `eliminarAsignacion(id: number): Promise<{ ok: true } | { error: string }>` — dueño del curso; borra también las entregas.

- [ ] **Step 1: Test de integración**

`web/tests/integration/asignaciones.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, preguntas, pruebas, cursos, asignaciones, entregas } from '@/lib/db/schema'

let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { asignarPruebaACurso, eliminarAsignacion } = await import('@/lib/actions/asignaciones')

async function crearUsuario(prefijo: string, role = 'teacher') {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db.insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x', role }).returning()
  return u
}

async function fixtures() {
  const prof = await crearUsuario('asig-prof')
  const [p] = await db.insert(preguntas)
    .values({ userId: prof.id, asignatura: 'Física', pregunta: 'original', correcta: 'A', A: 'x' })
    .returning()
  const [prueba] = await db.insert(pruebas)
    .values({ userId: prof.id, asignatura: 'Física', titulo: 'Prueba 1', preguntasIds: [p.id], textosIds: [] })
    .returning()
  const [curso] = await db.insert(cursos)
    .values({ userId: prof.id, nombre: '8°A', joinCode: `jc-${Date.now()}-${Math.random()}` })
    .returning()
  return { prof, p, prueba, curso }
}

beforeEach(() => { currentUserId = 0 })

describe('asignarPruebaACurso (contra Postgres)', () => {
  it('congela el snapshot: editar y borrar la prueba original no afecta la asignación', async () => {
    const { prof, p, prueba, curso } = await fixtures()
    currentUserId = prof.id
    const res = await asignarPruebaACurso({ pruebaId: prueba.id, cursoId: curso.id })
    expect('ok' in res).toBe(true)
    const asigId = 'ok' in res ? res.id : 0

    await db.update(preguntas).set({ pregunta: 'EDITADA' }).where(eq(preguntas.id, p.id))
    await db.delete(pruebas).where(eq(pruebas.id, prueba.id))

    const [asig] = await db.select().from(asignaciones).where(eq(asignaciones.id, asigId))
    expect(asig.contenido.preguntas[0].enunciado).toBe('original')
    expect(asig.titulo).toBe('Prueba 1')
  })

  it('rechaza curso ajeno y prueba ajena', async () => {
    const { prueba, curso } = await fixtures()
    const otro = await crearUsuario('asig-otro')
    currentUserId = otro.id
    expect('error' in (await asignarPruebaACurso({ pruebaId: prueba.id, cursoId: curso.id }))).toBe(true)
  })

  it('eliminarAsignacion borra también las entregas', async () => {
    const { prof, prueba, curso } = await fixtures()
    const est = await crearUsuario('asig-est', 'student')
    currentUserId = prof.id
    const res = await asignarPruebaACurso({ pruebaId: prueba.id, cursoId: curso.id })
    const asigId = 'ok' in res ? res.id : 0
    await db.insert(entregas).values({
      asignacionId: asigId, estudianteId: est.id, respuestas: { '0': 'A' }, puntaje: 1, total: 1,
    })

    expect(await eliminarAsignacion(asigId)).toEqual({ ok: true })
    expect(await db.select().from(entregas).where(eq(entregas.asignacionId, asigId))).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — FAIL (módulo no existe).

- [ ] **Step 3: Implementar `web/lib/actions/asignaciones.ts`**

```ts
'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { asignaciones, cursos, entregas } from '@/lib/db/schema'
import { getActor } from '@/lib/authz'
import { cargarPruebaPorId } from '@/lib/queries/pruebas'
import { construirSnapshot } from '@/lib/tareas/snapshot'
import { aplanarPreguntas } from '@/lib/tareas/contenido'

/**
 * Crea una asignación congelando el snapshot de la prueba. El profesor debe
 * ser dueño del curso Y de la prueba. La misma prueba puede asignarse varias
 * veces (cada asignación es independiente).
 */
export async function asignarPruebaACurso(input: {
  pruebaId: number
  cursoId: number
  fechaLimite?: string | null
  instrucciones?: string | null
}): Promise<{ ok: true; id: number } | { error: string }> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }
  if (actor.role === 'student') return { error: 'No autorizado.' }

  const [curso] = await db.select({ id: cursos.id }).from(cursos)
    .where(and(eq(cursos.id, input.cursoId), eq(cursos.userId, actor.userId)))
    .limit(1)
  if (!curso) return { error: 'Curso no encontrado.' }

  const prueba = await cargarPruebaPorId(input.pruebaId, actor.userId)
  if (!prueba) return { error: 'Prueba no encontrada.' }

  const contenido = await construirSnapshot({
    preguntasIds: prueba.preguntasIds,
    textosIds: prueba.textosIds,
    userId: actor.userId,
  })
  if (aplanarPreguntas(contenido).length === 0) {
    return { error: 'La prueba no tiene preguntas para asignar.' }
  }

  let fechaLimite: Date | null = null
  if (input.fechaLimite) {
    const d = new Date(input.fechaLimite)
    if (Number.isNaN(d.getTime())) return { error: 'Fecha límite inválida.' }
    fechaLimite = d
  }

  const [fila] = await db.insert(asignaciones).values({
    cursoId: curso.id,
    pruebaId: prueba.id,
    titulo: prueba.titulo?.trim() || 'Prueba',
    instrucciones: (input.instrucciones ?? prueba.instrucciones)?.trim() || null,
    contenido,
    fechaLimite,
  }).returning()

  revalidatePath(`/cursos/${curso.id}`)
  return { ok: true, id: fila.id }
}

/** Elimina la asignación Y sus entregas. Solo el dueño del curso. */
export async function eliminarAsignacion(
  id: number,
): Promise<{ ok: true } | { error: string }> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }

  const [fila] = await db
    .select({ id: asignaciones.id, cursoId: asignaciones.cursoId })
    .from(asignaciones)
    .innerJoin(cursos, eq(asignaciones.cursoId, cursos.id))
    .where(and(eq(asignaciones.id, id), eq(cursos.userId, actor.userId)))
    .limit(1)
  if (!fila) return { error: 'Tarea no encontrada.' }

  await db.transaction(async (tx) => {
    await tx.delete(entregas).where(eq(entregas.asignacionId, fila.id))
    await tx.delete(asignaciones).where(eq(asignaciones.id, fila.id))
  })
  revalidatePath(`/cursos/${fila.cursoId}`)
  return { ok: true }
}
```

- [ ] **Step 4: Correr tests, typecheck, commit**

```bash
DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm test tests/integration/asignaciones.test.ts  # PASS
pnpm exec tsc --noEmit
git add lib/actions/asignaciones.ts tests/integration/asignaciones.test.ts
git commit -m "feat(tareas): asignar prueba a curso con snapshot congelado"
```

---

### Task 6: Lado estudiante — ver tarea y entregar

**Files:**
- Create: `web/lib/queries/tareas.ts`
- Create: `web/lib/actions/entregas.ts`
- Test: `web/tests/integration/entregas.test.ts`

**Interfaces:**
- Consumes: `sinRespuestas`, `corregir`, `aplanarPreguntas`, tipos (Task 2); tablas `asignaciones`, `inscripciones`, `entregas`, `cursos`.
- Produces (queries):
  - `interface TareaResumen { id: number; titulo: string; curso: string; fechaLimite: Date | null; estado: 'pendiente' | 'entregada' | 'vencida'; puntaje: number | null; total: number | null }`
  - `listarTareasDeEstudiante(estudianteId: number): Promise<TareaResumen[]>` — todas las asignaciones de sus cursos; `estado` calculado (entregada > vencida > pendiente).
  - `cargarTareaParaEstudiante(asignacionId: number, estudianteId: number): Promise<{ id; titulo; instrucciones; fechaLimite; curso: string; entregada: false; contenido: ContenidoEstudiante } | { id; titulo; instrucciones; fechaLimite; curso: string; entregada: true; contenido: ContenidoAsignacion; respuestas: Record<string,string>; puntaje: number; total: number } | null>` — null si no está inscrito; SIN correctas antes de entregar, CON correctas después.
- Produces (action): `entregarTarea(asignacionId: number, respuestas: Record<string, string>): Promise<{ ok: true; puntaje: number; total: number } | { error: string }>`.

- [ ] **Step 1: Test de integración**

`web/tests/integration/entregas.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { usuarios, cursos, inscripciones, asignaciones } from '@/lib/db/schema'
import type { ContenidoAsignacion } from '@/lib/tareas/contenido'

let currentUserId = 0
vi.mock('@/lib/get-session', () => ({
  getSession: async () =>
    currentUserId ? { user: { id: String(currentUserId) } } : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { entregarTarea } = await import('@/lib/actions/entregas')
const { cargarTareaParaEstudiante, listarTareasDeEstudiante } = await import('@/lib/queries/tareas')

async function crearUsuario(prefijo: string, role = 'teacher') {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db.insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x', role }).returning()
  return u
}

const CONTENIDO: ContenidoAsignacion = {
  textos: [],
  preguntas: [
    {
      preguntaId: 1, tipo: 'seleccion_multiple', enunciado: '2+2', A: '3', B: '4',
      C: null, D: null, E: null, correcta: 'B', explicacion: 'aritmética',
      imagenPregunta: null, imagenA: null, imagenB: null, imagenC: null,
      imagenD: null, imagenE: null, imagenTamano: 'mediano',
    },
    {
      preguntaId: 2, tipo: 'desarrollo_corto', enunciado: 'explica', A: null, B: null,
      C: null, D: null, E: null, correcta: null, explicacion: null,
      imagenPregunta: null, imagenA: null, imagenB: null, imagenC: null,
      imagenD: null, imagenE: null, imagenTamano: 'mediano',
    },
  ],
}

async function fixtures(fechaLimite: Date | null = null) {
  const prof = await crearUsuario('ent-prof')
  const est = await crearUsuario('ent-est', 'student')
  const [curso] = await db.insert(cursos)
    .values({ userId: prof.id, nombre: '8°A', joinCode: `jc-${Date.now()}-${Math.random()}` })
    .returning()
  await db.insert(inscripciones).values({ cursoId: curso.id, estudianteId: est.id })
  const [asig] = await db.insert(asignaciones)
    .values({ cursoId: curso.id, pruebaId: 999, titulo: 'Tarea', contenido: CONTENIDO, fechaLimite })
    .returning()
  return { prof, est, curso, asig }
}

beforeEach(() => { currentUserId = 0 })

describe('tareas del estudiante (contra Postgres)', () => {
  it('antes de entregar, la carga NO incluye correcta ni explicacion', async () => {
    const { est, asig } = await fixtures()
    const tarea = await cargarTareaParaEstudiante(asig.id, est.id)
    expect(tarea?.entregada).toBe(false)
    const json = JSON.stringify(tarea)
    expect(json).not.toContain('correcta')
    expect(json).not.toContain('explicacion')
    expect(json).not.toContain('aritmética')
  })

  it('no inscrito → null', async () => {
    const { asig } = await fixtures()
    const intruso = await crearUsuario('ent-intruso', 'student')
    expect(await cargarTareaParaEstudiante(asig.id, intruso.id)).toBeNull()
  })

  it('entregar corrige, guarda y luego la carga trae correctas y respuestas', async () => {
    const { est, asig } = await fixtures()
    currentUserId = est.id
    const res = await entregarTarea(asig.id, { '0': 'B', '1': 'mi ensayo' })
    expect(res).toEqual({ ok: true, puntaje: 1, total: 1 })

    const tarea = await cargarTareaParaEstudiante(asig.id, est.id)
    expect(tarea?.entregada).toBe(true)
    if (tarea?.entregada) {
      expect(tarea.puntaje).toBe(1)
      expect(tarea.respuestas['1']).toBe('mi ensayo')
      expect(tarea.contenido.preguntas[0].correcta).toBe('B')
    }
  })

  it('rechaza segundo intento, fuera de plazo y no inscrito', async () => {
    const { est, asig } = await fixtures()
    currentUserId = est.id
    await entregarTarea(asig.id, { '0': 'A' })
    expect('error' in (await entregarTarea(asig.id, { '0': 'B' }))).toBe(true)

    const vencida = await fixtures(new Date('2020-01-01'))
    currentUserId = vencida.est.id
    expect('error' in (await entregarTarea(vencida.asig.id, { '0': 'B' }))).toBe(true)

    const intruso = await crearUsuario('ent-intruso2', 'student')
    currentUserId = intruso.id
    expect('error' in (await entregarTarea(asig.id, { '0': 'B' }))).toBe(true)
  })

  it('listarTareasDeEstudiante calcula estados', async () => {
    const { est, asig } = await fixtures()
    const vencida = await fixtures(new Date('2020-01-01'))
    // Mismo estudiante inscrito también en el curso vencido.
    await db.insert(inscripciones).values({ cursoId: vencida.curso.id, estudianteId: est.id })
    currentUserId = est.id
    await entregarTarea(asig.id, { '0': 'B' })

    const lista = await listarTareasDeEstudiante(est.id)
    const porId = new Map(lista.map((t) => [t.id, t]))
    expect(porId.get(asig.id)?.estado).toBe('entregada')
    expect(porId.get(asig.id)?.puntaje).toBe(1)
    expect(porId.get(vencida.asig.id)?.estado).toBe('vencida')
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — FAIL.

- [ ] **Step 3: Implementar `web/lib/queries/tareas.ts`**

```ts
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { asignaciones, cursos, entregas, inscripciones } from '@/lib/db/schema'
import {
  sinRespuestas,
  type ContenidoAsignacion,
  type ContenidoEstudiante,
} from '@/lib/tareas/contenido'

export interface TareaResumen {
  id: number
  titulo: string
  curso: string
  fechaLimite: Date | null
  estado: 'pendiente' | 'entregada' | 'vencida'
  puntaje: number | null
  total: number | null
}

function estadoDe(
  fechaLimite: Date | null,
  entrega: { puntaje: number } | undefined,
): TareaResumen['estado'] {
  if (entrega) return 'entregada'
  if (fechaLimite && fechaLimite < new Date()) return 'vencida'
  return 'pendiente'
}

/** Todas las asignaciones de los cursos del estudiante, con su estado. */
export async function listarTareasDeEstudiante(
  estudianteId: number,
): Promise<TareaResumen[]> {
  const filas = await db
    .select({
      id: asignaciones.id,
      titulo: asignaciones.titulo,
      curso: cursos.nombre,
      fechaLimite: asignaciones.fechaLimite,
    })
    .from(inscripciones)
    .innerJoin(cursos, eq(inscripciones.cursoId, cursos.id))
    .innerJoin(asignaciones, eq(asignaciones.cursoId, cursos.id))
    .where(eq(inscripciones.estudianteId, estudianteId))
    .orderBy(desc(asignaciones.createdAt), desc(asignaciones.id))
  if (filas.length === 0) return []

  const propias = await db.select().from(entregas).where(and(
    eq(entregas.estudianteId, estudianteId),
    inArray(entregas.asignacionId, filas.map((f) => f.id)),
  ))
  const porAsig = new Map(propias.map((e) => [e.asignacionId, e]))

  return filas.map((f) => {
    const entrega = porAsig.get(f.id)
    return {
      id: f.id,
      titulo: f.titulo,
      curso: f.curso,
      fechaLimite: f.fechaLimite,
      estado: estadoDe(f.fechaLimite, entrega),
      puntaje: entrega?.puntaje ?? null,
      total: entrega?.total ?? null,
    }
  })
}

interface TareaBase {
  id: number
  titulo: string
  instrucciones: string | null
  fechaLimite: Date | null
  curso: string
}

export type TareaEstudiante =
  | (TareaBase & { entregada: false; contenido: ContenidoEstudiante })
  | (TareaBase & {
      entregada: true
      contenido: ContenidoAsignacion
      respuestas: Record<string, string>
      puntaje: number
      total: number
    })

/**
 * Carga una tarea PARA el estudiante: null si la asignación no existe o él no
 * está inscrito en su curso. Sin entrega, el contenido va SIN correctas ni
 * explicaciones; con entrega, va completo más sus respuestas y puntaje.
 */
export async function cargarTareaParaEstudiante(
  asignacionId: number,
  estudianteId: number,
): Promise<TareaEstudiante | null> {
  if (!Number.isFinite(asignacionId)) return null
  const [fila] = await db
    .select({
      id: asignaciones.id,
      titulo: asignaciones.titulo,
      instrucciones: asignaciones.instrucciones,
      fechaLimite: asignaciones.fechaLimite,
      contenido: asignaciones.contenido,
      curso: cursos.nombre,
    })
    .from(asignaciones)
    .innerJoin(cursos, eq(asignaciones.cursoId, cursos.id))
    .innerJoin(inscripciones, and(
      eq(inscripciones.cursoId, cursos.id),
      eq(inscripciones.estudianteId, estudianteId),
    ))
    .where(eq(asignaciones.id, asignacionId))
    .limit(1)
  if (!fila) return null

  const [entrega] = await db.select().from(entregas).where(and(
    eq(entregas.asignacionId, asignacionId),
    eq(entregas.estudianteId, estudianteId),
  )).limit(1)

  const base: TareaBase = {
    id: fila.id,
    titulo: fila.titulo,
    instrucciones: fila.instrucciones,
    fechaLimite: fila.fechaLimite,
    curso: fila.curso,
  }
  if (!entrega) {
    return { ...base, entregada: false, contenido: sinRespuestas(fila.contenido) }
  }
  return {
    ...base,
    entregada: true,
    contenido: fila.contenido,
    respuestas: entrega.respuestas,
    puntaje: entrega.puntaje,
    total: entrega.total,
  }
}
```

- [ ] **Step 4: Implementar `web/lib/actions/entregas.ts`**

```ts
'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { asignaciones, entregas, inscripciones } from '@/lib/db/schema'
import { getActor } from '@/lib/authz'
import { aplanarPreguntas, corregir } from '@/lib/tareas/contenido'

/**
 * Entrega única de una tarea: valida rol student + inscripción + plazo, corrige
 * las alternativas contra el snapshot del servidor y persiste. El unique
 * (asignacionId, estudianteId) garantiza un intento aunque haya doble submit.
 */
export async function entregarTarea(
  asignacionId: number,
  respuestas: Record<string, string>,
): Promise<{ ok: true; puntaje: number; total: number } | { error: string }> {
  const actor = await getActor()
  if (!actor) return { error: 'Debes iniciar sesión.' }
  if (actor.role !== 'student') return { error: 'No autorizado.' }

  const [asig] = await db
    .select({
      id: asignaciones.id,
      contenido: asignaciones.contenido,
      fechaLimite: asignaciones.fechaLimite,
    })
    .from(asignaciones)
    .innerJoin(inscripciones, and(
      eq(inscripciones.cursoId, asignaciones.cursoId),
      eq(inscripciones.estudianteId, actor.userId),
    ))
    .where(eq(asignaciones.id, asignacionId))
    .limit(1)
  if (!asig) return { error: 'Tarea no encontrada.' }

  if (asig.fechaLimite && asig.fechaLimite < new Date()) {
    return { error: 'El plazo de entrega ya venció.' }
  }

  // Sanitiza: solo claves de índices válidos y valores string acotados.
  const n = aplanarPreguntas(asig.contenido).length
  const limpias: Record<string, string> = {}
  for (let i = 0; i < n; i++) {
    const v = respuestas?.[String(i)]
    if (typeof v === 'string' && v.trim()) limpias[String(i)] = v.slice(0, 10000)
  }

  const { puntaje, total } = corregir(asig.contenido, limpias)
  try {
    await db.insert(entregas).values({
      asignacionId: asig.id,
      estudianteId: actor.userId,
      respuestas: limpias,
      puntaje,
      total,
    })
  } catch {
    // Violación del unique = ya entregó.
    return { error: 'Ya entregaste esta tarea.' }
  }
  revalidatePath(`/tareas/${asig.id}`)
  revalidatePath('/tareas')
  return { ok: true, puntaje, total }
}
```

- [ ] **Step 5: Correr tests, typecheck, commit**

```bash
DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm test tests/integration/entregas.test.ts  # PASS
pnpm exec tsc --noEmit
git add lib/queries/tareas.ts lib/actions/entregas.ts tests/integration/entregas.test.ts
git commit -m "feat(tareas): carga sin respuestas y entrega única con corrección en servidor"
```

---

### Task 7: Resultados para el profesor

**Files:**
- Create: `web/lib/queries/resultados.ts`
- Test: `web/tests/integration/resultados.test.ts`

**Interfaces:**
- Consumes: tablas y tipos previos.
- Produces:
  - `listarAsignacionesDeCurso(cursoId: number, userId: number): Promise<{ id: number; titulo: string; fechaLimite: Date | null; nEntregas: number; nAlumnos: number; createdAt: Date }[]>` — vacío si el curso no es del usuario.
  - `cargarResultados(asignacionId: number, userId: number): Promise<{ id; titulo; fechaLimite; cursoId; cursoNombre; contenido: ContenidoAsignacion; filas: { estudianteId: number; nombre: string; entrega: { respuestas: Record<string,string>; puntaje: number; total: number; enviadoEl: Date } | null }[] } | null>` — null si la asignación no pertenece a un curso del usuario; una fila por alumno inscrito (entrega null = pendiente).

- [ ] **Step 1: Test de integración**

`web/tests/integration/resultados.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { usuarios, cursos, inscripciones, asignaciones, entregas } from '@/lib/db/schema'
import { cargarResultados, listarAsignacionesDeCurso } from '@/lib/queries/resultados'
import type { ContenidoAsignacion } from '@/lib/tareas/contenido'

async function crearUsuario(prefijo: string, role = 'teacher') {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2)}@x.cl`
  const [u] = await db.insert(usuarios)
    .values({ nombre: prefijo, email, passwordHash: 'x', role }).returning()
  return u
}

const CONTENIDO: ContenidoAsignacion = { textos: [], preguntas: [] }

describe('resultados del profesor (contra Postgres)', () => {
  it('una fila por alumno; entrega null = pendiente; solo el dueño ve', async () => {
    const prof = await crearUsuario('res-prof')
    const otro = await crearUsuario('res-otro')
    const e1 = await crearUsuario('res-e1', 'student')
    const e2 = await crearUsuario('res-e2', 'student')
    const [curso] = await db.insert(cursos)
      .values({ userId: prof.id, nombre: '8°A', joinCode: `jc-${Date.now()}-${Math.random()}` })
      .returning()
    await db.insert(inscripciones).values([
      { cursoId: curso.id, estudianteId: e1.id },
      { cursoId: curso.id, estudianteId: e2.id },
    ])
    const [asig] = await db.insert(asignaciones)
      .values({ cursoId: curso.id, pruebaId: 1, titulo: 'T', contenido: CONTENIDO })
      .returning()
    await db.insert(entregas).values({
      asignacionId: asig.id, estudianteId: e1.id,
      respuestas: { '0': 'A' }, puntaje: 3, total: 5,
    })

    const res = await cargarResultados(asig.id, prof.id)
    expect(res?.filas).toHaveLength(2)
    const porId = new Map(res!.filas.map((f) => [f.estudianteId, f]))
    expect(porId.get(e1.id)?.entrega?.puntaje).toBe(3)
    expect(porId.get(e2.id)?.entrega).toBeNull()

    expect(await cargarResultados(asig.id, otro.id)).toBeNull()

    const lista = await listarAsignacionesDeCurso(curso.id, prof.id)
    expect(lista).toHaveLength(1)
    expect(lista[0].nEntregas).toBe(1)
    expect(lista[0].nAlumnos).toBe(2)
    expect(await listarAsignacionesDeCurso(curso.id, otro.id)).toEqual([])
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — FAIL.

- [ ] **Step 3: Implementar `web/lib/queries/resultados.ts`**

```ts
import { and, count, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { asignaciones, cursos, entregas, inscripciones, usuarios } from '@/lib/db/schema'
import type { ContenidoAsignacion } from '@/lib/tareas/contenido'

export interface AsignacionResumen {
  id: number
  titulo: string
  fechaLimite: Date | null
  nEntregas: number
  nAlumnos: number
  createdAt: Date
}

/** Asignaciones de un curso del profesor, con avance. Vacío si es ajeno. */
export async function listarAsignacionesDeCurso(
  cursoId: number,
  userId: number,
): Promise<AsignacionResumen[]> {
  const [curso] = await db.select({ id: cursos.id }).from(cursos)
    .where(and(eq(cursos.id, cursoId), eq(cursos.userId, userId))).limit(1)
  if (!curso) return []

  const [filas, [alumnos], porAsig] = await Promise.all([
    db.select().from(asignaciones).where(eq(asignaciones.cursoId, cursoId))
      .orderBy(desc(asignaciones.createdAt), desc(asignaciones.id)),
    db.select({ n: count() }).from(inscripciones)
      .where(eq(inscripciones.cursoId, cursoId)),
    db.select({ asignacionId: entregas.asignacionId, n: count() }).from(entregas)
      .innerJoin(asignaciones, eq(entregas.asignacionId, asignaciones.id))
      .where(eq(asignaciones.cursoId, cursoId))
      .groupBy(entregas.asignacionId),
  ])
  const nEntregas = new Map(porAsig.map((e) => [e.asignacionId, Number(e.n)]))
  return filas.map((a) => ({
    id: a.id,
    titulo: a.titulo,
    fechaLimite: a.fechaLimite,
    nEntregas: nEntregas.get(a.id) ?? 0,
    nAlumnos: Number(alumnos.n),
    createdAt: a.createdAt,
  }))
}

export interface FilaResultado {
  estudianteId: number
  nombre: string
  entrega: {
    respuestas: Record<string, string>
    puntaje: number
    total: number
    enviadoEl: Date
  } | null
}

export interface Resultados {
  id: number
  titulo: string
  fechaLimite: Date | null
  cursoId: number
  cursoNombre: string
  contenido: ContenidoAsignacion
  filas: FilaResultado[]
}

/** Resultados de una asignación con guard de propiedad del curso. */
export async function cargarResultados(
  asignacionId: number,
  userId: number,
): Promise<Resultados | null> {
  if (!Number.isFinite(asignacionId)) return null
  const [asig] = await db
    .select({
      id: asignaciones.id,
      titulo: asignaciones.titulo,
      fechaLimite: asignaciones.fechaLimite,
      contenido: asignaciones.contenido,
      cursoId: cursos.id,
      cursoNombre: cursos.nombre,
    })
    .from(asignaciones)
    .innerJoin(cursos, eq(asignaciones.cursoId, cursos.id))
    .where(and(eq(asignaciones.id, asignacionId), eq(cursos.userId, userId)))
    .limit(1)
  if (!asig) return null

  const [alumnos, filasEntregas] = await Promise.all([
    db.select({ id: usuarios.id, nombre: usuarios.nombre })
      .from(inscripciones)
      .innerJoin(usuarios, eq(inscripciones.estudianteId, usuarios.id))
      .where(eq(inscripciones.cursoId, asig.cursoId))
      .orderBy(usuarios.nombre),
    db.select().from(entregas).where(eq(entregas.asignacionId, asignacionId)),
  ])
  const porEstudiante = new Map(filasEntregas.map((e) => [e.estudianteId, e]))

  return {
    ...asig,
    filas: alumnos.map((a) => {
      const e = porEstudiante.get(a.id)
      return {
        estudianteId: a.id,
        nombre: a.nombre,
        entrega: e
          ? { respuestas: e.respuestas, puntaje: e.puntaje, total: e.total, enviadoEl: e.enviadoEl }
          : null,
      }
    }),
  }
}
```

- [ ] **Step 4: Correr tests, typecheck, commit**

```bash
DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm test tests/integration/resultados.test.ts  # PASS
pnpm exec tsc --noEmit
git add lib/queries/resultados.ts tests/integration/resultados.test.ts
git commit -m "feat(tareas): queries de resultados por asignación para el profesor"
```

---

### Task 8: Registro de estudiante con código (`/unirse`)

**Files:**
- Create: `web/lib/actions/registro-estudiante.ts`
- Create: `web/app/(auth)/unirse/page.tsx`
- Create: `web/app/(auth)/unirse/[codigo]/page.tsx`
- Create: `web/components/estudiante/formulario-unirse.tsx`

**Interfaces:**
- Consumes: `auth` de `@/lib/auth` (better-auth server API), `inscribirConCodigo`-equivalente interno, tabla `cursos`/`usuarios`.
- Produces: `registrarEstudianteConCodigo(input: { codigo: string; nombre: string; email: string; password: string }): Promise<{ ok: true } | { error: string }>` — valida código, crea la cuenta vía `auth.api.signUpEmail` (deja cookie de sesión), estampa `role: 'student'` e inscribe. También `nombreCursoPorCodigo(codigo: string): Promise<string | null>` para el copy de la página.

**Nota de diseño:** la parte inscribir ya está testeada (Task 4); el wrapper de signup se cubre con el e2e de la Task 12 — better-auth con cookies reales no se mockea bien en vitest.

- [ ] **Step 1: Implementar `web/lib/actions/registro-estudiante.ts`**

```ts
'use server'

import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
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
 * better-auth (deja la sesión iniciada vía Set-Cookie), estampa role 'student'
 * y crea la inscripción. Los estudiantes SOLO nacen por este flujo.
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
    const res = await auth.api.signUpEmail({
      body: { name: nombre, email, password },
      headers: await headers(),
    })
    const userId = Number(res.user.id)
    await db.update(usuarios).set({ role: 'student' }).where(eq(usuarios.id, userId))
    await db.insert(inscripciones)
      .values({ cursoId: curso.id, estudianteId: userId })
      .onConflictDoNothing()
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/exist/i.test(msg)) {
      return { error: 'Ya existe una cuenta con ese correo. Inicia sesión y usa el código desde tu portal.' }
    }
    return { error: 'No se pudo crear la cuenta. Intenta de nuevo.' }
  }
}
```

Nota: `auth.api.signUpEmail` con `headers` NO setea cookies por sí solo en una server action; si al probar manualmente la sesión no queda iniciada, envolver la llamada con `returnHeaders: true` y re-emitirlas, o más simple: tras el `ok`, el cliente redirige a `/login?unido=1` para que el estudiante inicie sesión. Decisión al implementar; el flujo de respaldo (login manual tras registro) es aceptable en v1.

- [ ] **Step 2: Página `/unirse/[codigo]` y formulario**

`web/app/(auth)/unirse/[codigo]/page.tsx`:

```tsx
import { nombreCursoPorCodigo } from '@/lib/actions/registro-estudiante'
import { FormularioUnirse } from '@/components/estudiante/formulario-unirse'

export const dynamic = 'force-dynamic'

export default async function UnirseConCodigoPage({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = await params
  const nombreCurso = await nombreCursoPorCodigo(codigo)
  return <FormularioUnirse codigo={codigo} nombreCurso={nombreCurso} />
}
```

`web/app/(auth)/unirse/page.tsx` (sin código en la URL):

```tsx
import { FormularioUnirse } from '@/components/estudiante/formulario-unirse'

export default function UnirsePage() {
  return <FormularioUnirse codigo="" nombreCurso={null} />
}
```

`web/components/estudiante/formulario-unirse.tsx` — client component. Sigue el estilo visual de las páginas de `(auth)` existentes (mirar `app/(auth)/registro/` antes de escribirlo y calcar estructura de Card/inputs/botón). Comportamiento:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { registrarEstudianteConCodigo } from '@/lib/actions/registro-estudiante'

export function FormularioUnirse({
  codigo,
  nombreCurso,
}: {
  codigo: string
  nombreCurso: string | null
}) {
  const router = useRouter()
  const [form, setForm] = useState({ codigo, nombre: '', email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPendiente(true)
    const res = await registrarEstudianteConCodigo(form)
    setPendiente(false)
    if ('error' in res) return setError(res.error)
    router.push('/tareas')
    router.refresh()
  }

  // Render: título "Únete a tu curso" + (nombreCurso ? `Te estás uniendo a «${nombreCurso}»` :
  // input de código editable), inputs nombre/email/contraseña, error en rojo,
  // botón "Crear cuenta y unirme" (disabled={pendiente}), y link a /login
  // "¿Ya tienes cuenta? Inicia sesión". Usar los mismos componentes ui/ que
  // el formulario de /registro.
  // ... (calcar markup de app/(auth)/registro al implementar)
}
```

Si el código de la URL no existe (`nombreCurso === null` con `codigo` no vacío), mostrar aviso "El código no es válido; pídele a tu profesor el link correcto" en vez del formulario.

- [ ] **Step 3: Verificación manual + commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
# Manual: pnpm dev → visitar /unirse y /unirse/CODIGO-falso; crear un curso vía
# psql o la UI de la Task 9 y probar el registro completo.
git add lib/actions/registro-estudiante.ts app/\(auth\)/unirse components/estudiante/formulario-unirse.tsx
git commit -m "feat(estudiante): registro con código de curso en /unirse"
```

---

### Task 9: Gates de rol (layouts y login)

**Files:**
- Modify: `web/app/(app)/layout.tsx` (redirect student)
- Create: `web/app/(estudiante)/layout.tsx`
- Modify: página/handler post-login (buscar dónde redirige el login: `grep -rn "dashboard" web/app/\(auth\)/login web/components` y ajustar según rol)
- Modify: `web/lib/actions/import.ts` y la action de `/generar` (buscar: `grep -rln "generar" web/lib/actions web/app/api`) — check de rol

**Interfaces:**
- Consumes: `requireActor` (`lib/authz.ts:70`).
- Produces: helper `requireEstudiante(): Promise<Actor>` en `lib/authz.ts` (redirige a `/login` sin sesión, a `/dashboard` si no es student); los layouts usan `requireActor`/`requireEstudiante`.

- [ ] **Step 1: Helper en `web/lib/authz.ts`**

```ts
/**
 * Exige un estudiante: redirige a /login sin sesión y a /dashboard si la sesión
 * es de profesor/admin (los mundos (app) y (estudiante) no se mezclan).
 */
export async function requireEstudiante(): Promise<Actor> {
  const actor = await requireActor()
  if (actor.role !== 'student') redirect('/dashboard')
  return actor
}
```

- [ ] **Step 2: Redirect en el layout de `(app)`**

En `web/app/(app)/layout.tsx`, tras `const actor = await requireActor()` (línea 21):

```ts
import { redirect } from 'next/navigation'
// ...
const actor = await requireActor()
// Los estudiantes tienen su propio portal: nunca ven el shell de profesor.
if (actor.role === 'student') redirect('/tareas')
```

- [ ] **Step 3: Layout de `(estudiante)`**

`web/app/(estudiante)/layout.tsx`:

```tsx
import Link from 'next/link'
import { requireEstudiante } from '@/lib/authz'
import { CerrarSesion } from '@/components/estudiante/cerrar-sesion'

export const dynamic = 'force-dynamic'

export default async function EstudianteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const actor = await requireEstudiante()
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <Link href="/tareas" className="font-heading text-lg font-bold text-foreground">
          📚 EduBox
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{actor.nombre}</span>
          <CerrarSesion />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}
```

`web/components/estudiante/cerrar-sesion.tsx` — client component: botón "Cerrar sesión" que llama `signOut()` de `@/lib/auth-client` y `router.push('/login')` (calcar el botón de logout existente: `grep -rn "signOut" web/components`).

- [ ] **Step 4: Redirect post-login según rol**

Localizar el destino post-login (`grep -rn "'/dashboard'" web/app web/components | grep -i login`). Donde el login redirige fijo a `/dashboard`, cambiar a: consultar el rol y mandar a `/tareas` si es student. Si el redirect es client-side sin rol a mano, la solución simple es dejar que aterrice en `/dashboard` y que el redirect del Step 2 lo rebote a `/tareas` (aceptable: doble hop, cero código nuevo). Documentar en el commit cuál se eligió.

- [ ] **Step 5: Check de rol en actions de IA**

En las actions de `/generar` e `/importar` (localizar los entry points: `grep -rln "generar_preguntas\|importar" web/lib/actions web/app/api | head`), justo tras obtener el actor:

```ts
if (actor.role === 'student') return { error: 'No autorizado.' }
```

(En route handlers de streaming, responder 403.)

- [ ] **Step 6: Verificar y commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm test  # la suite completa sigue verde
git add lib/authz.ts app/\(app\)/layout.tsx app/\(estudiante\)/layout.tsx components/estudiante/cerrar-sesion.tsx <archivos de login/IA tocados>
git commit -m "feat(auth): separación de mundos profesor/estudiante por rol"
```

---

### Task 10: Portal estudiante — `/tareas` y responder

**Files:**
- Create: `web/app/(estudiante)/tareas/page.tsx`
- Create: `web/app/(estudiante)/tareas/[id]/page.tsx`
- Create: `web/components/estudiante/responder-tarea.tsx`
- Create: `web/components/estudiante/resultado-tarea.tsx`
- Create: `web/components/estudiante/unirse-a-curso.tsx`

**Interfaces:**
- Consumes: `listarTareasDeEstudiante`, `cargarTareaParaEstudiante` (Task 6), `entregarTarea` (Task 6), `inscribirConCodigo` (Task 4), `aplanarPreguntas`/tipos (Task 2), `LatexText` de `@/components/preguntas/latex-text`, `imageUrl` de `@/lib/storage/blob`, `LETRAS` de `@/lib/validation/pregunta`.

- [ ] **Step 1: `/tareas` (server component)**

```tsx
import Link from 'next/link'
import { requireEstudiante } from '@/lib/authz'
import { listarTareasDeEstudiante } from '@/lib/queries/tareas'
import { cursosDeEstudiante } from '@/lib/queries/cursos'
import { Card, CardContent } from '@/components/ui/card'
import { UnirseACurso } from '@/components/estudiante/unirse-a-curso'

export const dynamic = 'force-dynamic'

const ETIQUETA_ESTADO = {
  pendiente: { texto: 'Pendiente', clase: 'text-primary' },
  entregada: { texto: 'Entregada', clase: 'text-muted-foreground' },
  vencida: { texto: 'Vencida', clase: 'text-destructive' },
} as const

export default async function TareasPage() {
  const actor = await requireEstudiante()
  const [tareas, cursos] = await Promise.all([
    listarTareasDeEstudiante(actor.userId),
    cursosDeEstudiante(actor.userId),
  ])
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Mis tareas</h1>
        <UnirseACurso />
      </div>
      {cursos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no estás en ningún curso. Pídele el código a tu profesor.
        </p>
      ) : null}
      {tareas.map((t) => {
        const e = ETIQUETA_ESTADO[t.estado]
        return (
          <Link key={t.id} href={`/tareas/${t.id}`}>
            <Card>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{t.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.curso}
                    {t.fechaLimite
                      ? ` · hasta el ${t.fechaLimite.toLocaleDateString('es-CL')}`
                      : ''}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-medium ${e.clase}`}>
                  {t.estado === 'entregada' && t.total ? `${t.puntaje}/${t.total}` : e.texto}
                </span>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
```

`unirse-a-curso.tsx`: client component con un botón "➕ Unirme a un curso" que abre un input de código y llama `inscribirConCodigo`; en ok, `router.refresh()`.

- [ ] **Step 2: `/tareas/[id]` (server component, bifurca responder/resultado)**

```tsx
import { notFound } from 'next/navigation'
import { requireEstudiante } from '@/lib/authz'
import { cargarTareaParaEstudiante } from '@/lib/queries/tareas'
import { ResponderTarea } from '@/components/estudiante/responder-tarea'
import { ResultadoTarea } from '@/components/estudiante/resultado-tarea'

export const dynamic = 'force-dynamic'

export default async function TareaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const actor = await requireEstudiante()
  const { id } = await params
  const tarea = await cargarTareaParaEstudiante(Number(id), actor.userId)
  if (!tarea) notFound()

  if (tarea.entregada) return <ResultadoTarea tarea={tarea} />

  const vencida = tarea.fechaLimite ? tarea.fechaLimite < new Date() : false
  if (vencida) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <p className="font-medium">El plazo de esta tarea ya venció.</p>
      </div>
    )
  }
  return <ResponderTarea tarea={tarea} />
}
```

- [ ] **Step 3: `responder-tarea.tsx` (client)**

Estructura (usar `LatexText` para enunciados, `imageUrl` para claves de imagen; recorrer `tarea.contenido.textos` mostrando `titulo`+`contenido` y sus preguntas, luego `tarea.contenido.preguntas`; el índice global sigue el orden de `aplanarPreguntas` — mantener un contador incremental al renderizar):

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { entregarTarea } from '@/lib/actions/entregas'
import { LatexText } from '@/components/preguntas/latex-text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LETRAS } from '@/lib/validation/pregunta'
import type { TareaEstudiante } from '@/lib/queries/tareas'
import type { PreguntaEstudiante } from '@/lib/tareas/contenido'

export function ResponderTarea({
  tarea,
}: {
  tarea: Extract<TareaEstudiante, { entregada: false }>
}) {
  const router = useRouter()
  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState(false)

  // Lista aplanada con el MISMO orden que el servidor (textos primero).
  const preguntas = useMemo(() => {
    const deTextos = tarea.contenido.textos.flatMap((t) => t.preguntas)
    return [...deTextos, ...tarea.contenido.preguntas]
  }, [tarea])

  async function onEnviar() {
    if (!confirm('¿Enviar tus respuestas? No podrás cambiarlas después.')) return
    setPendiente(true)
    setError(null)
    const res = await entregarTarea(tarea.id, respuestas)
    setPendiente(false)
    if ('error' in res) return setError(res.error)
    router.refresh()
  }

  function PreguntaItem({ p, i }: { p: PreguntaEstudiante; i: number }) {
    const esSeleccion = p.tipo === 'seleccion_multiple'
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <p className="text-sm font-medium">
            {i + 1}. <LatexText text={p.enunciado} />
          </p>
          {esSeleccion ? (
            <div className="flex flex-col gap-1.5">
              {LETRAS.filter((l) => p[l]).map((l) => (
                <label key={l} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`p-${i}`}
                    checked={respuestas[String(i)] === l}
                    onChange={() =>
                      setRespuestas((r) => ({ ...r, [String(i)]: l }))
                    }
                    className="mt-1 accent-primary"
                  />
                  <span>
                    {l}) <LatexText text={p[l] ?? ''} />
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <textarea
              rows={4}
              value={respuestas[String(i)] ?? ''}
              onChange={(e) =>
                setRespuestas((r) => ({ ...r, [String(i)]: e.target.value }))
              }
              placeholder="Escribe tu respuesta…"
              className="rounded-md border border-border bg-background p-2 text-sm"
            />
          )}
        </CardContent>
      </Card>
    )
  }

  // Render: título, instrucciones, textos de comprensión (titulo + contenido en
  // un Card con LatexText) intercalados con sus preguntas usando el índice
  // global, luego las sueltas, el error si existe y el botón:
  //   <Button onClick={onEnviar} disabled={pendiente}>
  //     {pendiente ? 'Enviando…' : '📨 Enviar respuestas'}
  //   </Button>
  // Añadir beforeunload cuando hay respuestas sin enviar (useEffect estándar).
}
```

Además renderizar imágenes cuando `imagenPregunta`/`imagenA..E` existan (patrón de `tarjeta-pregunta.tsx`: `<img src={imageUrl(clave)} …>`; `imageUrl` viene de `@/lib/storage/blob` — si es server-only, pasar las URLs resueltas desde el server component).

- [ ] **Step 4: `resultado-tarea.tsx`**

Server-friendly (puede ser server component): recorre las preguntas aplanadas del contenido COMPLETO junto a `tarea.respuestas`:

- Cabecera: "Tu resultado: {puntaje}/{total}" (omitir si `total === 0`).
- Por pregunta de alternativas: la elegida vs `correcta` — borde verde si acertó, rojo si no; mostrar "Correcta: {letra}" y la `explicacion` si existe (en un bloque `bg-muted/30`).
- Por pregunta de desarrollo: el texto enviado + "La revisará tu profesor."

- [ ] **Step 5: Verificar y commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
# Manual con pnpm dev: flujo estudiante completo contra datos sembrados.
git add app/\(estudiante\)/tareas components/estudiante/
git commit -m "feat(estudiante): portal /tareas con responder y resultado"
```

---

### Task 11: UI profesor — Cursos, asignar y resultados

**Files:**
- Create: `web/app/(app)/cursos/page.tsx`
- Create: `web/app/(app)/cursos/[id]/page.tsx`
- Create: `web/app/(app)/cursos/[id]/tareas/[asigId]/page.tsx`
- Create: `web/components/cursos/nuevo-curso.tsx`
- Create: `web/components/cursos/copiar-codigo.tsx`
- Create: `web/components/cursos/quitar-alumno.tsx`
- Create: `web/components/cursos/eliminar-asignacion.tsx`
- Create: `web/components/cursos/asignar-a-curso.tsx`
- Modify: `web/components/shell/sidebar.tsx:44-47` (ítem "Cursos")
- Modify: la tarjeta/lista de `web/app/(app)/mis-pruebas/` (botón "Asignar a curso"; localizar el componente de tarjeta con `grep -rn "TarjetaPrueba\|mis-pruebas" web/components web/app/\(app\)/mis-pruebas`)

**Interfaces:**
- Consumes: `listarCursosPropios`, `cargarCursoPorId`, `cursosDeEstudiante` (Task 4); `listarAsignacionesDeCurso`, `cargarResultados` (Task 7); actions `crearCurso`, `quitarAlumno` (Task 4), `asignarPruebaACurso`, `eliminarAsignacion` (Task 5); `aplanarPreguntas` (Task 2); `requireActor`.

- [ ] **Step 1: Sidebar** — en el bloque de `web/components/shell/sidebar.tsx` donde están "Mis Pruebas"/"Banco Compartido" (líneas 44-47), añadir:

```ts
{ href: '/cursos', etiqueta: 'Mis Cursos', emoji: '🎓' },
```

- [ ] **Step 2: `/cursos`** — server component: `requireActor()` (los estudiantes ya rebotan en el layout), `listarCursosPropios(actor.userId)`, grid de Cards con nombre, "N alumnos · M tareas", link al detalle; `<NuevoCurso />` (client: input nombre + botón que llama `crearCurso` y `router.refresh()`; en ok navega a `/cursos/${id}`).

- [ ] **Step 3: `/cursos/[id]`** — server component: `cargarCursoPorId(Number(id), actor.userId)` (→ `notFound()` si null) + `listarAsignacionesDeCurso`. Secciones:
  - *Código de inscripción*: mostrar el link completo `${process.env.BETTER_AUTH_URL ?? ''}/unirse/${curso.joinCode}` con `<CopiarCodigo texto={link} />` (client: `navigator.clipboard.writeText` + estado "¡Copiado!").
  - *Alumnos*: lista nombre/email con `<QuitarAlumno cursoId estudianteId />` (client, `confirm()` antes de llamar la action).
  - *Tareas*: por asignación → link a resultados, "X/Y entregadas", fecha límite, `<EliminarAsignacion id />` (client, `confirm('Se borrarán también las entregas de los alumnos. ¿Eliminar?')`).

- [ ] **Step 4: `/cursos/[id]/tareas/[asigId]` (resultados)** — server component: `cargarResultados(Number(asigId), actor.userId)` (→ `notFound()` si null). Render:
  - Tabla: alumno · estado (entregada con `puntaje/total` y fecha, o "Pendiente").
  - Detalle expandible por alumno entregado (`<details>` HTML es suficiente en v1): recorrer `aplanarPreguntas(res.contenido)` con `respuestas[String(i)]` — alternativas marcadas ✓/✗ (comparar con `correcta` normalizada), desarrollo con el texto completo.

- [ ] **Step 5: Asignar desde Mis Pruebas** — en la tarjeta de prueba de `/mis-pruebas`, añadir `<AsignarACurso pruebaId />`: client component que carga los cursos vía prop (el server component de la página pasa `listarCursosPropios`), y muestra: select de curso, input `datetime-local` opcional para fecha límite, botón "📤 Asignar". Llama `asignarPruebaACurso({ pruebaId, cursoId, fechaLimite })`; en ok muestra "Asignada ✓" y `router.refresh()`. Si el profesor no tiene cursos, el botón lleva a `/cursos`.

- [ ] **Step 6: Verificar y commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
# Manual: crear curso → copiar link → asignar prueba → ver resultados vacíos.
git add app/\(app\)/cursos components/cursos/ components/shell/sidebar.tsx <tarjeta de mis-pruebas>
git commit -m "feat(cursos): UI de cursos, asignación desde Mis Pruebas y resultados"
```

---

### Task 12: E2E y cierre

**Files:**
- Create: `web/tests/e2e/tareas.spec.ts`
- Modify: `docs/superpowers/specs/2026-08-15-cursos-y-tareas-design.md` (marcar estado implementado)

**Interfaces:**
- Consumes: todo lo anterior; patrón de `web/tests/e2e/roles.spec.ts` (creación de usuarios/fixtures directo en BD + login por UI).

- [ ] **Step 1: E2E flujo feliz**

`web/tests/e2e/tareas.spec.ts` — siguiendo los helpers de `roles.spec.ts` (leerlo antes; reutilizar su forma de crear usuarios y loguear):

1. Semilla: profesor con 1 pregunta de alternativas + 1 prueba; curso creado por UI o BD.
2. Profesor: login → `/cursos` → copiar código (leerlo de la BD) → `/mis-pruebas` → asignar al curso.
3. Estudiante: visitar `/unirse/CODIGO` → registrarse → (login manual si el flujo de respaldo de Task 8 aplica) → `/tareas` → abrir la tarea → marcar la correcta → enviar → ver "1/1".
4. Profesor: abrir resultados → ver la fila del estudiante con 1/1.

- [ ] **Step 2: Suite completa + lint + build**

```bash
DATABASE_URL='postgres://jm@localhost:5432/mispreguntas_test' pnpm test   # todo verde
pnpm exec tsc --noEmit && pnpm lint
pnpm exec playwright test tests/e2e/tareas.spec.ts
pnpm build   # el build de Next debe pasar (CI solo hace build+smoke)
```

- [ ] **Step 3: Verificar el caveat de blobs**

`grep -n "delete" web/lib/actions/preguntas.ts` — si `eliminarPregunta` borra blobs de imágenes, añadir guard: no borrar blobs cuya clave aparezca en alguna `asignaciones.contenido` (query `LIKE` sobre el jsonb es aceptable). Si no borra blobs, no hay nada que hacer (documentarlo en el commit).

- [ ] **Step 4: Commit final**

```bash
git add tests/e2e/tareas.spec.ts docs/superpowers/specs/2026-08-15-cursos-y-tareas-design.md <cambios del step 3>
git commit -m "feat(tareas): e2e del flujo completo profesor-estudiante"
```

---

## Self-review del plan

- **Cobertura de la spec:** modelo de datos (T1-T2), snapshot congelado (T3, test de borrado en T5), cursos/código (T4), asignar (T5), estudiante ver/entregar con reglas de servidor (T6), resultados (T7), registro `/unirse` (T8), separación de mundos + IA (T9), portal UI (T10), UI profesor + sidebar (T11), e2e + caveat blobs (T12). Fuera de alcance respetado (sin notas, sin export, sin reintentos).
- **Sin placeholders:** los puntos "calcar markup de registro" y "localizar con grep" son instrucciones de descubrimiento concretas, no TODOs de diseño.
- **Consistencia de tipos:** `ContenidoAsignacion`/`PreguntaSnapshot`/`sinRespuestas`/`aplanarPreguntas`/`corregir` (T2) se usan con esos nombres exactos en T3, T5, T6, T7, T10, T11. Claves de respuestas = índice aplanado como string en T2/T6/T10/T11.
