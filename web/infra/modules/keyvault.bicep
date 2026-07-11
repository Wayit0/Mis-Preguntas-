// ---------------------------------------------------------------------------
// Key Vault (RBAC) + secretos de la app + role assignment para la Web App.
// - enableRbacAuthorization = true (sin access policies).
// - Secretos: database-url, better-auth-secret, anthropic-api-key, storage-connection.
// - Role assignment "Key Vault Secrets User" a la managed identity (principalId)
//   de la Web App, para que las Key Vault references se resuelvan en runtime.
// ---------------------------------------------------------------------------

@description('Región de los recursos.')
param location string

@description('Nombre del Key Vault (3-24, único global).')
param keyVaultName string

@description('principalId de la managed identity de la Web App (destino del role assignment).')
param principalId string

@secure()
@description('Valor del secreto DATABASE_URL.')
param databaseUrl string

@secure()
@description('Valor del secreto BETTER_AUTH_SECRET.')
param betterAuthSecret string

@secure()
@description('Valor del secreto ANTHROPIC_API_KEY.')
param anthropicApiKey string

@secure()
@description('Connection string del Storage Account.')
param storageConnection string

// --- Secretos opcionales (login social + correo). Vacío = no se crea el secreto,
// así un deploy que no los pase no falla ni los borra. Se pueden gestionar por
// CLI (az keyvault secret set) sin tocar el Bicep. ---
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

// Rol integrado "Key Vault Secrets User".
var keyVaultSecretsUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enabledForDeployment: false
    enabledForTemplateDeployment: false
    enabledForDiskEncryption: false
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'database-url'
  properties: {
    value: databaseUrl
  }
}

resource secretBetterAuth 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'better-auth-secret'
  properties: {
    value: betterAuthSecret
  }
}

resource secretAnthropic 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'anthropic-api-key'
  properties: {
    value: anthropicApiKey
  }
}

resource secretStorage 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'storage-connection'
  properties: {
    value: storageConnection
  }
}

// Secretos opcionales: sólo se crean si se pasó un valor no vacío.
resource secretGoogleId 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (googleClientId != '') {
  parent: keyVault
  name: 'google-client-id'
  properties: {
    value: googleClientId
  }
}

resource secretGoogleSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (googleClientSecret != '') {
  parent: keyVault
  name: 'google-client-secret'
  properties: {
    value: googleClientSecret
  }
}

resource secretMicrosoftId 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (microsoftClientId != '') {
  parent: keyVault
  name: 'microsoft-client-id'
  properties: {
    value: microsoftClientId
  }
}

resource secretMicrosoftSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (microsoftClientSecret != '') {
  parent: keyVault
  name: 'microsoft-client-secret'
  properties: {
    value: microsoftClientSecret
  }
}

resource secretResend 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (resendApiKey != '') {
  parent: keyVault
  name: 'resend-api-key'
  properties: {
    value: resendApiKey
  }
}

// La Web App (managed identity) puede LEER secretos del Key Vault.
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, principalId, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: keyVaultSecretsUserRoleId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

@description('Nombre del Key Vault.')
output keyVaultName string = keyVault.name

@description('URI del Key Vault.')
output keyVaultUri string = keyVault.properties.vaultUri

@description('SecretUri (con versión) de cada secreto.')
output secretUris object = {
  databaseUrl: secretDatabaseUrl.properties.secretUri
  betterAuthSecret: secretBetterAuth.properties.secretUri
  anthropicApiKey: secretAnthropic.properties.secretUri
  storageConnection: secretStorage.properties.secretUri
}
