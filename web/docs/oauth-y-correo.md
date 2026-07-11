# Login social (Google/Microsoft) y correo (Resend) — configuración

Guía para dejar operativos en **producción** y **QA**:

- **Login con Google (Gmail)** y **Microsoft (Outlook / M365)**.
- **Correo transaccional (Resend)**: verificación de cuenta y **recuperación de contraseña**.

El código ya está desplegado. Lo que falta es **infraestructura/credenciales**, que sólo se puede crear desde las consolas de Google/Microsoft y Resend. Un proveedor social **sólo aparece en la UI si sus credenciales están presentes** (detección por presencia de env vars), así que puedes activarlos de a uno.

> **Estado detectado (2026-07):** ni prod ni QA tienen `RESEND_API_KEY`. Por eso hoy **no se envían** los correos de verificación (ni el nuevo de reset): el envío se omite silenciosamente. El Paso 4 lo arregla.

## Recursos Azure (reales)

| Entorno | Web App | URL pública (`BETTER_AUTH_URL`) |
|---|---|---|
| Prod | `app-mispreguntas-ecupwarmwaeb6` | `https://edubox.cl` |
| QA | `app-mispreguntas-qa` | `https://qa.edubox.cl` |

- Resource group: `rg-mispreguntas-prod` (ambas apps) · Key Vault: `kv-mispreguntas-ecupwarm` (compartido).

## Redirect URIs a registrar

better-auth arma el callback como `{BETTER_AUTH_URL}/api/auth/callback/{proveedor}`. Registra **todas** estas en una sola app de cada proveedor (soportan múltiples):

| Entorno | Google | Microsoft |
|---|---|---|
| Prod | `https://edubox.cl/api/auth/callback/google` | `https://edubox.cl/api/auth/callback/microsoft` |
| QA | `https://qa.edubox.cl/api/auth/callback/google` | `https://qa.edubox.cl/api/auth/callback/microsoft` |
| Local | `http://localhost:3000/api/auth/callback/google` | `http://localhost:3000/api/auth/callback/microsoft` |

---

## Paso 1 — App OAuth de Google

1. [Google Cloud Console](https://console.cloud.google.com/) → crea o elige un proyecto.
2. **APIs & Services → OAuth consent screen**: tipo **External**, completa nombre de la app, correo de soporte y dominio (`edubox.cl`). Publica (o deja en *Testing* con usuarios de prueba).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs**: pega las 3 de la columna *Google* de arriba.
4. Copia el **Client ID** y el **Client secret**.

## Paso 2 — App de Microsoft (Entra ID)

1. [Microsoft Entra admin center](https://entra.microsoft.com/) → **Identity → Applications → App registrations → New registration**.
2. **Supported account types**: *Accounts in any organizational directory and personal Microsoft accounts* (equivale a `tenantId=common`; admite Outlook/Hotmail y M365 de colegios).
3. **Redirect URI**: plataforma **Web**, agrega las 3 de la columna *Microsoft* (puedes añadir las demás luego en *Authentication*).
4. Copia el **Application (client) ID** (Overview).
5. **Certificates & secrets → New client secret** → copia el **Value** (no el Secret ID). Guárdalo: sólo se muestra una vez.

---

## Paso 3 — Cargar las credenciales en Azure (`az` CLI)

Los secretos van al Key Vault y las apps los referencian con su managed identity (ambas apps ya tienen acceso de lectura al vault). Requiere `az login` con la suscripción *Patrocinio de Microsoft Azure*.

```bash
VAULT=kv-mispreguntas-ecupwarm
RG=rg-mispreguntas-prod

# 1) Secretos en el Key Vault (reemplaza los <...> por los valores reales).
az keyvault secret set --vault-name "$VAULT" --name google-client-id       --value '<GOOGLE_CLIENT_ID>'
az keyvault secret set --vault-name "$VAULT" --name google-client-secret   --value '<GOOGLE_CLIENT_SECRET>'
az keyvault secret set --vault-name "$VAULT" --name microsoft-client-id     --value '<MICROSOFT_CLIENT_ID>'
az keyvault secret set --vault-name "$VAULT" --name microsoft-client-secret --value '<MICROSOFT_CLIENT_SECRET>'

# 2) App settings como Key Vault references. Repite el bloque para el app de QA
#    (app-mispreguntas-qa) — comparten el mismo vault y las mismas credenciales.
for APP in app-mispreguntas-ecupwarmwaeb6 app-mispreguntas-qa; do
  az webapp config appsettings set -g "$RG" -n "$APP" --settings \
    GOOGLE_CLIENT_ID="@Microsoft.KeyVault(SecretUri=https://$VAULT.vault.azure.net/secrets/google-client-id)" \
    GOOGLE_CLIENT_SECRET="@Microsoft.KeyVault(SecretUri=https://$VAULT.vault.azure.net/secrets/google-client-secret)" \
    MICROSOFT_CLIENT_ID="@Microsoft.KeyVault(SecretUri=https://$VAULT.vault.azure.net/secrets/microsoft-client-id)" \
    MICROSOFT_CLIENT_SECRET="@Microsoft.KeyVault(SecretUri=https://$VAULT.vault.azure.net/secrets/microsoft-client-secret)"
  az webapp restart -g "$RG" -n "$APP"
done
```

> Deja fuera de un proveedor: si sólo configuras Google, omite los dos settings de Microsoft y sólo aparecerá el botón de Google.

---

## Paso 4 — Correo (Resend) — arregla el envío hoy inactivo

1. En [Resend](https://resend.com/domains) verifica el dominio **`edubox.cl`** (registros DNS que indica Resend). El remitente por defecto es `no-reply@edubox.cl`.
2. Crea una **API key** (Resend → API Keys).
3. Cárgala en Azure (misma mecánica):

```bash
VAULT=kv-mispreguntas-ecupwarm
RG=rg-mispreguntas-prod

az keyvault secret set --vault-name "$VAULT" --name resend-api-key --value '<RESEND_API_KEY>'

for APP in app-mispreguntas-ecupwarmwaeb6 app-mispreguntas-qa; do
  az webapp config appsettings set -g "$RG" -n "$APP" --settings \
    RESEND_API_KEY="@Microsoft.KeyVault(SecretUri=https://$VAULT.vault.azure.net/secrets/resend-api-key)" \
    EMAIL_FROM="EduBox <no-reply@edubox.cl>"
  az webapp restart -g "$RG" -n "$APP"
done
```

---

## Paso 5 — Local (desarrollo)

En `web/.env.local` (ver `.env.example`):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
RESEND_API_KEY=re_...          # opcional en local: sin ella, el enlace de reset queda en los logs del server
EMAIL_FROM=EduBox <no-reply@edubox.cl>
```

Sin `RESEND_API_KEY` el flujo de reset funciona igual, pero el correo no se envía: el enlace aparece en la consola del server (`[email] RESEND_API_KEY no configurada; se omite...`).

---

## Verificación

1. `https://edubox.cl/login` (o `qa.edubox.cl`) muestra los botones **Continuar con Google/Microsoft**.
2. Un login social crea el usuario y deja sesión → aparece en **Admin → Accesos** con método `google`/`microsoft`, IP y navegador.
3. `https://edubox.cl/recuperar` → llega el correo → el enlace abre `/restablecer` → nueva contraseña funciona.
4. **Admin → Accesos** registra logins exitosos y fallidos (email/contraseña).

## Infra como código

Estos secretos y app settings también están declarados (opcionales) en `web/infra/` (`main.bicep`, `modules/keyvault.bicep`, `modules/appservice.bicep`) y `deploy.sh` los propaga desde variables de entorno. Un `deploy.sh` que no los defina no los crea ni los borra, así que gestionarlos por `az` CLI (arriba) no genera conflicto.
