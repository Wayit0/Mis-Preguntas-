// ---------------------------------------------------------------------------
// App Service Plan (Linux, B1) + Web App (Node 22 LTS) para la app Next.js.
// - Identidad system-assigned (para leer secretos de Key Vault).
// - alwaysOn habilitado (soportado por B1).
// - App settings de secretos como Key Vault references (@Microsoft.KeyVault).
//   Los SecretUri llegan ya construidos desde main.bicep (a partir del nombre
//   del Key Vault), de modo que este módulo NO depende de la salida de keyvault
//   y se evita la dependencia circular con el role assignment (que necesita el
//   principalId que este módulo produce).
// ---------------------------------------------------------------------------

@description('Región de los recursos.')
param location string

@description('Nombre del App Service Plan.')
param planName string

@description('Nombre de la Web App (único global, *.azurewebsites.net).')
param appName string

@description('Runtime de Node para Linux.')
param linuxFxVersion string = 'NODE|22-lts'

@description('Comando de arranque. Por defecto "next start" vía npm. Para build standalone de Next 16 usar "node server.js".')
param startupCommand string = 'npm run start'

@description('Nombre del contenedor de blobs.')
param blobContainer string = 'uploads'

@description('SecretUris de Key Vault para las references de app settings.')
param keyVaultSecretUris object

@description('SecretUris OPCIONALES (login social + correo). Cadena vacía en una clave = no se agrega ese app setting (evita referenciar un secreto inexistente).')
param optionalSecretUris object = {}

@description('Remitente de correo (EMAIL_FROM). Vacío = usa el default del código.')
param emailFrom string = ''

// Host por defecto (la URL pública). El dominio custom se gestiona más adelante.
var defaultHost = '${appName}.azurewebsites.net'

// App settings opcionales: sólo se agregan cuando su SecretUri viene con valor.
// Si el secreto no existe todavía, referenciarlo dejaría la env var con el
// string de la reference sin resolver (rompería la detección por presencia), por
// eso se omiten hasta configurarlos (por Bicep o por `az` CLI).
var gId = optionalSecretUris.?googleClientId ?? ''
var gSecret = optionalSecretUris.?googleClientSecret ?? ''
var mId = optionalSecretUris.?microsoftClientId ?? ''
var mSecret = optionalSecretUris.?microsoftClientSecret ?? ''
var resendUri = optionalSecretUris.?resendApiKey ?? ''

var optionalAppSettings = concat(
  gId != '' ? [ { name: 'GOOGLE_CLIENT_ID', value: '@Microsoft.KeyVault(SecretUri=${gId})' } ] : [],
  gSecret != '' ? [ { name: 'GOOGLE_CLIENT_SECRET', value: '@Microsoft.KeyVault(SecretUri=${gSecret})' } ] : [],
  mId != '' ? [ { name: 'MICROSOFT_CLIENT_ID', value: '@Microsoft.KeyVault(SecretUri=${mId})' } ] : [],
  mSecret != '' ? [ { name: 'MICROSOFT_CLIENT_SECRET', value: '@Microsoft.KeyVault(SecretUri=${mSecret})' } ] : [],
  resendUri != '' ? [ { name: 'RESEND_API_KEY', value: '@Microsoft.KeyVault(SecretUri=${resendUri})' } ] : [],
  emailFrom != '' ? [ { name: 'EMAIL_FROM', value: emailFrom } ] : []
)

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  properties: {
    reserved: true // Linux
  }
}

resource webApp 'Microsoft.Web/sites@2024-04-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: linuxFxVersion
      alwaysOn: true // soportado en B1
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appCommandLine: startupCommand
      appSettings: concat([
        // --- Secretos vía Key Vault references (resueltos en runtime con la MI) ---
        {
          name: 'DATABASE_URL'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUris.databaseUrl})'
        }
        {
          name: 'BETTER_AUTH_SECRET'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUris.betterAuthSecret})'
        }
        {
          name: 'ANTHROPIC_API_KEY'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUris.anthropicApiKey})'
        }
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUris.storageConnection})'
        }
        // --- Config no secreta ---
        {
          name: 'BETTER_AUTH_URL'
          value: 'https://${defaultHost}'
        }
        {
          // baseURL del cliente better-auth (browser). Mismo host público.
          name: 'NEXT_PUBLIC_BETTER_AUTH_URL'
          value: 'https://${defaultHost}'
        }
        {
          name: 'BLOB_CONTAINER'
          value: blobContainer
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22'
        }
      ], optionalAppSettings)
    }
  }
}

@description('principalId de la identidad system-assigned de la Web App.')
output principalId string = webApp.identity.principalId

@description('Hostname por defecto de la Web App.')
output defaultHostName string = webApp.properties.defaultHostName

@description('Nombre de la Web App.')
output appName string = webApp.name
