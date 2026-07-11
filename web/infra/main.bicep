// ===========================================================================
// Mis Preguntas — Infraestructura Azure (Bicep)
// Scope: subscription. Crea el Resource Group y todos los recursos.
//
// Recursos: Resource Group, PostgreSQL Flexible Server (Burstable B1ms),
// Storage Account + contenedor 'uploads', App Service Plan (Linux B1) + Web App
// (Node 22, managed identity), y Key Vault (RBAC) con los secretos. La Web App
// lee los secretos vía Key Vault references usando su managed identity.
//
// SKUs económicos (suscripción de patrocinio). NO crear recursos manualmente:
// usar deploy.sh / what-if.
//
// Orden y dependencias (importante para que las Key Vault references resuelvan):
//   1. postgres  -> FQDN (para construir DATABASE_URL)
//   2. storage   -> connection string
//   3. appservice-> crea la Web App + identidad; recibe los SecretUri ya
//      construidos a partir del nombre del Key Vault (no depende de la salida de
//      keyvault, evitando el ciclo con el role assignment). Produce principalId.
//   4. keyvault  -> crea el Key Vault, los secretos (DATABASE_URL armada con la
//      password, storage-connection desde storage) y el role assignment
//      "Key Vault Secrets User" para el principalId de la Web App.
//
// Como los secretos y el role assignment se crean DESPUÉS de la Web App, tras el
// despliegue conviene reiniciar la Web App (`az webapp restart`) para forzar la
// resolución inmediata de las Key Vault references. Ver deploy.sh.
// ===========================================================================

targetScope = 'subscription'

@description('Región de Azure para todos los recursos. westus3: la suscripción de patrocinio restringe PostgreSQL Flexible en eastus2/eastus.')
param location string = 'westus3'

@description('Prefijo de nombres para los recursos.')
param namePrefix string = 'mispreguntas'

@description('Usuario administrador de PostgreSQL.')
param postgresAdminUser string = 'mispreguntasadmin'

@secure()
@description('Contraseña del administrador de PostgreSQL.')
param postgresAdminPassword string

@secure()
@description('Secreto de better-auth (>= 32 caracteres).')
param betterAuthSecret string

@secure()
@description('API key de Anthropic.')
param anthropicApiKey string

// --- Login social + correo (opcionales). Vacío = no se crea el secreto ni el
// app setting, así el deploy no falla si aún no hay credenciales. Se pueden
// gestionar también por `az` CLI sin redeploy. ---
@secure()
@description('Google OAuth client id.')
param googleClientId string = ''

@secure()
@description('Google OAuth client secret.')
param googleClientSecret string = ''

@secure()
@description('Microsoft OAuth client id (Application/client ID de Entra).')
param microsoftClientId string = ''

@secure()
@description('Microsoft OAuth client secret.')
param microsoftClientSecret string = ''

@secure()
@description('API key de Resend (correo transaccional).')
param resendApiKey string = ''

@description('Remitente de correo (EMAIL_FROM). Vacío = default del código.')
param emailFrom string = ''

@description('IP pública del cliente para una regla de firewall temporal de migración. Vacío = no se crea.')
param clientIp string = ''

// --- Nombres derivados -----------------------------------------------------
var resourceGroupName = 'rg-${namePrefix}-prod'
var uniqueSuffix = uniqueString(subscription().id, namePrefix)

var postgresServerName = 'psql-${namePrefix}-${uniqueSuffix}'
var storageAccountName = take(toLower('st${replace(namePrefix, '-', '')}${uniqueSuffix}'), 24)
var planName = 'plan-${namePrefix}'
var appName = 'app-${namePrefix}-${uniqueSuffix}'
var keyVaultName = take('kv-${namePrefix}-${uniqueSuffix}', 24)
var databaseName = 'mispreguntas'

// SecretUris construidos a partir del nombre del Key Vault (apuntan a la última
// versión). Se pasan a appservice para las Key Vault references.
var keyVaultDns = environment().suffixes.keyvaultDns
var keyVaultSecretUris = {
  databaseUrl: 'https://${keyVaultName}${keyVaultDns}/secrets/database-url'
  betterAuthSecret: 'https://${keyVaultName}${keyVaultDns}/secrets/better-auth-secret'
  anthropicApiKey: 'https://${keyVaultName}${keyVaultDns}/secrets/anthropic-api-key'
  storageConnection: 'https://${keyVaultName}${keyVaultDns}/secrets/storage-connection'
}

// SecretUris opcionales: cadena vacía cuando el secreto no se aprovisiona, para
// que appservice NO agregue un app setting que referencie un secreto inexistente.
var optionalSecretUris = {
  googleClientId: googleClientId != '' ? 'https://${keyVaultName}${keyVaultDns}/secrets/google-client-id' : ''
  googleClientSecret: googleClientSecret != '' ? 'https://${keyVaultName}${keyVaultDns}/secrets/google-client-secret' : ''
  microsoftClientId: microsoftClientId != '' ? 'https://${keyVaultName}${keyVaultDns}/secrets/microsoft-client-id' : ''
  microsoftClientSecret: microsoftClientSecret != '' ? 'https://${keyVaultName}${keyVaultDns}/secrets/microsoft-client-secret' : ''
  resendApiKey: resendApiKey != '' ? 'https://${keyVaultName}${keyVaultDns}/secrets/resend-api-key' : ''
}

// --- Resource Group --------------------------------------------------------
resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

// --- PostgreSQL Flexible Server -------------------------------------------
module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  scope: rg
  params: {
    location: location
    serverName: postgresServerName
    administratorLogin: postgresAdminUser
    administratorPassword: postgresAdminPassword
    databaseName: databaseName
    clientIp: clientIp
  }
}

// --- Storage Account -------------------------------------------------------
module storage 'modules/storage.bicep' = {
  name: 'storage'
  scope: rg
  params: {
    location: location
    storageAccountName: storageAccountName
    containerName: 'uploads'
  }
}

// --- App Service (Plan + Web App con managed identity) ---------------------
module appservice 'modules/appservice.bicep' = {
  name: 'appservice'
  scope: rg
  params: {
    location: location
    planName: planName
    appName: appName
    keyVaultSecretUris: keyVaultSecretUris
    optionalSecretUris: optionalSecretUris
    emailFrom: emailFrom
  }
}

// --- DATABASE_URL para Node (postgres-js) ---------------------------------
// Formato: postgres://USER:PASS@FQDN:5432/db?sslmode=require
// Nota: si la password contiene caracteres no seguros para URL, se debe
// URL-encodear antes de pasarla a este template.
var databaseUrl = 'postgres://${postgresAdminUser}:${postgresAdminPassword}@${postgres.outputs.fqdn}:5432/${databaseName}?sslmode=require'

// --- Key Vault (secretos + role assignment a la MI de la Web App) ----------
module keyvault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  scope: rg
  params: {
    location: location
    keyVaultName: keyVaultName
    principalId: appservice.outputs.principalId
    databaseUrl: databaseUrl
    betterAuthSecret: betterAuthSecret
    anthropicApiKey: anthropicApiKey
    storageConnection: storage.outputs.connectionString
    googleClientId: googleClientId
    googleClientSecret: googleClientSecret
    microsoftClientId: microsoftClientId
    microsoftClientSecret: microsoftClientSecret
    resendApiKey: resendApiKey
  }
}

// --- Outputs ---------------------------------------------------------------
@description('Hostname público de la Web App.')
output appHostName string = appservice.outputs.defaultHostName

@description('URL pública de la Web App.')
output appUrl string = 'https://${appservice.outputs.defaultHostName}'

@description('Nombre del Resource Group.')
output resourceGroupName string = rg.name

@description('Nombre del Key Vault.')
output keyVaultName string = keyvault.outputs.keyVaultName

@description('FQDN del servidor PostgreSQL.')
output postgresFqdn string = postgres.outputs.fqdn

@description('Nombre de la cuenta de almacenamiento.')
output storageAccountName string = storage.outputs.storageAccountName
