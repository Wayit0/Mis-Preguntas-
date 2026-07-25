# Recorte de imágenes en la importación con IA — Diseño

**Fecha:** 2026-07-24 · **Estado:** aprobado por JM (brainstorming en sesión)

## Objetivo

Cuando un documento trae una imagen incrustada que contiene más contenido que
la figura relevante (caso real: un DOCX con un solo bitmap que abarcaba la
tabla **y** el texto de las preguntas), permitir que la imagen guardada sea
sólo la parte que corresponde. Dos piezas:

1. **La IA propone el recorte** al detectar las preguntas (server-side, sharp).
2. **El usuario puede recortar a mano** cualquier imagen en la fase de
   revisión (client-side, canvas), incluida la propuesta de la IA.

## Contexto

- Extracción en `web/lib/docparse/extract.ts`: DOCX vía mammoth (imágenes
  incrustadas → `ImagenExtraida[]` con marcadores `[IMAGEN_n]`), PDF vía
  XObjects. Las imágenes se redimensionan a lado máximo 1568 px **antes** de
  enviarse a la IA, así que la imagen que la IA ve es la misma que se recorta.
- Detección en `web/lib/ai/import.ts`: tool use (no structured outputs — hubo
  grammar timeouts en prod con schemas grandes; el schema debe mantenerse
  mínimo). Orquestación en `web/lib/import/analizar.ts`; validación Zod en
  `web/lib/validation/import.ts`.
- Revisión en `web/components/import/importar-documento.tsx`: cada imagen se
  muestra como `MiniaturaImagen` con botón «Quitar imagen». El cliente resuelve
  índices de imagen (`imagenPreguntaIndice`, `imagenesAlternativas` con formato
  compacto `"A:0,B:1"`) contra el arreglo `imagenes` del resultado.
- La extracción desde el archivo es fiel: si el bitmap del DOCX contiene
  tabla + preguntas, no existe una «tabla sola» que extraer. La mejora es
  recortar, no extraer distinto.

## Pieza 1: la IA propone el recorte

### Schema (`lib/validation/import.ts`)

- Nuevo campo opcional por pregunta: `imagenPreguntaRecorte` — string compacto
  `"x,y,ancho,alto"` con **porcentajes enteros 0–100** relativos al ancho/alto
  de la imagen asignada en `imagenPreguntaIndice`.
- String compacto (no objeto anidado) para mantener el schema mínimo.
- **Alcance:** sólo la imagen del enunciado. Las alternativas no ganan campo
  (extender la gramática de `imagenesAlternativas` la complicaría); su escape
  es el recorte manual.

### Prompt (`lib/ai/import.ts`)

Instrucción nueva: si la imagen asignada al enunciado contiene bastante más
contenido que la figura relevante (p. ej. incluye el texto de las preguntas o
de otras preguntas), indicar en `imagenPreguntaRecorte` la zona a conservar;
en caso contrario dejarlo en null.

### Post-proceso (`lib/import/analizar.ts`)

Tras la detección, para cada pregunta con recorte propuesto:

1. Parsear y validar la caja: 4 enteros, clampear a [0,100], exigir tamaño
   mínimo (ancho y alto ≥ 5 % y ≥ 32 px resultantes). Caja inválida o
   degenerada → se ignora en silencio (queda la imagen completa). Nunca falla
   la importación por un recorte malo.
2. Recortar con sharp (`extract`) el base64 de la imagen referenciada.
3. Agregar el recorte como imagen **nueva** al arreglo `imagenes` (índice
   nuevo) y apuntar `imagenPreguntaIndice` de esa pregunta al índice nuevo.
   La original se conserva en el arreglo — otras preguntas pueden
   referenciarla y el cliente la necesita para «Restaurar original».
4. El resultado incluye, por pregunta recortada, la referencia al índice de la
   imagen original (para que el cliente pueda restaurar/re-recortar sin
   degradación).

## Pieza 2: recorte manual en la revisión

### UI (`components/import/importar-documento.tsx`)

- `MiniaturaImagen` gana botón **«Recortar»** junto a «Quitar imagen», para la
  imagen del enunciado y las de alternativas.
- El botón abre un diálogo con la imagen y un rectángulo
  arrastrable/redimensionable. Dependencia nueva: **`react-image-crop`**
  (cero dependencias transitivas, maneja mouse/touch/teclado). Se descartó el
  overlay hecho a mano: el manejo de 8 handles + touch es código fiddly sin
  valor propio.
- Al confirmar: recorte con canvas (`drawImage` → `toDataURL` en el mediaType
  original) y se reemplaza el base64 de esa pregunta/alternativa.
- El recorte manual siempre parte **desde la imagen original**: el estado
  editable guarda, junto a cada `ImagenParaGuardar`, su original (la de antes
  de cualquier recorte, de IA o manual). Botón «Restaurar original» en el
  diálogo. Re-recortar no degrada.
- Primitivo `dialog.tsx` nuevo en `components/ui/` vía shadcn/base-ui (mismo
  patrón que `select.tsx`).

### Estado editable

`PreguntaEditable` suma por campo de imagen su original (p. ej.
`imagenPreguntaOriginal`), poblado al resolver índices en `aEditable`. Los
originales **no** se envían a `guardarPreguntasImportadas`.

## Flujo de datos y guardado

Sin cambios en `guardarPreguntasImportadas` ni en Blob Storage: el base64
(recortado o no) viaja y se sube igual que hoy.

## Errores

- Caja de IA inválida → imagen completa, sin error visible.
- Imagen no decodificable al recortar en servidor → se conserva la completa.
- Canvas bloqueado o imagen corrupta en cliente → el diálogo muestra error y
  no reemplaza nada.

## Pruebas

- **Vitest (integración, como las existentes):** parseo/clampeo de la caja de
  recorte; post-proceso de `analizar.ts` con caja válida (imagen nueva +
  índice reapuntado) y caja inválida (se ignora).
- **E2E:** el fixture `IMPORT_AI_FAKE` gana una variante con
  `imagenPreguntaRecorte` para cubrir el flujo completo; e2e del recorte
  manual sobre el diálogo (abrir, arrastrar, confirmar, restaurar).

## Fuera de alcance

- Auto-recorte de IA para imágenes de alternativas.
- Recorte de imágenes ya guardadas en el banco (editor de pregunta) — sólo la
  importación.
- Detección de regiones sin IA (heurísticas de bordes/blancos).
