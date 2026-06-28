// ---------------------------------------------------------------------------
// Storage Account (StorageV2, LRS) + contenedor privado 'uploads' para imágenes.
// - Acceso público de blobs deshabilitado (allowBlobPublicAccess = false).
// - HTTPS obligatorio, TLS 1.2 mínimo.
// - Output: connection string (se guarda en Key Vault desde main.bicep).
// ---------------------------------------------------------------------------

@description('Región de los recursos.')
param location string

@description('Nombre de la cuenta de almacenamiento (3-24, minúsculas/dígitos, único global).')
param storageAccountName string

@description('Nombre del contenedor de blobs para subidas.')
param containerName string = 'uploads'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowSharedKeyAccess: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource uploads 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: containerName
  properties: {
    publicAccess: 'None'
  }
}

@description('Nombre de la cuenta de almacenamiento.')
output storageAccountName string = storage.name

@description('Nombre del contenedor de subidas.')
output containerName string = uploads.name

// La connection string contiene una clave de acceso (secreto). Se devuelve para
// guardarla en Key Vault; por eso se silencia la regla del linter de secretos.
@description('Connection string de la cuenta de almacenamiento.')
#disable-next-line outputs-should-not-contain-secrets
output connectionString string = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
