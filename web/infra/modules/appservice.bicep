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

// Host por defecto (la URL pública). El dominio custom se gestiona más adelante.
var defaultHost = '${appName}.azurewebsites.net'

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
      appSettings: [
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
      ]
    }
  }
}

@description('principalId de la identidad system-assigned de la Web App.')
output principalId string = webApp.identity.principalId

@description('Hostname por defecto de la Web App.')
output defaultHostName string = webApp.properties.defaultHostName

@description('Nombre de la Web App.')
output appName string = webApp.name
