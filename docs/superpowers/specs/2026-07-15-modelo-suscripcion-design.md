# Modelo de suscripción EduBox — Diseño

**Fecha:** 2026-07-15 · **Estado:** aprobado por JM (brainstorming en sesión)

## Objetivo

Monetizar EduBox desde ya con dos rieles: un plan **Pro individual** cobrado por
MercadoPago Suscripciones, y una **licencia Colegio** negociada y facturada fuera
de la app (activación manual desde el admin). Incluye el **módulo de
administración de suscripciones** en el panel admin global.

## Contexto

- App: Next.js 16 en `web/`, better-auth, Drizzle + Postgres, Azure App Service
  (prod https://edubox.cl, QA https://qa.edubox.cl).
- El único costo variable real es la **importación con IA** (tokens Anthropic),
  ya medida por usuario en la tabla `usos_ia` (`accion`, `costoMicroUsd`).
- Ya existen `colegios` (con `joinCode`/`dominio`) y roles
  `teacher`/`school_admin`/`global_admin` en `usuarios`.
- Stripe no está disponible para empresas chilenas; las opciones reales son
  MercadoPago, Transbank Oneclick, Flow y Fintoc. Se eligió **MercadoPago
  Suscripciones** por menor esfuerzo de integración y recurrencia nativa
  (planes, trial, reintentos, webhooks), sin costo fijo (comisión ~3,49% + IVA).

## Planes

| | Gratis | Pro | Colegio |
|---|---|---|---|
| Precio (CLP, IVA incl.) | $0 | **$3.490/mes** o **$35.880/año** (= $2.990/mes, ~14% dcto) | Negociado («conversemos»), factura |
| Funciones actuales (banco, pruebas PDF, textos, carpetas, banco del colegio) | ✔ todas | ✔ | ✔ |
| Importaciones con IA | **3/mes** | **100/mes** (fair use explícito) | 100/mes por profesor |
| Futuras funciones premium (formas A/B, exportar a Word) | — | ✔ cuando existan | ✔ |
| Trial | — | 15 días **con tarjeta** (cobro automático el día 16 si no cancela) | — |

Principios:

- El plan gratis **no pierde ninguna función existente**; solo se limita la
  importación con IA. Las funciones exclusivas de Pro serán **features nuevas**
  (formas A/B, export Word) — a nadie se le quita nada.
- **Usuarios existentes:** pasan todos a Gratis con sus límites + correo de
  anuncio invitando al trial. Sin grandfathering.
- **Un solo trial por usuario, de por vida.**

## Riel de pago por segmento

- **Pro individual → MercadoPago Suscripciones (preapproval):** 2 planes
  (mensual $3.490, anual $35.880) con `free_trial` de 15 días. MP guarda la
  tarjeta, cobra, reintenta fallos y notifica por webhook; EduBox solo
  sincroniza estado local.
- **Colegio → sin pasarela:** se negocia y factura fuera de la app; el admin
  global activa la licencia con fecha de vencimiento. Mientras esté vigente,
  **todos los profesores del colegio tienen entitlements Pro**.

## Modelo de datos

Tabla nueva **`suscripciones`**:

- `id` serial PK
- `userId` integer único, FK usuarios
- `origen` text: `'mercadopago' | 'cortesia'`
- `periodicidad` text: `'mensual' | 'anual'` (null para cortesía)
- `estado` text: `'trial' | 'activa' | 'morosa' | 'cancelada'`
- `mpPreapprovalId` text (null para cortesía)
- `trialTerminaEl` timestamp nullable
- `periodoHasta` timestamp — fin del período pagado/concedido
- `nota` text nullable (para cortesías: motivo)
- `createdAt` / `updatedAt`

Tabla nueva **`pagos_suscripcion`** (historial, alimentada por webhooks):

- `id` serial PK, `userId`, `suscripcionId`
- `mpPaymentId` text único
- `montoClp` integer, `estado` text (`approved`/`rejected`/…), `detalle` jsonb
- `createdAt`

`colegios` **+=** `licenciaHasta` timestamp nullable (null = sin licencia) y
`licenciaNota` text nullable (n° factura, contacto).

`usuarios` **+=** `trialUsadoEl` timestamp nullable (candado de un-trial-por-vida).

**Nada de columna `plan` en usuarios** — ser «Pro efectivo» se **deriva**:

```
esPro(user) =
  suscripción propia en (trial | activa | morosa dentro de gracia de 7 días)
  OR colegio del usuario con licenciaHasta > now()
```

La cuota de IA se mide **contando en `usos_ia`** las importaciones
(`accion = 'importar_documento'`) del mes calendario en America/Santiago. Cero
instrumentación nueva.

## Ciclo de vida y morosidad

- **Alta:** botón «Probar Pro 15 días» → checkout de MP (registra tarjeta) →
  `back_url` de retorno → webhook `preapproval` crea/actualiza la fila →
  `trial`; con el primer cobro aprobado pasa a `activa`.
- **Pago falla:** MP reintenta solo. Estado `morosa` con **7 días de gracia
  manteniendo Pro** (banner de aviso al usuario). Sin regularizar → los
  entitlements vuelven a Gratis. **Nunca se borra ni bloquea contenido**; solo
  vuelven los límites.
- **Cancelación (usuario):** desde `/cuenta`, vía API de MP; conserva Pro hasta
  `periodoHasta`.
- **Licencia colegio por vencer:** aviso al `school_admin` 30 días antes; al
  vencer, sus profesores pasan a Gratis.
- **Suscripción propia + colegio licenciado:** conviven; los entitlements son
  un OR (no se fuerza cancelar).

## UI

- **`/precios`** pública con los 3 planes, enlazada desde el landing (nav y
  footer) y desde los upsell.
- **`/cuenta` → sección «Plan»:** estado actual, suscribirse (mensual/anual),
  cancelar, cambiar periodicidad.
- **Contador de importaciones restantes** en el flujo de importar, con upsell
  al agotarse («Te quedaste sin importaciones este mes — Pro tiene 100/mes»).

## Módulo de administración (admin global, tab «Suscripciones»)

1. **Lista y métricas:** todas las suscripciones con estado, periodicidad,
   origen y vencimiento; tarjetas resumen (activas, en trial, morosas, ingreso
   del mes estimado).
2. **Pro de cortesía:** conceder Pro a un usuario sin cobro, con fecha de
   vencimiento y nota (pilotos, compensaciones). Fila `origen='cortesia'`.
3. **Licencias de colegio:** activar/extender/cortar `licenciaHasta` de un
   colegio, con nota (n° factura). Es la pieza que opera el riel B2B.
4. **Cancelar suscripción de un usuario:** llama a la API de MP (reclamos,
   fraude), con confirmación; el usuario conserva Pro hasta fin de período.
5. **Historial de pagos por usuario:** cobros registrados en
   `pagos_suscripcion` (fecha, monto, resultado) para responder reclamos sin
   entrar a MercadoPago.

## Integración MercadoPago (resumen técnico)

- Crear 2 **planes preapproval** (mensual/anual) con `free_trial` 15 días.
  Credenciales (`MP_ACCESS_TOKEN`, ids de plan) en Key Vault + app settings,
  siguiendo el patrón de secretos opcionales del Bicep.
- **Webhook** `POST /api/webhooks/mercadopago`: eventos de `preapproval`
  (estado de la suscripción) y `authorized_payment`/`payment` (cobros →
  `pagos_suscripcion`). Validar firma del webhook. Idempotente por
  `mpPaymentId`/`mpPreapprovalId`.
- El estado local es un **cache del estado en MP**; ante duda, reconsultar la
  API de MP (job liviano o al cargar /cuenta).

## Errores y bordes

- Webhook caído/perdido → reconciliación al consultar MP cuando el usuario
  entra a `/cuenta` (o desde el admin).
- Usuario borra su cuenta con suscripción activa → cancelar en MP primero.
- Cambio mensual⇄anual → MP no migra planes: se cancela el preapproval actual y
  se crea uno nuevo sin trial (el candado `trialUsadoEl` lo impide).
- Doble suscripción (reintento de checkout) → `userId` único en `suscripciones`
  + verificación antes de crear el preapproval.

## Testing

- Integración (vitest, Postgres local): derivación de entitlements (`esPro`),
  cuota de importaciones por mes calendario, transiciones de estado por
  webhook simulado (idempotencia incluida), cortesía y licencia colegio
  (vigente/vencida), candado de trial único.
- Manual: checkout completo en el **sandbox de MercadoPago** (tarjetas de
  prueba) en QA antes de prod.

## Fuera de alcance

- Precio B2B definido (se negocia caso a caso).
- Formas A/B y exportación a Word (features futuras; se diseñan aparte).
- Emisión automática de boletas SII (al inicio, manual con el reporte del
  admin; automatizar con SimpleAPI/OpenFactura después).
- Migración a Transbank/Fintoc (solo si el volumen justifica el punto de
  comisión).
- Prorrateos y cupones de descuento.
