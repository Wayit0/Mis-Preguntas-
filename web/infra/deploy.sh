#!/usr/bin/env bash
# ===========================================================================
# Despliegue de la infraestructura de "Mis Preguntas" en Azure (Bicep).
#
# NO crea nada por sí mismo hasta que ejecutes el `az deployment sub create`.
# Antes de crear recursos facturables, confirma con el responsable del proyecto.
#
# Pre-requisitos:
#   - az CLI instalado y autenticado:  az login
#   - Suscripción correcta seleccionada:
#       az account set --subscription "Patrocinio de Microsoft Azure"
#   - Bicep instalado:  az bicep install   (o  az bicep upgrade)
#
# Los SECRETOS se leen de variables de entorno (no se escriben en disco ni en el
# historial). Expórtalos antes de ejecutar:
#
#   export PG_ADMIN_PASSWORD='<password fuerte de Postgres>'
#   export BETTER_AUTH_SECRET='<secreto aleatorio >= 32 chars>'
#   export ANTHROPIC_API_KEY='sk-ant-...'
#   # Opcional, para abrir el firewall a tu IP durante la migración de datos:
#   export CLIENT_IP="$(curl -s https://api.ipify.org)"
#
# Generar secretos de ejemplo:
#   BETTER_AUTH_SECRET=$(openssl rand -base64 32)
#   PG_ADMIN_PASSWORD=$(openssl rand -base64 24)
# ===========================================================================
set -euo pipefail

LOCATION="${LOCATION:-westus3}"  # patrocinio: Postgres Flexible restringido en eastus2/eastus
NAME_PREFIX="${NAME_PREFIX:-mispreguntas}"
TEMPLATE="$(cd "$(dirname "$0")" && pwd)/main.bicep"
DEPLOYMENT_NAME="mispreguntas-infra-$(date +%Y%m%d%H%M%S)"

: "${PG_ADMIN_PASSWORD:?Define PG_ADMIN_PASSWORD}"
: "${BETTER_AUTH_SECRET:?Define BETTER_AUTH_SECRET}"
: "${ANTHROPIC_API_KEY:?Define ANTHROPIC_API_KEY}"
CLIENT_IP="${CLIENT_IP:-}"

params=(
  "location=${LOCATION}"
  "namePrefix=${NAME_PREFIX}"
  "postgresAdminPassword=${PG_ADMIN_PASSWORD}"
  "betterAuthSecret=${BETTER_AUTH_SECRET}"
  "anthropicApiKey=${ANTHROPIC_API_KEY}"
)
if [[ -n "${CLIENT_IP}" ]]; then
  params+=("clientIp=${CLIENT_IP}")
fi

# Opcionales (login social + correo + MercadoPago). Sólo se pasan si están
# definidos; vacíos = el Bicep no crea el secreto ni el app setting. También se
# pueden gestionar por `az keyvault secret set` / `az webapp config appsettings
# set` sin redeploy (ver web/docs/oauth-y-correo.md y web/docs/mercadopago.md).
for var in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET MICROSOFT_CLIENT_ID \
           MICROSOFT_CLIENT_SECRET RESEND_API_KEY EMAIL_FROM \
           MP_ACCESS_TOKEN MP_WEBHOOK_SECRET; do
  val="${!var:-}"
  if [[ -n "${val}" ]]; then
    # Nombre de param en camelCase (googleClientId, resendApiKey, emailFrom, ...).
    case "${var}" in
      GOOGLE_CLIENT_ID) params+=("googleClientId=${val}") ;;
      GOOGLE_CLIENT_SECRET) params+=("googleClientSecret=${val}") ;;
      MICROSOFT_CLIENT_ID) params+=("microsoftClientId=${val}") ;;
      MICROSOFT_CLIENT_SECRET) params+=("microsoftClientSecret=${val}") ;;
      RESEND_API_KEY) params+=("resendApiKey=${val}") ;;
      EMAIL_FROM) params+=("emailFrom=${val}") ;;
      MP_ACCESS_TOKEN) params+=("mpAccessToken=${val}") ;;
      MP_WEBHOOK_SECRET) params+=("mpWebhookSecret=${val}") ;;
    esac
  fi
done

# 1) Validación previa (NO crea recursos): muestra el diff de lo que se crearía.
echo ">> what-if (no crea recursos)"
az deployment sub what-if \
  --location "${LOCATION}" \
  --template-file "${TEMPLATE}" \
  --parameters "${params[@]}"

# 2) Despliegue real. Descomenta para crear los recursos (FACTURABLE).
# echo ">> deployment create"
# az deployment sub create \
#   --name "${DEPLOYMENT_NAME}" \
#   --location "${LOCATION}" \
#   --template-file "${TEMPLATE}" \
#   --parameters "${params[@]}"

# 3) Post-deploy: forzar la resolución de las Key Vault references.
#    Los secretos y el role assignment se crean después de la Web App, por lo que
#    conviene reiniciar la Web App para que las references se resuelvan de inmediato.
# RG="rg-${NAME_PREFIX}-prod"
# APP_NAME=$(az deployment sub show --name "${DEPLOYMENT_NAME}" \
#   --query "properties.outputs.appHostName.value" -o tsv | cut -d. -f1)
# az webapp restart --resource-group "${RG}" --name "${APP_NAME}"

# ---------------------------------------------------------------------------
# Despliegue de la APP (decisión final del build en Fase 8B):
#   Opción A (por defecto en el Bicep): "next start"
#     - App settings ya configura appCommandLine = 'npm run start'.
#     - Requiere que App Service compile en el deploy (Oryx):
#         az webapp config appsettings set -g "$RG" -n "$APP_NAME" \
#           --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true
#       o subir la app ya construida (.next + node_modules).
#   Opción B: Next 16 standalone (next.config: output: 'standalone')
#     - Cambiar el startup command a 'node server.js' (parámetro startupCommand)
#       y desplegar la carpeta .next/standalone.
# ---------------------------------------------------------------------------
