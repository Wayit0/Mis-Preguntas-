# Borradores de importación retomables — Diseño

**Fecha:** 2026-07-24 · **Estado:** aprobado por JM (brainstorming en sesión)

## Objetivo

Hoy el resultado del análisis de «Importar Documento» vive sólo en el estado
del navegador: si el profesor cierra la página a mitad de la revisión, pierde
el trabajo y re-analizar gasta otra importación de la cuota. Se agrega una
sección de **importaciones en curso** en `/importar`: cada análisis se guarda
automáticamente como **borrador**, las ediciones de la revisión se
auto-guardan, y el borrador se puede retomar después exactamente donde quedó,
sin gastar cuota de IA.

## Contexto

- Flujo actual: `/api/importar` (streaming ndjson) → `ResultadoAnalisis`
  (`preguntas: PreguntaAnalizada[]` + `imagenes: ImagenExtraida[]`) → el
  cliente (`components/import/importar-documento.tsx`) lo convierte a
  `PreguntaEditable[]` (`aEditable`) y entra en fase `revisar`; al confirmar
  llama `guardarPreguntasImportadas`.
- Nada persiste hoy salvo el registro de uso en `usos_ia` (metadatos).
- Las imágenes van en base64 (lado máximo 1568 px); un análisis con varias
  imágenes pesa unos pocos MB.

## Modelo de datos

Nueva tabla `borradores_importacion` (Drizzle + migración):

| Columna | Tipo | Notas |
|---|---|---|
| `id` | serial PK | |
| `userId` | int, not null | Dueño. Índice. Convención del repo: sin FK. |
| `asignatura` | text, not null | La elegida al analizar. |
| `nombreArchivo` | text, not null | Para mostrar en la lista. |
| `resultado` | jsonb, not null | El `ResultadoAnalisis` ok crudo: `{ preguntas, imagenes }`. Inmutable. |
| `edicion` | jsonb, nullable | Estado editable del cliente (`PreguntaEditable[]`), sobrescrito en cada auto-guardado. Null si nunca se editó. |
| `createdAt` / `updatedAt` | timestamp | `updatedAt` se toca en cada auto-guardado. |

Con el límite de 10 borradores por usuario, filas de pocos MB en jsonb son
manejables (TOAST); no se usa Blob Storage (coordinar subida/borrado/retención
para esto es YAGNI) ni localStorage (no caben las imágenes y no cruza
dispositivos).

## Ciclo de vida

1. **Crear (server-side).** Al terminar un análisis exitoso, el route handler
   `/api/importar` inserta el borrador (tiene `preguntas` e `imagenes` en
   memoria) y agrega `borradorId` a la línea final del stream
   (`{"resultado": {..., borradorId}}`). Cero round-trips extra. Si el insert
   falla, el análisis igual se devuelve (el borrador es best-effort, nunca
   rompe la importación).
2. **Auto-guardar (cliente).** En fase `revisar`, tras ~3 s sin cambios
   (debounce), el cliente envía su `PreguntaEditable[]` completo a la server
   action `actualizarBorradorImportacion(id, edicion)`. Fallo silencioso: se
   reintenta en el próximo cambio, nunca interrumpe la revisión. Los campos
   `…Original` de las imágenes viajan también (para que re-recortar siga
   funcionando al retomar).
3. **Listar.** En `/importar` (fase subir), bajo el formulario, tarjeta
   «Importaciones en curso»: nombre de archivo, asignatura, fecha relativa,
   nº de preguntas, botones **Retomar** y **Descartar**. Server-side
   (la página ya es server component); oculta si no hay borradores.
4. **Retomar.** Server action `obtenerBorradorImportacion(id)` → el cliente
   entra a fase `revisar` con `edicion` si existe, o derivando de `resultado`
   con `aEditable` si nunca se editó. Fija la asignatura del borrador. No
   llama a la IA ni gasta cuota.
5. **Completar.** Si `guardarPreguntasImportadas` termina ok y la revisión
   venía de un borrador (o creó uno), se elimina el borrador. La lista es de
   trabajo EN CURSO, no un historial (el historial ya está en `usos_ia` y las
   preguntas en el banco).
6. **Descartar.** Botón con confirmación → server action que elimina.

## Retención

- Máximo **10 borradores por usuario**: al insertar, si ya hay 10, se elimina
  el más antiguo por `updatedAt`.
- **Limpieza perezosa a 30 días**: al crear o listar, se eliminan los
  borradores del usuario con `updatedAt` > 30 días. Sin cron ni
  infraestructura nueva.

## Seguridad y validación

- Todas las actions exigen sesión y validan que el borrador pertenezca al
  `userId` de la sesión (no encontrado ≡ ajeno: mismo error).
- `edicion` se valida con zod reutilizando los schemas de imagen existentes
  (`ImagenParaGuardar`); tamaño total del payload acotado (~25 MB) para
  evitar abuso.
- El `resultado` lo escribe sólo el servidor; el cliente nunca lo modifica.

## Errores

- Insert del borrador falla → el análisis se entrega igual, sin borrador
  (log del error; el profesor no ve diferencia).
- Auto-guardado falla → silencioso, reintento en el próximo cambio.
- Retomar un borrador eliminado/ajeno → mensaje claro y vuelta a fase subir.

## Pruebas

- **Integración (vitest, Postgres local):** crear/listar/actualizar/
  retomar/eliminar; límite de 10 (se va el más antiguo); limpieza de 30 días;
  aislamiento entre usuarios; borrado al completar el guardado.
- **E2E (IA mockeada):** analizar → editar un enunciado → esperar el
  auto-guardado → recargar → «Retomar» → la edición sigue → guardar → el
  borrador desaparece de la lista.

## Fuera de alcance

- Historial permanente de importaciones completadas.
- Sincronización en vivo entre pestañas (última escritura gana).
- Compartir borradores entre colaboradores.
