# Reescritura de "Mis Preguntas" a Next.js + Postgres en Azure — Diseño

**Fecha:** 2026-06-27
**Estado:** Aprobado para pasar a plan de implementación
**Autor:** José Miguel Tobar (con Claude Code)

## 1. Contexto y objetivo

"Mis Preguntas" es un **banco de preguntas + generador de pruebas** para profesores
(currículum chileno). El MVP actual está hecho en **Streamlit** (`app.py`, ~1.444
líneas) con Postgres (vía SQLAlchemy/psycopg), desplegado en Render. El MVP ya
validó utilidad y uso real.

**Objetivo:** reescribir el producto en un stack web moderno (**Next.js + Postgres**),
**rediseñar** la interfaz según la lógica web actual, añadir **autenticación con
librería dedicada (better-auth)** con manejo de cookies, y **desplegar en Azure**
(nuevo Resource Group, Postgres gestionado y App Service), con **paridad total de
funcionalidades** en la primera entrega.

## 2. Decisiones tomadas (locked)

| Decisión | Elección |
|---|---|
| Alcance v1 | **Paridad total** con el MVP |
| Stack | **Next.js (App Router) + TypeScript**, todo en un servicio |
| ORM | **Drizzle ORM** sobre Postgres |
| Auth | **better-auth** (email/contraseña, cookies de sesión) |
| Migración de usuarios | **Migrar todo** con **login transparente** (verificador custom para hashes SHA-256 legacy, re-hash a scrypt al primer login) |
| Navegación | **Dashboard + nav persistente** (shell A: sidebar grafito + topbar); asignatura como **filtro/contexto** |
| Identidad visual | **Esmeralda & grafito** (diseño fresco propio) |
| PDF e IA | **Todo en TypeScript** (react-pdf, MathJax, SDK de Anthropic, parseo JS) |
| Cloud | **Azure**: nuevo Resource Group, Postgres Flexible Server, App Service (Linux/Node) |
| Almacenamiento de imágenes | **Azure Blob Storage** |
| Datos actuales | **Migrar de Render a Azure** |
| Región (default) | **East US 2** (alternativa: Brazil South para menor latencia a Chile) |
| Suscripción Azure | "Patrocinio de Microsoft Azure" (`0f5ca358-…`, tenant `disso.ai`) → usar SKUs económicos |

## 3. Stack técnico

- **Next.js (App Router) + React + TypeScript** — un solo servicio desplegable.
- **Tailwind CSS + shadcn/ui**, tematizado a Esmeralda & grafito.
- **Drizzle ORM** + driver `postgres-js`.
- **better-auth** (email/contraseña, cookies httpOnly, CSRF). Verificador de
  contraseña custom para hashes legacy.
- **PDF:** `@react-pdf/renderer`.
- **LaTeX:** `mathjax-full` (TeX→SVG) → PNG con `sharp`/`resvg` para incrustar en el PDF.
- **Parseo de documentos:** `pdfjs-dist`/`pdf-parse` (PDF), `mammoth` (DOCX);
  imágenes vía visión de Anthropic.
- **IA:** `@anthropic-ai/sdk`. Modelo: Sonnet vigente (el MVP usa `claude-sonnet-4-6`;
  se confirmará el id al implementar vía la guía de Claude API).
- **Validación:** Zod en todos los inputs y server actions.
- **Almacenamiento de archivos:** `@azure/storage-blob`.

## 4. Arquitectura y estructura

App nueva en subcarpeta **`web/`** del mismo repo (el Streamlit queda al lado durante
la transición y se retira después). Azure App Service apunta su root/deploy a `web/`.

```
web/
  app/
    (auth)/login, registro
    (app)/                  ← layout autenticado (sidebar grafito + topbar)
      dashboard
      preguntas/            (Mis Preguntas: lista, /nueva, /[id]/editar)
      compartido/           (Banco Compartido)
      textos/               (Mis Textos)
      prueba/               (Crear Prueba → PDF)
      colaboradores/
      importar/             (Import IA)
    api/auth/[...all]/      (handler better-auth)
    api/uploads/[...path]/  (sirve imágenes desde Blob, con control de acceso)
  lib/
    auth.ts                 (config better-auth + verificador legacy)
    db/                     (schema Drizzle + cliente)
    pdf/                    (builders react-pdf)
    latex/                  (render MathJax→PNG)
    ai/                     (import con Anthropic)
    docparse/               (extracción PDF/DOCX/imagen)
    storage/                (wrapper Azure Blob)
  components/  ui (shadcn) + dominio
  drizzle/     (migraciones)
  infra/       (Bicep)
```

- Lecturas vía **server components**; mutaciones vía **server actions** (con Zod).
- Cada feature es un **vertical aislado** (UI + acciones + queries) para construir
  y testear por separado.

## 5. Modelo de datos, auth y migración

### Esquema de dominio (se conserva)
Tablas existentes intactas: `usuarios`, `preguntas`, `textos`, `colaboraciones`.
Los `user_id` **enteros** no se tocan.

- `usuarios(id SERIAL, nombre, email UNIQUE, password_hash, created_at)`
- `preguntas(id, user_id, asignatura, materia, contenido, nivel, pregunta, "A".."E",
  correcta, explicacion, compartida, created_at, imagen_pregunta, "imagen_A".."imagen_E",
  tipo DEFAULT 'seleccion_multiple', texto_id)`
- `textos(id, user_id, asignatura, titulo, contenido, compartida, created_at)`
- `colaboraciones(from_user_id, to_user_id, PK(from,to))`

Valores de dominio: `tipo ∈ {seleccion_multiple, desarrollo_corto, desarrollo_largo}`;
`nivel ∈ {PAES, Plan Ministerial, Bachillerato Internacional, Otro/custom}`;
8 asignaturas (Física, Química, Biología, Matemáticas, Filosofía, Ciencias de la
Ciudadanía, Lenguaje, SAS).

### better-auth (IDs numéricos, mapeado a `usuarios`)
- Activar IDs numéricos (`useNumberId`) para mantener enteros y evitar recablear FKs.
- Mapear el modelo `user` de better-auth a la tabla **`usuarios`** (`nombre`→name,
  `created_at`→createdAt). Añadir por migración columnas requeridas
  (`emailVerified`, `updatedAt`, `image`).
- Crear tablas gestionadas por better-auth: `session`, `account`, `verification`.

### Login transparente (hashes legacy)
- El MVP usa `sha256` **sin sal**. Por cada usuario migrado se crea una fila
  `account` (provider `credential`) con `password = "legacy-sha256:<hash>"`.
- Verificador custom de better-auth: si `password` empieza con `legacy-sha256:`,
  compara `sha256(input)`; si coincide, **re-hashea a scrypt** y actualiza el registro.
  Si no, usa el verificador scrypt por defecto.

### Migración de datos (Render → Azure)
1. `pg_dump` del Postgres de **Render** → restauración en el Postgres de **Azure**,
   conservando IDs y reajustando secuencias.
2. Sobre Azure: aplicar migraciones Drizzle (columnas + tablas better-auth) y
   **backfill de `account`** con marcador legacy.
3. Script **idempotente**; se ejecuta una vez desde local con acceso temporal de
   firewall al Postgres de Azure.

> **Nota de honestidad técnica:** la API exacta de better-auth (mapeo de tabla,
> `useNumberId`, hooks `password.hash/verify`) se confirmará contra su versión
> vigente al implementar; el enfoque es sólido pero se ajustarán nombres si su API
> cambió.

## 6. Mapa de funcionalidades (paridad total)

| Sección | Detalle |
|---|---|
| **Auth** | registro, login, logout, cambiar contraseña; sesión por cookie httpOnly |
| **Asignaturas** | las 8 actuales, como filtro/contexto global en la topbar |
| **Mis Preguntas** | CRUD; tipos selección múltiple / desarrollo corto / largo; alternativas A–E; correcta; explicación; nivel; **imágenes** por enunciado y por alternativa; **LaTeX**; flag compartida; filtros materia/nivel/estado |
| **Banco Compartido** | preguntas que colaboradores comparten contigo, por asignatura |
| **Mis Textos** | textos de comprensión lectora + preguntas asociadas (`texto_id`) |
| **Crear Prueba** | seleccionar preguntas → **PDF**: header (colegio/profesor/logo), instrucciones, fórmulas (LaTeX), textos, preguntas numeradas con imágenes |
| **Colaboradores** | invitar/quitar colegas por email; ver "quién me invitó"; relación dirigida en `colaboraciones` |
| **Importar Documento** | subir PDF/DOCX/imagen → extraer texto → **detectar preguntas con Claude** → revisar y guardar en lote |

## 7. Almacenamiento de imágenes (Azure Blob)

- Subidas a un contenedor Blob (`uploads`) vía `@azure/storage-blob`; en BD se guarda
  el nombre/clave del blob (igual que hoy se guarda el filename).
- Se sirven mediante `api/uploads/[...path]` que valida sesión/propiedad y hace proxy
  del stream o devuelve una **SAS URL** de corta duración. No se exponen públicos crudos.

## 8. Infraestructura Azure (Bicep)

Nuevo Resource Group (ej. `rg-mispreguntas-prod`), todo en Bicep:

| Recurso | Notas |
|---|---|
| **Resource Group** | nuevo |
| **PostgreSQL Flexible Server** | SKU Burstable (ej. B1ms) + base `mispreguntas`; firewall/Private |
| **App Service Plan (Linux)** + **Web App (Node)** | SKU B1; corre `next build`/`start` |
| **Storage Account + contenedor Blob** | imágenes |
| **Key Vault** | secretos (DATABASE_URL, BETTER_AUTH_SECRET, ANTHROPIC_API_KEY, storage connection) |
| *(opcional)* **Application Insights** | logs/monitoring |

**Secretos vía Key Vault:** la Web App tiene **managed identity** (system-assigned)
con rol *Key Vault Secrets User*. Las app settings de secretos se definen como
**Key Vault references** (`@Microsoft.KeyVault(SecretUri=...)`); la app las lee como
`process.env.*` normal y Azure las resuelve en runtime. Ningún secreto en texto plano
en la config ni en el repo.

**App settings (env):** `DATABASE_URL`*, `BETTER_AUTH_SECRET`*, `BETTER_AUTH_URL`
(= URL de la Web App o dominio custom), `ANTHROPIC_API_KEY`*,
`AZURE_STORAGE_CONNECTION_STRING`*, `BLOB_CONTAINER`, `NODE_ENV=production`.
(*) = Key Vault reference.

### CI/CD y deploy
- **GitHub Actions** con OIDC (federated credentials) para build + deploy a App Service.
- Primer deploy manual posible con `az webapp deploy`.
- **Pre-requisito del usuario:** `az login` (ya hecho) y suscripción seleccionada.
  El aprovisionamiento usa el `az` autenticado en la sesión.

## 9. Testing

- **Unit (vitest):** render LaTeX→imagen, armado de PDF (smoke), parser de import
  con SDK mockeado, mapeo de migración, verificador de password legacy.
- **Integración:** Drizzle contra Postgres de prueba para CRUD + flujos de auth.
- **E2E (Playwright):** login (usuario migrado y nuevo), CRUD de pregunta con imagen,
  generar y descargar PDF, flujo de import (IA mockeada).
- Validación final con el agente **e2e-validation-runner** contra el deploy.

## 10. Implementación por fases (workflows)

Tras aprobar el plan, la construcción se orquesta con **workflows** (multi-agente),
con el usuario en el loop entre fases:

1. **Scaffold** — Next.js + Tailwind + shadcn + Drizzle + estructura `web/`.
2. **Datos + auth + migración** — schema Drizzle, better-auth, verificador legacy,
   script de migración Render→Azure.
3. **Verticales de features** (en paralelo) — Preguntas, Compartido, Textos,
   Colaboradores, Asignaturas/dashboard.
4. **PDF + IA** — generación de pruebas y import con Claude.
5. **Pulido de diseño** — aplicar identidad Esmeralda & grafito, responsive.
6. **Infra + deploy** — Bicep, provisión del RG, deploy de la app, migración de datos,
   validación E2E.

## 11. Riesgos y mitigaciones

- **better-auth + IDs numéricos/tabla existente:** confirmar API vigente; fallback =
  tablas better-auth propias + recablear FKs con `legacy_user_id`.
- **LaTeX→PDF:** MathJax→SVG→PNG puede requerir ajuste de fuentes; smoke test temprano.
- **PDF complejo (paridad reportlab):** validar header/numeración/imágenes con un PDF
  de referencia del MVP.
- **SKUs de patrocinio:** posibles límites de cuota/regiones; usar Burstable/B1 y
  verificar disponibilidad en la región elegida.

## 12. Fuera de alcance (v1)

- Recuperación de contraseña por email (no existe en el MVP; el login transparente la
  hace innecesaria para usuarios actuales).
- Roles/permisos más allá de la relación de colaboración existente.
- Migración del propio Streamlit (se retira tras validar la nueva app).
