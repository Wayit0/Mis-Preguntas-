# MercadoPago (suscripciones EduBox Pro) — configuración y operación

Guía para dejar operativo el cobro recurrente de **EduBox Pro** (planes mensual
$3.490 / anual $35.880, trial de 15 días con tarjeta) vía **MercadoPago
Suscripciones** (`preapproval`), en **producción** y **QA**.

El código ya está desplegado (`lib/suscripciones/mercadopago.ts`, `lib/suscripciones/webhook.ts`,
`app/api/webhooks/mercadopago/route.ts`, página `/precios`, sección Plan en
`/cuenta`, tab **Admin → Suscripciones**). Lo que falta es **credenciales**, que
sólo se pueden crear desde el panel de desarrolladores de MercadoPago. Sin
`MP_ACCESS_TOKEN` los botones de suscripción muestran "muy pronto"
(`mpHabilitado()` en `lib/suscripciones/mercadopago.ts` devuelve `false`) y el
webhook ignora eventos.

> **`MP_WEBHOOK_SECRET` es OBLIGATORIO en producción.** La ruta
> `app/api/webhooks/mercadopago/route.ts` falla cerrado: si `NODE_ENV ===
> 'production'` (el valor por defecto en Azure App Service Linux/Node, y el
> que fija `infra/modules/appservice.bicep` para la Web App) y no hay
> `MP_WEBHOOK_SECRET` configurado, cada notificación de MercadoPago se
> rechaza con **503** en vez de procesarse sin validar firma (fix en el
> commit `0c829b0`, a raíz de un hallazgo de la revisión de Task 6). Esto
> aplica a **cualquier** App Service en modo producción, incluida QA — no
> sólo a `edubox.cl`. No despliegues sin este secreto configurado.

## Lanzamiento abierto: hoy nadie paga (`LANZAMIENTO_GRATIS`)

Mientras EduBox esté en **versión de lanzamiento**, las funciones Pro están
liberadas para todas las cuentas y el cobro está apagado. Lo gobierna un solo
interruptor, `lib/suscripciones/lanzamiento.ts`, **encendido por defecto**:

- `planEfectivo()` devuelve `plan: 'pro'` con `origen: 'lanzamiento'` a quien no
  tenga suscripción, cortesía ni licencia de colegio → **100 importaciones IA al
  mes para todos**. Quien sí tiene una fuente real de Pro conserva su origen.
- `iniciarSuscripcion()` rechaza el checkout ("durante el lanzamiento EduBox Pro
  es gratis"), y `/cuenta` no muestra los botones de pago.
- `/precios` (render dinámico) y la portada anuncian que Pro es gratis durante
  el lanzamiento, con el precio futuro a la vista.

**Para empezar a cobrar** (después de cargar las credenciales de MP y validar el
sandbox en QA):

```bash
az webapp config appsettings set -g rg-mispreguntas-prod \
  -n app-mispreguntas-ecupwarmwaeb6 \
  --settings LANZAMIENTO_GRATIS=false
```

Sólo el valor exacto `false` lo apaga (vacío o ausente = encendido). Al
apagarlo, las cuentas sin suscripción vuelven al plan Gratis y sus 3
importaciones al mes: **avisar por correo antes**, junto con el anuncio del
checklist de más abajo.

## Recursos Azure (reales)

| Entorno | Web App | URL pública |
|---|---|---|
| Prod | `app-mispreguntas-ecupwarmwaeb6` | `https://edubox.cl` |
| QA | `app-mispreguntas-qa` | `https://qa.edubox.cl` |

- Resource group: `rg-mispreguntas-prod` (ambas apps) · Key Vault: `kv-mispreguntas-ecupwarm` (compartido).

---

## Paso 1 — Credenciales en el panel de desarrolladores de MercadoPago

1. [MercadoPago Developers](https://www.mercadopago.cl/developers/panel) → **Tus integraciones** → crea (o elige) una aplicación de tipo **Pagos recurrentes / Suscripciones** (no "Checkout Pro" simple: necesitamos el endpoint `/preapproval`).
2. En la aplicación, pestaña **Credenciales de producción**: copia el **Access Token de producción** (`APP_USR-...`). Es el valor de `MP_ACCESS_TOKEN` en prod.
3. En la pestaña **Credenciales de prueba**: copia el **Access Token de prueba** (`TEST-...`). Sirve para probar el ciclo completo en QA sin cobrar tarjetas reales.
4. Ambos tokens viven en la **misma aplicación**; no hace falta crear una app separada por ambiente.

## Paso 2 — Registrar el webhook

MercadoPago tiene un toggle **Modo prueba / Modo producción** en la sección **Webhooks** de la aplicación; cada modo tiene su propia URL y su propio secreto de firma.

1. Con el toggle en **Producción**: **Notificaciones → Webhooks → Configurar notificaciones** → URL `https://edubox.cl/api/webhooks/mercadopago`. Eventos a marcar: **`subscription_preapproval`** y **`subscription_authorized_payment`** (los únicos que procesa `procesarEventoMp` en `lib/suscripciones/webhook.ts`; el resto se ignora a propósito).
2. Copia el **secreto de firma** que muestra el panel al guardar — es el `MP_WEBHOOK_SECRET` de producción. Valida el header `x-signature` (`validarFirmaMp` en `lib/suscripciones/webhook.ts`).
3. Con el toggle en **Prueba**: repite el registro con URL `https://qa.edubox.cl/api/webhooks/mercadopago`, los mismos dos eventos, y copia el secreto de firma de **esta** sección (es distinto del de producción).

## Paso 3 — Cargar las credenciales en Azure (`az` CLI)

Los secretos van al Key Vault y ambas Web Apps los referencian con su managed identity (ya tienen acceso de lectura al vault). Requiere `az login` con la suscripción *Patrocinio de Microsoft Azure*.

> **El Key Vault es compartido entre prod y QA** (mismo patrón que Google/Microsoft/Resend en `docs/oauth-y-correo.md`): un solo valor de `mp-access-token`/`mp-webhook-secret` alimenta **ambas** apps a la vez. A diferencia de OAuth/Resend, aquí prod y QA normalmente deberían usar credenciales *distintas* (reales vs. de prueba), así que este mecanismo no permite tenerlas activas simultáneamente. Flujo recomendado:
> 1. **Antes del lanzamiento:** carga las credenciales de **prueba** (`TEST-...` + secreto de webhook de prueba) y valida el ciclo completo en QA (Paso 4).
> 2. **En el lanzamiento:** sobrescribe los mismos secretos del Key Vault con las credenciales de **producción** y reinicia ambas apps. A partir de ahí QA quedará apuntando a producción real — evita generar suscripciones de prueba en QA después de este punto (o usa una cuenta de prueba de MercadoPago aparte si necesitas seguir probando el checkout sin cobrar).

```bash
VAULT=kv-mispreguntas-ecupwarm
RG=rg-mispreguntas-prod

# 1) Secretos en el Key Vault (reemplaza los <...> por los valores reales).
az keyvault secret set --vault-name "$VAULT" --name mp-access-token   --value '<MP_ACCESS_TOKEN>'
az keyvault secret set --vault-name "$VAULT" --name mp-webhook-secret --value '<MP_WEBHOOK_SECRET>'

# 2) App settings como Key Vault references + restart para forzar la resolución.
for APP in app-mispreguntas-ecupwarmwaeb6 app-mispreguntas-qa; do
  az webapp config appsettings set -g "$RG" -n "$APP" --settings \
    MP_ACCESS_TOKEN="@Microsoft.KeyVault(SecretUri=https://$VAULT.vault.azure.net/secrets/mp-access-token)" \
    MP_WEBHOOK_SECRET="@Microsoft.KeyVault(SecretUri=https://$VAULT.vault.azure.net/secrets/mp-webhook-secret)"
  az webapp restart -g "$RG" -n "$APP"
done
```

---

## Paso 4 — Tarjetas de prueba y ciclo completo en QA

Con el **access token de prueba** cargado (Paso 3, fase "antes del lanzamiento"), en `https://qa.edubox.cl/precios` los botones de suscripción ya arman un `preapproval` real contra el sandbox de MercadoPago.

- Los números de tarjeta de prueba son específicos de Chile (CLP) y MercadoPago los puede rotar: confírmalos en el panel → **Tus integraciones → tu app → Cuentas y tarjetas de prueba**. A la fecha de esta guía publican, entre otras, una Visa y una Mastercard de prueba con CVV y vencimiento de ejemplo indicados ahí mismo.
- El **nombre del titular** que escribas en la tarjeta de prueba simula el resultado del pago (convención estable de MercadoPago en toda la plataforma):
  - `APRO` → aprobado.
  - `CONT` → pendiente.
  - `CALL` → rechazado, con validación por teléfono.
  - `FUND` → rechazado por monto insuficiente.
  - `SECU` → rechazado por código de seguridad inválido.
  - `EXPI` → rechazado por fecha de vencimiento inválida.
  - `FORM` → rechazado por error de formulario.
  - `OTHE` → rechazado por error general.
- RUT/DNI de prueba: cualquier número válido de ejemplo del panel sirve (no se valida contra el SII en sandbox).

**Ciclo completo a probar en QA:**

1. Con un usuario sin trial usado, ir a `/precios` (o la sección Plan en `/cuenta`) y elegir Pro mensual o anual.
2. Completar el checkout con la tarjeta de prueba `APRO` → vuelve a `/cuenta?suscripcion=retorno`.
3. Verificar que el webhook `subscription_preapproval` llegó (revisar logs de la Web App o el panel de MercadoPago → Webhooks → Notificaciones enviadas) y que la suscripción quedó en estado `trial` en **Admin → Suscripciones**.
4. Forzar (desde el panel de MP, o esperando el `next_payment_date`) un cobro y confirmar que llega `subscription_authorized_payment`: el pago aparece en **Admin → Suscripciones → Ver pagos** del usuario y el estado pasa a `activa`.
5. Repetir con una tarjeta `FUND` (rechazo) y confirmar que el estado pasa a `morosa`.
6. Cancelar la suscripción desde `/cuenta` y confirmar que **Admin → Suscripciones** refleja `cancelada` y que el usuario conserva Pro hasta el fin del período ya pagado (regla de `esProSuscripcion` en `lib/suscripciones/entitlements.ts`).
7. Probar el webhook sin `x-signature` válido (p. ej. con `curl`) y confirmar 401; y, apagando `MP_WEBHOOK_SECRET` en un entorno no-productivo, confirmar que sin `NODE_ENV=production` el webhook igual procesa (comportamiento sólo para desarrollo local, nunca en QA/prod reales).

---

## Paso 5 — Local (desarrollo)

En `web/.env.local` (ver `.env.example`):

```
MP_ACCESS_TOKEN=TEST-...
MP_WEBHOOK_SECRET=
```

Sin `MP_ACCESS_TOKEN` los botones de suscripción quedan deshabilitados con
copy "muy pronto" (no rompen la página). Sin `MP_WEBHOOK_SECRET` en local
(`NODE_ENV` distinto de `production`) el webhook procesa sin validar firma,
para poder probar contra un túnel (ngrok/similar) sin configurar el secreto.

---

## Checklist de lanzamiento

- [ ] `MP_ACCESS_TOKEN` de **producción** cargado en el Key Vault y en ambas Web Apps (Paso 3, fase "en el lanzamiento").
- [ ] `MP_WEBHOOK_SECRET` de **producción** cargado — **obligatorio**: sin él, `https://edubox.cl/api/webhooks/mercadopago` responde 503 a toda notificación (fail-closed, commit `0c829b0`).
- [ ] Webhook de producción registrado en el panel de MP (modo Producción) apuntando a `https://edubox.cl/api/webhooks/mercadopago`, eventos `subscription_preapproval` y `subscription_authorized_payment`.
- [ ] Ciclo completo verificado en QA con credenciales de prueba (Paso 4) antes de promover a `main`.
- [ ] `LANZAMIENTO_GRATIS=false` en ambas Web Apps — mientras siga encendido nadie puede suscribirse (el checkout se rechaza a propósito).
- [ ] **Correo de anuncio a los usuarios existentes**: al lanzar, todos los usuarios actuales pasan al plan **Gratis** (3 importaciones IA/mes) — enviar a mano vía Resend un correo explicando el cambio e invitando al **trial de 15 días de EduBox Pro**. No hay automatización de este envío; usar la lista de usuarios de **Admin → Usuarios** para armar los destinatarios.
- [ ] **Boletas SII**: mientras no se automatice la emisión, generarlas **a mano** a partir del reporte de **Admin → Suscripciones** (tarjeta "Ingreso del mes" + "Ver pagos" por usuario, con monto en CLP y fecha de cada cobro aprobado).

## Infra como código

Estos secretos y app settings también están declarados (opcionales) en
`web/infra/` (`main.bicep`, `modules/keyvault.bicep`, `modules/appservice.bicep`)
y `deploy.sh` los propaga desde variables de entorno (`MP_ACCESS_TOKEN`,
`MP_WEBHOOK_SECRET`). Un `deploy.sh` que no los defina no los crea ni los
borra, así que gestionarlos por `az` CLI (Paso 3) no genera conflicto con un
futuro redeploy del Bicep.
