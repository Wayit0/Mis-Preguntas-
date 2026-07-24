# Recorte de imágenes en la importación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando una imagen incrustada trae más contenido que la figura relevante, la IA propone un recorte (aplicado server-side con sharp) y el usuario puede recortar a mano cualquier imagen en la revisión (client-side con canvas), siempre desde la original.

**Architecture:** El schema de detección gana un campo compacto `imagenPreguntaRecorte` (`"x,y,ancho,alto"` en % enteros). Un módulo nuevo `lib/import/recorte.ts` valida la caja y recorta con sharp tras `detectarPreguntas`, agregando el recorte como imagen NUEVA al arreglo (la original se conserva y la pregunta guarda `imagenPreguntaOriginalIndice`). En la revisión, cada miniatura gana un botón «Recortar» que abre un diálogo (`react-image-crop` + canvas); el estado editable guarda la imagen original por campo para «Restaurar original» y re-recortar sin degradación.

**Tech Stack:** Next.js 16 (`web/`), zod v4 (`zod/v4`), sharp, `@base-ui/react` (primitivo dialog nuevo), `react-image-crop` (dependencia nueva), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-24-recorte-imagenes-importacion-design.md`

## Global Constraints

- Todo el código, comentarios y copy en español (es-CL), siguiendo el estilo del código existente (comentarios que explican el porqué).
- El schema que viaja al modelo debe mantenerse MÍNIMO: strings compactos, sin objetos anidados nuevos (historial de `400 "Schema is too complex."` y grammar timeouts — ver comentarios en `lib/validation/import.ts`).
- La detección usa **tool use**, no structured outputs (no cambiar).
- `lib/validation/import.ts` usa `import { z } from 'zod/v4'` (no `zod`).
- Un recorte inválido NUNCA hace fallar la importación: fallback silencioso a la imagen completa.
- Comandos se corren desde `web/` con pnpm. Tests unitarios: `pnpm vitest run tests/unit/<archivo>` (no requieren Postgres). Los e2e (`pnpm test:e2e`) requieren el entorno local completo.
- AGENTS.md del repo: leer la guía relevante en `node_modules/next/dist/docs/` antes de escribir código de la app; para el diálogo, revisar la API real en `node_modules/@base-ui/react/` (los nombres de partes/props pueden diferir del entrenamiento).
- Commits SIN footers de coautoría («Generated with…», «Co-Authored-By…»). Sí incluir el trailer `Claude-Session: https://claude.ai/code/session_013Jdiv4PDt26jugFCwQjmCJ`.
- Rama de trabajo: `devel` (no crear ramas nuevas salvo que el usuario lo pida).

## Estructura de archivos

- **Modificar** `web/lib/validation/import.ts` — campo `imagenPreguntaRecorte` en el schema, `CajaRecorte`, `parsearRecorte`, tipo `PreguntaAnalizada`.
- **Crear** `web/lib/import/recorte.ts` — `recortarImagen` (sharp) y `aplicarRecortesIA` (post-proceso). Server-only.
- **Modificar** `web/lib/ai/import.ts` — instrucción de recorte en `SISTEMA`, variante del `FIXTURE_FAKE`.
- **Modificar** `web/lib/import/analizar.ts` — llama `aplicarRecortesIA` tras la detección.
- **Crear** `web/components/ui/dialog.tsx` — primitivo dialog (base-ui, patrón de `select.tsx`).
- **Crear** `web/components/import/dialogo-recorte.tsx` — diálogo de recorte manual (react-image-crop + canvas).
- **Modificar** `web/components/import/importar-documento.tsx` — originales en `PreguntaEditable`, botón «Recortar», estado del diálogo.
- **Crear** `web/tests/unit/recorte.test.ts` — tests de `parsearRecorte`, `recortarImagen`, `aplicarRecortesIA`.
- **Modificar** `web/tests/unit/ai-import.test.ts` — el campo nuevo sobrevive la criba.
- **Modificar** `web/tests/e2e/importar.spec.ts` — e2e del recorte manual.

---

### Task 1: Schema + `parsearRecorte` (validación pura)

**Files:**
- Modify: `web/lib/validation/import.ts`
- Test: `web/tests/unit/recorte.test.ts` (nuevo)

**Interfaces:**
- Produces: `interface CajaRecorte { x: number; y: number; ancho: number; alto: number }`; `parsearRecorte(valor: string | null | undefined): CajaRecorte | null`; campo `imagenPreguntaRecorte?: string | null` en `preguntaDetectadaSchema`/`PreguntaDetectada`; `type PreguntaAnalizada = PreguntaDetectada & { imagenPreguntaOriginalIndice?: number | null }`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `web/tests/unit/recorte.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

import { parsearRecorte } from '@/lib/validation/import'

describe('validation/import parsearRecorte', () => {
  it('parsea una caja válida', () => {
    expect(parsearRecorte('25,25,50,50')).toEqual({ x: 25, y: 25, ancho: 50, alto: 50 })
  })

  it('tolera espacios alrededor de cada número', () => {
    expect(parsearRecorte(' 10 , 20 , 30 , 40 ')).toEqual({ x: 10, y: 20, ancho: 30, alto: 40 })
  })

  it('null, undefined y string vacío → null', () => {
    expect(parsearRecorte(null)).toBeNull()
    expect(parsearRecorte(undefined)).toBeNull()
    expect(parsearRecorte('')).toBeNull()
  })

  it('formatos malformados → null', () => {
    expect(parsearRecorte('a,b,c,d')).toBeNull()
    expect(parsearRecorte('10,20,30')).toBeNull()
    expect(parsearRecorte('10,20,30,40,50')).toBeNull()
    expect(parsearRecorte('10.5,20,30,40')).toBeNull()
    expect(parsearRecorte('-5,20,30,40')).toBeNull()
  })

  it('clampea ancho/alto que se salen de la imagen', () => {
    expect(parsearRecorte('90,90,50,50')).toEqual({ x: 90, y: 90, ancho: 10, alto: 10 })
  })

  it('caja degenerada (menos de 5% por lado tras el clamp) → null', () => {
    expect(parsearRecorte('98,0,50,50')).toBeNull()
    expect(parsearRecorte('0,0,100,3')).toBeNull()
  })

  it('origen fuera de la imagen → null', () => {
    expect(parsearRecorte('100,0,10,10')).toBeNull()
    expect(parsearRecorte('0,120,10,10')).toBeNull()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run (desde `web/`): `pnpm vitest run tests/unit/recorte.test.ts`
Expected: FAIL — `parsearRecorte` no existe (error de import).

- [ ] **Step 3: Implementar en `web/lib/validation/import.ts`**

3a. Agregar al final del bloque de schemas de detección (después de `imagenesAlternativasSchema`, antes de `preguntaDetectadaSchema`):

```ts
/**
 * Recorte propuesto por la IA para la imagen del enunciado, como STRING
 * compacto "x,y,ancho,alto" en PORCENTAJES ENTEROS (0-100) del ancho/alto de
 * la imagen, con origen arriba a la izquierda. Null si la imagen ya muestra
 * sólo la figura relevante. String plano por la misma razón que
 * `imagenesAlternativas`: mantener mínima la complejidad del schema que viaja
 * al modelo. El parseo/validación real lo hace {@link parsearRecorte}; una
 * caja malformada simplemente se ignora (queda la imagen completa).
 */
const recortePropuestoSchema = z.string().nullish()

/** Lado mínimo del recorte, en % de la imagen: filtra cajas degeneradas. */
const LADO_MINIMO_RECORTE_PCT = 5

/** Una caja de recorte ya parseada y validada (porcentajes enteros 0-100). */
export interface CajaRecorte {
  x: number
  y: number
  ancho: number
  alto: number
}

/**
 * Parsea el string compacto "x,y,ancho,alto" a una caja válida, o null si está
 * malformado o es degenerado. Clampea ancho/alto para que la caja quede dentro
 * de la imagen; exige al menos 5% por lado tras el clamp. Nunca lanza: un
 * recorte inválido se ignora en silencio (la imagen queda completa).
 */
export function parsearRecorte(
  valor: string | null | undefined,
): CajaRecorte | null {
  if (!valor) return null
  const partes = valor.split(',').map((p) => p.trim())
  if (partes.length !== 4) return null
  if (!partes.every((p) => /^\d+$/.test(p))) return null
  const [x, y, ancho, alto] = partes.map(Number)
  if (x >= 100 || y >= 100) return null
  const anchoClamp = Math.min(ancho, 100 - x)
  const altoClamp = Math.min(alto, 100 - y)
  if (anchoClamp < LADO_MINIMO_RECORTE_PCT || altoClamp < LADO_MINIMO_RECORTE_PCT) {
    return null
  }
  return { x, y, ancho: anchoClamp, alto: altoClamp }
}
```

3b. En `preguntaDetectadaSchema`, agregar el campo después de `imagenesAlternativas`:

```ts
  // Recorte propuesto para la imagen del enunciado ("x,y,ancho,alto" en % de
  // la imagen), cuando ésta contiene más contenido que la figura relevante.
  imagenPreguntaRecorte: recortePropuestoSchema,
```

3c. Después de `export type PreguntaDetectada = …`, agregar:

```ts
/**
 * Una pregunta ya post-procesada por `aplicarRecortesIA` (lib/import/recorte):
 * si el recorte propuesto se aplicó, `imagenPreguntaIndice` apunta a la imagen
 * recortada (agregada al final del arreglo) e `imagenPreguntaOriginalIndice`
 * conserva el índice de la original, para que el cliente pueda restaurar o
 * re-recortar sin degradación.
 */
export type PreguntaAnalizada = PreguntaDetectada & {
  imagenPreguntaOriginalIndice?: number | null
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm vitest run tests/unit/recorte.test.ts`
Expected: PASS (8 tests).

También: `pnpm vitest run tests/unit/ai-import.test.ts` — sigue PASS (el campo nuevo es opcional; nada existente se rompe).

- [ ] **Step 5: Commit**

```bash
git add lib/validation/import.ts tests/unit/recorte.test.ts
git commit -m "feat(importar): campo imagenPreguntaRecorte + parsearRecorte

Claude-Session: https://claude.ai/code/session_013Jdiv4PDt26jugFCwQjmCJ"
```

---

### Task 2: Módulo de recorte server-side (`lib/import/recorte.ts`)

**Files:**
- Create: `web/lib/import/recorte.ts`
- Test: `web/tests/unit/recorte.test.ts` (ampliar)

**Interfaces:**
- Consumes: `CajaRecorte`, `parsearRecorte`, `PreguntaDetectada`, `PreguntaAnalizada` (Task 1); `ImagenExtraida`, `MediaTypeImagen` de `@/lib/docparse/extract`.
- Produces: `recortarImagen(imagen: ImagenExtraida, caja: CajaRecorte): Promise<{ mediaType: MediaTypeImagen; base64: string } | null>`; `aplicarRecortesIA(preguntas: PreguntaDetectada[], imagenes: ImagenExtraida[]): Promise<{ preguntas: PreguntaAnalizada[]; imagenes: ImagenExtraida[] }>`; `LADO_MINIMO_RECORTE_PX = 32`.

- [ ] **Step 1: Ampliar los tests (fallan)**

Agregar a `web/tests/unit/recorte.test.ts`:

```ts
import sharp from 'sharp'

import { recortarImagen, aplicarRecortesIA } from '@/lib/import/recorte'
import type { ImagenExtraida } from '@/lib/docparse/extract'
import type { PreguntaDetectada } from '@/lib/validation/import'

/** PNG sólido generado con sharp, como `ImagenExtraida` en el índice dado. */
async function imagenDePrueba(
  width = 100,
  height = 100,
  indice = 0,
): Promise<ImagenExtraida> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer()
  return { indice, mediaType: 'image/png', base64: buf.toString('base64') }
}

/** Pregunta detectada mínima válida, con overrides. */
function pregunta(extra: Partial<PreguntaDetectada> = {}): PreguntaDetectada {
  return {
    pregunta: '¿Cuánto es 2 + 2?',
    tipo: 'seleccion_multiple',
    ...extra,
  } as PreguntaDetectada
}

describe('import/recorte recortarImagen', () => {
  it('recorta un 50% de una imagen de 100x100 → 50x50 del mismo formato', async () => {
    const img = await imagenDePrueba(100, 100)
    const res = await recortarImagen(img, { x: 0, y: 0, ancho: 50, alto: 50 })
    expect(res).not.toBeNull()
    expect(res!.mediaType).toBe('image/png')
    const meta = await sharp(Buffer.from(res!.base64, 'base64')).metadata()
    expect(meta.width).toBe(50)
    expect(meta.height).toBe(50)
  })

  it('resultado menor a 32px por lado → null (imagen queda completa)', async () => {
    const img = await imagenDePrueba(100, 100)
    expect(await recortarImagen(img, { x: 0, y: 0, ancho: 10, alto: 50 })).toBeNull()
    expect(await recortarImagen(img, { x: 0, y: 0, ancho: 50, alto: 10 })).toBeNull()
  })

  it('bytes no decodificables → null, sin lanzar', async () => {
    const rota: ImagenExtraida = {
      indice: 0,
      mediaType: 'image/png',
      base64: Buffer.from('no soy una imagen').toString('base64'),
    }
    expect(await recortarImagen(rota, { x: 0, y: 0, ancho: 50, alto: 50 })).toBeNull()
  })
})

describe('import/recorte aplicarRecortesIA', () => {
  it('con recorte válido: agrega imagen nueva y reapunta el índice', async () => {
    const original = await imagenDePrueba(200, 200)
    const { preguntas, imagenes } = await aplicarRecortesIA(
      [pregunta({ imagenPreguntaIndice: 0, imagenPreguntaRecorte: '0,0,50,50' })],
      [original],
    )
    expect(imagenes).toHaveLength(2)
    expect(imagenes[1].indice).toBe(1)
    expect(preguntas[0].imagenPreguntaIndice).toBe(1)
    expect(preguntas[0].imagenPreguntaOriginalIndice).toBe(0)
    // La original se conserva intacta en su índice.
    expect(imagenes[0]).toEqual(original)
    const meta = await sharp(Buffer.from(imagenes[1].base64, 'base64')).metadata()
    expect(meta.width).toBe(100)
    expect(meta.height).toBe(100)
  })

  it('recorte malformado o degenerado → pregunta e imágenes intactas', async () => {
    const original = await imagenDePrueba(200, 200)
    const { preguntas, imagenes } = await aplicarRecortesIA(
      [pregunta({ imagenPreguntaIndice: 0, imagenPreguntaRecorte: 'basura' })],
      [original],
    )
    expect(imagenes).toHaveLength(1)
    expect(preguntas[0].imagenPreguntaIndice).toBe(0)
    expect(preguntas[0].imagenPreguntaOriginalIndice).toBeUndefined()
  })

  it('recorte sin imagen resoluble (índice fuera de rango o null) → intacta', async () => {
    const original = await imagenDePrueba(200, 200)
    const casos = [
      pregunta({ imagenPreguntaIndice: 7, imagenPreguntaRecorte: '0,0,50,50' }),
      pregunta({ imagenPreguntaIndice: null, imagenPreguntaRecorte: '0,0,50,50' }),
      pregunta({ imagenPreguntaIndice: 0 }),
    ]
    const { preguntas, imagenes } = await aplicarRecortesIA(casos, [original])
    expect(imagenes).toHaveLength(1)
    expect(preguntas[0].imagenPreguntaOriginalIndice).toBeUndefined()
    expect(preguntas[1].imagenPreguntaOriginalIndice).toBeUndefined()
    expect(preguntas[2].imagenPreguntaIndice).toBe(0)
  })

  it('dos preguntas pueden recortar la MISMA imagen con cajas distintas', async () => {
    const original = await imagenDePrueba(200, 200)
    const { preguntas, imagenes } = await aplicarRecortesIA(
      [
        pregunta({ imagenPreguntaIndice: 0, imagenPreguntaRecorte: '0,0,50,50' }),
        pregunta({ imagenPreguntaIndice: 0, imagenPreguntaRecorte: '50,50,50,50' }),
      ],
      [original],
    )
    expect(imagenes).toHaveLength(3)
    expect(preguntas[0].imagenPreguntaIndice).toBe(1)
    expect(preguntas[1].imagenPreguntaIndice).toBe(2)
    expect(preguntas[1].imagenPreguntaOriginalIndice).toBe(0)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm vitest run tests/unit/recorte.test.ts`
Expected: FAIL — `@/lib/import/recorte` no existe.

- [ ] **Step 3: Crear `web/lib/import/recorte.ts`**

```ts
import sharp from 'sharp'

import type { ImagenExtraida, MediaTypeImagen } from '@/lib/docparse/extract'
import {
  parsearRecorte,
  type CajaRecorte,
  type PreguntaAnalizada,
  type PreguntaDetectada,
} from '@/lib/validation/import'

// ---------------------------------------------------------------------------
// Recorte server-side de las imágenes del documento (propuesto por la IA).
//
// Cuando una imagen incrustada contiene más contenido que la figura relevante
// (caso real: un bitmap pegado en Word que abarca la tabla Y el texto de las
// preguntas), la IA propone en `imagenPreguntaRecorte` la zona a conservar.
// Aquí se valida la caja y se recorta con sharp DESPUÉS de la detección: el
// recorte entra como imagen NUEVA al arreglo (la original se conserva, otras
// preguntas pueden referenciarla y el cliente la necesita para «Restaurar
// original») y la pregunta pasa a apuntar al índice nuevo.
//
// Regla de oro: un recorte malo NUNCA hace fallar la importación — cualquier
// problema (caja inválida, imagen no decodificable, resultado diminuto) deja
// la imagen completa en silencio.
// ---------------------------------------------------------------------------

/**
 * Lado mínimo (px) del resultado de un recorte: por debajo de esto la caja de
 * la IA es casi seguro un error (o la imagen era diminuta) y se ignora.
 */
export const LADO_MINIMO_RECORTE_PX = 32

/**
 * Recorta una imagen según la caja (porcentajes 0-100 ya validados por
 * `parsearRecorte`). Devuelve null si la imagen no se puede decodificar o el
 * resultado quedaría menor a `LADO_MINIMO_RECORTE_PX` por lado. Conserva JPEG
 * como JPEG (fotos: PNG las inflaría); el resto sale como PNG.
 */
export async function recortarImagen(
  imagen: ImagenExtraida,
  caja: CajaRecorte,
): Promise<{ mediaType: MediaTypeImagen; base64: string } | null> {
  const buffer = Buffer.from(imagen.base64, 'base64')

  let anchoPx: number | undefined
  let altoPx: number | undefined
  try {
    const meta = await sharp(buffer).metadata()
    anchoPx = meta.width
    altoPx = meta.height
  } catch {
    return null
  }
  if (!anchoPx || !altoPx) return null

  const left = Math.round((caja.x / 100) * anchoPx)
  const top = Math.round((caja.y / 100) * altoPx)
  const width = Math.min(Math.round((caja.ancho / 100) * anchoPx), anchoPx - left)
  const height = Math.min(Math.round((caja.alto / 100) * altoPx), altoPx - top)
  if (width < LADO_MINIMO_RECORTE_PX || height < LADO_MINIMO_RECORTE_PX) {
    return null
  }

  try {
    const recorte = sharp(buffer).extract({ left, top, width, height })
    const esJpeg = imagen.mediaType === 'image/jpeg'
    const salida = await (esJpeg ? recorte.jpeg() : recorte.png()).toBuffer()
    return {
      mediaType: esJpeg ? 'image/jpeg' : 'image/png',
      base64: salida.toString('base64'),
    }
  } catch {
    return null
  }
}

/**
 * Post-proceso de la detección: aplica los recortes propuestos por la IA a la
 * imagen del enunciado de cada pregunta. Devuelve las preguntas (reapuntadas a
 * la imagen recortada cuando aplicó, con `imagenPreguntaOriginalIndice` al
 * índice de la original) y el arreglo de imágenes ampliado con los recortes.
 * Nunca lanza por una pregunta problemática: esa pregunta queda intacta.
 */
export async function aplicarRecortesIA(
  preguntas: PreguntaDetectada[],
  imagenes: ImagenExtraida[],
): Promise<{ preguntas: PreguntaAnalizada[]; imagenes: ImagenExtraida[] }> {
  const todas = [...imagenes]
  const resultado: PreguntaAnalizada[] = []

  for (const p of preguntas) {
    const caja = parsearRecorte(p.imagenPreguntaRecorte)
    const indice = p.imagenPreguntaIndice
    const original =
      caja != null && indice != null && Number.isInteger(indice) && indice >= 0
        ? todas[indice]
        : undefined
    if (!caja || !original) {
      resultado.push(p)
      continue
    }

    let recorte: { mediaType: MediaTypeImagen; base64: string } | null = null
    try {
      recorte = await recortarImagen(original, caja)
    } catch {
      recorte = null
    }
    if (!recorte) {
      resultado.push(p)
      continue
    }

    const nueva: ImagenExtraida = { indice: todas.length, ...recorte }
    todas.push(nueva)
    resultado.push({
      ...p,
      imagenPreguntaIndice: nueva.indice,
      imagenPreguntaOriginalIndice: original.indice,
    })
  }

  return { preguntas: resultado, imagenes: todas }
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm vitest run tests/unit/recorte.test.ts`
Expected: PASS (todos los tests de Task 1 + Task 2).

- [ ] **Step 5: Commit**

```bash
git add lib/import/recorte.ts tests/unit/recorte.test.ts
git commit -m "feat(importar): recorte server-side de imágenes propuesto por la IA

Claude-Session: https://claude.ai/code/session_013Jdiv4PDt26jugFCwQjmCJ"
```

---

### Task 3: Cablear el post-proceso + prompt + fixture

**Files:**
- Modify: `web/lib/import/analizar.ts`
- Modify: `web/lib/ai/import.ts`
- Test: `web/tests/unit/ai-import.test.ts` (ampliar)

**Interfaces:**
- Consumes: `aplicarRecortesIA` (Task 2), `PreguntaAnalizada` (Task 1).
- Produces: `ResultadoAnalisis` con `preguntas: PreguntaAnalizada[]` (el cliente lo consume en Task 5).

- [ ] **Step 1: Test que falla (el campo sobrevive la criba)**

En `web/tests/unit/ai-import.test.ts`, dentro del `describe` existente, agregar:

```ts
  it('conserva imagenPreguntaRecorte tras la criba', async () => {
    mocks.create.mockResolvedValue(
      respuestaTool([
        {
          pregunta: '¿Qué muestra la tabla?',
          tipo: 'seleccion_multiple',
          imagenPreguntaIndice: 0,
          imagenPreguntaRecorte: '0,10,100,45',
        },
      ]),
    )
    const { preguntas } = await detectarPreguntas(bloques, 'Física')
    expect(preguntas).toHaveLength(1)
    expect(preguntas[0].imagenPreguntaRecorte).toBe('0,10,100,45')
  })
```

- [ ] **Step 2: Verificar**

Run: `pnpm vitest run tests/unit/ai-import.test.ts`
Expected: ya PASS (el campo entró al schema en Task 1 y la criba no lo descarta). Si FALLA, la criba está botando el campo: revisar que `imagenPreguntaRecorte` esté en `preguntaDetectadaSchema` (los objetos zod no-estrictos conservan sólo las claves declaradas). Este test queda como red de seguridad.

- [ ] **Step 3: Prompt — en `web/lib/ai/import.ts`**

3a. En la constante `SISTEMA`, después del párrafo que termina en `…si no aplica ninguna imagen, deja el campo en null.` y antes del párrafo `Si una ALTERNATIVA es una imagen…`, insertar:

```
Si la imagen asignada al enunciado contiene bastante más contenido que la \
figura relevante (p. ej. además de la tabla o el diagrama se ve el texto de \
la pregunta, de las alternativas o de otras preguntas), indica en \
"imagenPreguntaRecorte" la zona a CONSERVAR como "x,y,ancho,alto" en \
PORCENTAJES ENTEROS (0-100) del ancho y alto de la imagen, con origen en la \
esquina superior izquierda. Ejemplo: "0,10,100,45" conserva una franja \
horizontal que parte al 10% de la altura. Si la imagen ya muestra sólo la \
figura relevante, deja "imagenPreguntaRecorte" en null.
```

3b. En `FIXTURE_FAKE`, en la primera pregunta (la que tiene `imagenPreguntaIndice: 0`), agregar:

```ts
    // Recorte propuesto: con el fixture real (imagen de 4×4 px de
    // sample-con-imagen.docx) el resultado quedaría bajo el mínimo de 32 px y
    // el post-proceso lo ignora en silencio — exactamente el camino de
    // fallback que queremos cubierto en e2e sin romper nada.
    imagenPreguntaRecorte: '25,25,50,50',
```

- [ ] **Step 4: Cablear en `web/lib/import/analizar.ts`**

4a. Imports: agregar `import { aplicarRecortesIA } from '@/lib/import/recorte'` y sumar `PreguntaAnalizada` al import de `@/lib/validation/import` (puede reemplazar a `PreguntaDetectada` si queda sin uso).

4b. Cambiar el tipo del resultado:

```ts
/** Resultado del análisis de un documento. */
export type ResultadoAnalisis =
  | { ok: true; preguntas: PreguntaAnalizada[]; imagenes: ImagenExtraida[] }
  | { ok: false; error: string; sinCupo?: boolean }
```

4c. En `analizarArchivo`, dentro del `try` de la detección, reemplazar desde `const { preguntas, uso } = …` hasta el `return { ok: true, … }` por:

```ts
    const { preguntas, uso } = await detectarPreguntas(documento.bloques, asignatura)

    // Post-proceso: aplica los recortes que la IA haya propuesto para las
    // imágenes de enunciado (ver lib/import/recorte). Nunca lanza.
    const recortado = await aplicarRecortesIA(preguntas, documento.imagenes)
    const recortes = recortado.preguntas.filter(
      (p) => p.imagenPreguntaOriginalIndice != null,
    ).length

    const duracionSegundos = Number(((Date.now() - inicio) / 1000).toFixed(1))
    console.log(
      `[importar] fin OK: preguntas=${preguntas.length} ` +
        `recortesIA=${recortes} en ${duracionSegundos}s`,
    )
    if (uso) {
      await registrarUsoIa(userId, 'importar_documento', uso, {
        archivo: archivo.name,
        tipo: archivo.type,
        tamanoKb: Math.round(archivo.size / 1024),
        asignatura,
        imagenes: documento.imagenes.length,
        preguntas: preguntas.length,
        recortesIA: recortes,
        duracionSegundos,
      })
    }
    return { ok: true, preguntas: recortado.preguntas, imagenes: recortado.imagenes }
```

- [ ] **Step 5: Verificar tipos y tests**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores (si `importar-documento.tsx` reclama por el tipo, anotar el error: se resuelve en Task 5; no debería, porque `PreguntaAnalizada` extiende `PreguntaDetectada`).

Run: `pnpm vitest run tests/unit/ai-import.test.ts tests/unit/recorte.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/import.ts lib/import/analizar.ts tests/unit/ai-import.test.ts
git commit -m "feat(importar): la IA propone recorte y el análisis lo aplica

Claude-Session: https://claude.ai/code/session_013Jdiv4PDt26jugFCwQjmCJ"
```

---

### Task 4: Primitivo `dialog.tsx` + dependencia `react-image-crop`

**Files:**
- Create: `web/components/ui/dialog.tsx`
- Modify: `web/package.json` (vía pnpm)

**Interfaces:**
- Produces: `Dialog` (root, prop `open` + `onOpenChange`), `DialogContent`, `DialogTitle` — consumidos por `dialogo-recorte.tsx` en Task 5.

- [ ] **Step 1: Instalar la dependencia**

Run (desde `web/`): `pnpm add react-image-crop`
Expected: agrega `react-image-crop` a dependencies (sin dependencias transitivas nuevas).

- [ ] **Step 2: Revisar la API real de base-ui**

Leer `node_modules/@base-ui/react/dialog` (o su `.d.ts`) para confirmar los nombres de las partes (`Root`, `Portal`, `Backdrop`, `Popup`, `Title`, `Close`) y de las props (`open`, `onOpenChange`, tipos `DialogPrimitive.Popup.Props`). Ajustar el código del paso 3 si difieren — el patrón a imitar es `components/ui/select.tsx`.

- [ ] **Step 3: Crear `web/components/ui/dialog.tsx`**

```tsx
"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogClose = DialogPrimitive.Close

/** Popup centrado con backdrop; el contenido decide su ancho vía className. */
function DialogContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogPrimitive.Popup
        data-slot="dialog-popup"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-auto rounded-lg border border-border bg-background p-4 shadow-lg outline-none",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base font-semibold text-foreground", className)}
      {...props}
    />
  )
}

export { Dialog, DialogClose, DialogContent, DialogTitle }
```

- [ ] **Step 4: Verificar**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml components/ui/dialog.tsx
git commit -m "feat(ui): primitivo dialog (base-ui) y dependencia react-image-crop

Claude-Session: https://claude.ai/code/session_013Jdiv4PDt26jugFCwQjmCJ"
```

---

### Task 5: Recorte manual en la revisión

**Files:**
- Create: `web/components/import/dialogo-recorte.tsx`
- Modify: `web/components/import/importar-documento.tsx`

**Interfaces:**
- Consumes: `Dialog`/`DialogContent`/`DialogTitle` (Task 4), `PreguntaAnalizada` (Task 1), `ImagenParaGuardar` (existente).
- Produces: `DialogoRecorte({ original, onAplicar, onRestaurar, onCerrar })` — `original: ImagenParaGuardar`, `onAplicar: (imagen: ImagenParaGuardar) => void`, `onRestaurar: () => void`, `onCerrar: () => void`.

- [ ] **Step 1: Crear `web/components/import/dialogo-recorte.tsx`**

```tsx
'use client'

import { useState } from 'react'
import ReactCrop, { type PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

import type { ImagenParaGuardar } from '@/lib/validation/import'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/* eslint-disable @next/next/no-img-element */

/** Selección inicial: casi toda la imagen, para partir ajustando bordes. */
const CROP_INICIAL: PercentCrop = { unit: '%', x: 5, y: 5, width: 90, height: 90 }

/**
 * Recorta la imagen original en el navegador con canvas, según la selección en
 * porcentajes. GIF/WebP salen como PNG (canvas no codifica GIF); JPEG se
 * conserva como JPEG para no inflar fotos. Devuelve null si la imagen no se
 * puede decodificar o la selección es degenerada.
 */
async function recortarConCanvas(
  original: ImagenParaGuardar,
  crop: PercentCrop,
): Promise<ImagenParaGuardar | null> {
  if (!crop.width || !crop.height || crop.width < 1 || crop.height < 1) return null

  const img = new Image()
  img.src = `data:${original.mediaType};base64,${original.base64}`
  try {
    await img.decode()
  } catch {
    return null
  }

  const sx = Math.round((crop.x / 100) * img.naturalWidth)
  const sy = Math.round((crop.y / 100) * img.naturalHeight)
  const sw = Math.max(1, Math.round((crop.width / 100) * img.naturalWidth))
  const sh = Math.max(1, Math.round((crop.height / 100) * img.naturalHeight))

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

  const mediaType = original.mediaType === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  const base64 = canvas.toDataURL(mediaType).split(',')[1]
  return base64 ? { base64, mediaType } : null
}

/**
 * Diálogo de recorte manual. Siempre recorta DESDE la imagen original (la de
 * antes de cualquier recorte, de IA o manual): re-recortar no degrada.
 */
export function DialogoRecorte({
  original,
  onAplicar,
  onRestaurar,
  onCerrar,
}: {
  original: ImagenParaGuardar
  onAplicar: (imagen: ImagenParaGuardar) => void
  onRestaurar: () => void
  onCerrar: () => void
}) {
  const [crop, setCrop] = useState<PercentCrop>(CROP_INICIAL)
  const [error, setError] = useState<string | null>(null)
  const [aplicando, setAplicando] = useState(false)

  async function aplicar() {
    setAplicando(true)
    setError(null)
    const recortada = await recortarConCanvas(original, crop)
    setAplicando(false)
    if (!recortada) {
      setError('No se pudo recortar la imagen. Ajusta la selección e inténtalo de nuevo.')
      return
    }
    onAplicar(recortada)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCerrar()
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogTitle>Recortar imagen</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Arrastra sobre la imagen para elegir la zona que quieres conservar.
        </p>
        <div className="flex justify-center">
          <ReactCrop crop={crop} onChange={(_, porcentual) => setCrop(porcentual)}>
            <img
              src={`data:${original.mediaType};base64,${original.base64}`}
              alt="Imagen a recortar"
              className="max-h-[60vh] max-w-full"
            />
          </ReactCrop>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onRestaurar}>
            Restaurar original
          </Button>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" onClick={aplicar} disabled={aplicando}>
            {aplicando ? 'Recortando…' : 'Aplicar recorte'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Modificar `web/components/import/importar-documento.tsx`**

2a. Imports: agregar `import { DialogoRecorte } from '@/components/import/dialogo-recorte'` y sumar `PreguntaAnalizada` al import de `@/lib/validation/import` (junto a los existentes).

2b. Ampliar `PreguntaEditable` — después de `imagenE`, agregar los originales (la imagen de ANTES de cualquier recorte, para restaurar y re-recortar sin degradación; no se envían al guardar):

```ts
  imagenPreguntaOriginal: ImagenParaGuardar | null
  imagenAOriginal: ImagenParaGuardar | null
  imagenBOriginal: ImagenParaGuardar | null
  imagenCOriginal: ImagenParaGuardar | null
  imagenDOriginal: ImagenParaGuardar | null
  imagenEOriginal: ImagenParaGuardar | null
```

2c. Debajo de `type CampoImagenAlternativa`, agregar:

```ts
/** Cualquier columna de imagen editable (enunciado o alternativa). */
type CampoImagen = 'imagenPregunta' | CampoImagenAlternativa
/** La columna que guarda la imagen original (pre-recorte) de un campo. */
type CampoImagenOriginal = `${CampoImagen}Original`
```

2d. En `aEditable`, cambiar la firma a `p: PreguntaAnalizada` y reemplazar el bloque final de imágenes del `return` por:

```ts
  const imagenPregunta = resolverImagen(p.imagenPreguntaIndice, imagenesDisponibles)
  const imagenA = resolverImagen(porLetra.get('A'), imagenesDisponibles)
  const imagenB = resolverImagen(porLetra.get('B'), imagenesDisponibles)
  const imagenC = resolverImagen(porLetra.get('C'), imagenesDisponibles)
  const imagenD = resolverImagen(porLetra.get('D'), imagenesDisponibles)
  const imagenE = resolverImagen(porLetra.get('E'), imagenesDisponibles)
  return {
    // … campos de texto igual que hoy …
    imagenPregunta,
    // Si el servidor aplicó un recorte de la IA, la original vive en otro
    // índice; si no, la original ES la imagen asignada.
    imagenPreguntaOriginal:
      resolverImagen(p.imagenPreguntaOriginalIndice, imagenesDisponibles) ??
      imagenPregunta,
    imagenA,
    imagenAOriginal: imagenA,
    imagenB,
    imagenBOriginal: imagenB,
    imagenC,
    imagenCOriginal: imagenC,
    imagenD,
    imagenDOriginal: imagenD,
    imagenE,
    imagenEOriginal: imagenE,
  }
```

(Los campos de texto — `id`, `incluir`, `pregunta`, `A`–`E`, `correcta`, `explicacion`, `materia`, `nivel`, `tipo` — quedan exactamente como están hoy.)

2e. `MiniaturaImagen`: agregar prop `onRecortar: () => void` y el botón junto a «Quitar imagen»:

```tsx
function MiniaturaImagen({
  imagen,
  alt,
  onQuitar,
  onRecortar,
}: {
  imagen: ImagenParaGuardar
  alt: string
  onQuitar: () => void
  onRecortar: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <img
        src={`data:${imagen.mediaType};base64,${imagen.base64}`}
        alt={alt}
        className="max-h-24 w-fit rounded-md border border-border object-contain"
      />
      <div className="flex flex-col gap-1 sm:flex-row">
        <Button type="button" variant="outline" size="sm" onClick={onRecortar}>
          Recortar
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onQuitar}>
          Quitar imagen
        </Button>
      </div>
    </div>
  )
}
```

2f. En `ImportarDocumento`, junto a los otros `useState`, agregar el estado del diálogo:

```ts
  // Imagen en recorte manual: qué pregunta y qué campo. El diálogo se monta
  // una sola vez (fuera del map de tarjetas) y recorta SIEMPRE desde la
  // imagen original guardada en el estado editable.
  const [recortando, setRecortando] = useState<{
    id: string
    campo: CampoImagen
  } | null>(null)
```

2g. En los dos usos de `MiniaturaImagen`, pasar `onRecortar`:

- Enunciado: `onRecortar={() => setRecortando({ id: p.id, campo: 'imagenPregunta' })}`
- Alternativa: `onRecortar={() => setRecortando({ id: p.id, campo: campoImagen })}`

2h. En la fase `revisar`, antes del `<div className="flex flex-col gap-4">` de las tarjetas (o después: cualquier lugar top-level del JSX), montar el diálogo:

```tsx
        {(() => {
          if (!recortando) return null
          const pregunta = preguntas.find((q) => q.id === recortando.id)
          if (!pregunta) return null
          const original =
            pregunta[`${recortando.campo}Original` as CampoImagenOriginal] ??
            pregunta[recortando.campo]
          if (!original) return null
          return (
            <DialogoRecorte
              original={original}
              onAplicar={(imagen) => {
                actualizar(recortando.id, { [recortando.campo]: imagen })
                setRecortando(null)
              }}
              onRestaurar={() => {
                actualizar(recortando.id, { [recortando.campo]: original })
                setRecortando(null)
              }}
              onCerrar={() => setRecortando(null)}
            />
          )
        })()}
```

2i. En `reiniciar()`, agregar `setRecortando(null)`.

(`onGuardar` no cambia: mapea campos explícitos, así que los `…Original` nunca viajan al servidor.)

- [ ] **Step 3: Verificar tipos, lint y arranque**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

Verificación manual (si hay entorno local): `pnpm dev`, importar un documento con imagen (o usar `IMPORT_AI_FAKE=1 pnpm dev` con `tests/fixtures/sample-con-imagen.docx`), abrir «Recortar», arrastrar, aplicar, restaurar.

- [ ] **Step 4: Commit**

```bash
git add components/import/dialogo-recorte.tsx components/import/importar-documento.tsx
git commit -m "feat(importar): recorte manual de imágenes en la revisión

Claude-Session: https://claude.ai/code/session_013Jdiv4PDt26jugFCwQjmCJ"
```

---

### Task 6: E2E del recorte manual

**Files:**
- Modify: `web/tests/e2e/importar.spec.ts`

**Interfaces:**
- Consumes: la UI de Task 5 (botón «Recortar», diálogo «Recortar imagen», botones «Aplicar recorte»/«Restaurar original») y el fixture con `imagenPreguntaRecorte` de Task 3.

- [ ] **Step 1: Agregar el test**

Al final de `web/tests/e2e/importar.spec.ts`:

```ts
test('importar: recortar imagen a mano en la revisión y restaurar', async ({
  page,
}) => {
  const sufijo = Date.now()
  const email = `importcrop${sufijo}@x.cl`
  const password = 'clave-segura-123'

  const docxConImagen = readFileSync(join(fixturesDir, 'sample-con-imagen.docx'))

  // 1. Registro y análisis del DOCX con imagen (IA mockeada). El fixture trae
  // además `imagenPreguntaRecorte`, pero con la imagen de 4×4 px el recorte
  // server-side queda bajo el mínimo y se ignora: la miniatura es la original.
  await page.goto('/registro')
  await page.locator('#nombre').fill(`ImportaCrop ${sufijo}`)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#password2').fill(password)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.goto('/importar?asignatura=F%C3%ADsica')
  await page.locator('input[name="archivo"]').setInputFiles({
    name: 'prueba-con-imagen.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: docxConImagen,
  })
  await page.getByRole('button', { name: 'Analizar documento' }).click()
  await expect(page.getByText('2 preguntas detectadas')).toBeVisible()

  const miniatura = page.getByRole('img', { name: /Imagen del enunciado 1/ })
  await expect(miniatura).toBeVisible()
  const srcOriginal = await miniatura.getAttribute('src')

  // 2. Abrir el diálogo de recorte y dibujar una selección arrastrando.
  await page.getByRole('button', { name: 'Recortar' }).first().click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByText('Recortar imagen')).toBeVisible()

  const imagenDialogo = dialogo.getByRole('img', { name: 'Imagen a recortar' })
  const caja = await imagenDialogo.boundingBox()
  if (!caja) throw new Error('la imagen del diálogo no tiene bounding box')
  await page.mouse.move(caja.x + caja.width * 0.15, caja.y + caja.height * 0.15)
  await page.mouse.down()
  await page.mouse.move(caja.x + caja.width * 0.7, caja.y + caja.height * 0.7, {
    steps: 5,
  })
  await page.mouse.up()

  // 3. Aplicar: la miniatura cambia (base64 distinto al original).
  await dialogo.getByRole('button', { name: 'Aplicar recorte' }).click()
  await expect(dialogo).not.toBeVisible()
  await expect
    .poll(async () => miniatura.getAttribute('src'))
    .not.toBe(srcOriginal)

  // 4. Restaurar: vuelve exactamente a la imagen original.
  await page.getByRole('button', { name: 'Recortar' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Restaurar original' }).click()
  await expect
    .poll(async () => miniatura.getAttribute('src'))
    .toBe(srcOriginal)
})
```

- [ ] **Step 2: Correr los e2e de importar**

Run: `pnpm test:e2e tests/e2e/importar.spec.ts`
Expected: PASS los 3 tests (los 2 existentes siguen verdes con el fixture modificado). Si el entorno local no permite e2e (falta Postgres/servidor), dejarlo anotado y correr al menos `pnpm exec tsc --noEmit && pnpm lint && pnpm vitest run tests/unit` — pero NO declarar la tarea verificada sin e2e o verificación manual en el navegador.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/importar.spec.ts
git commit -m "test(importar): e2e del recorte manual de imágenes

Claude-Session: https://claude.ai/code/session_013Jdiv4PDt26jugFCwQjmCJ"
```

---

## Verificación final

- [ ] `pnpm exec tsc --noEmit` — sin errores.
- [ ] `pnpm lint` — sin errores.
- [ ] `pnpm vitest run tests/unit` — todos verdes.
- [ ] `pnpm test:e2e tests/e2e/importar.spec.ts` — 3 tests verdes (o verificación manual en navegador documentada).
- [ ] Revisión manual del flujo completo con un documento real si hay clave de Anthropic local (opcional; el recorte de la IA sólo se aprecia con documentos reales).
