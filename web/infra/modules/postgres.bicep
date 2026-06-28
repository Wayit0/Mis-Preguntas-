// ---------------------------------------------------------------------------
// Azure Database for PostgreSQL Flexible Server (Burstable, económico)
// - Versión 16, SKU Standard_B1ms (tier Burstable), storage mínimo (32 GB).
// - Base de datos 'mispreguntas'.
// - SSL/TLS obligatorio (require_secure_transport = ON).
// - Firewall: regla "AllowAzureServices" (0.0.0.0) y, opcionalmente, una regla
//   temporal para la IP del cliente que ejecuta la migración (clientIp).
// ---------------------------------------------------------------------------

@description('Región de los recursos.')
param location string

@description('Nombre del servidor PostgreSQL Flexible (debe ser único global).')
param serverName string

@description('Usuario administrador de PostgreSQL.')
param administratorLogin string

@description('Contraseña del administrador de PostgreSQL.')
@secure()
param administratorPassword string

@description('Nombre de la base de datos de la aplicación.')
param databaseName string = 'mispreguntas'

@description('IP pública del cliente para una regla de firewall temporal de migración. Vacío = no se crea.')
param clientIp string = ''

// SKU económico: Burstable B1ms.
var skuName = 'Standard_B1ms'
var skuTier = 'Burstable'
// Tamaño de almacenamiento mínimo soportado por Flexible Server.
var storageSizeGB = 32

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: '16'
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    storage: {
      storageSizeGB: storageSizeGB
      autoGrow: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    createMode: 'Default'
  }
}

// Base de datos de la aplicación.
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// SSL/TLS obligatorio: rechaza conexiones no cifradas.
resource requireSecureTransport 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: postgres
  name: 'require_secure_transport'
  properties: {
    value: 'ON'
    source: 'user-override'
  }
}

// Permite el acceso desde servicios de Azure (App Service). La regla 0.0.0.0-0.0.0.0
// es la convención de Azure para "Allow public access from any Azure service".
resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Regla temporal opcional para la migración de datos desde la máquina del operador.
resource allowClient 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = if (!empty(clientIp)) {
  parent: postgres
  name: 'AllowMigrationClient'
  properties: {
    startIpAddress: clientIp
    endIpAddress: clientIp
  }
}

@description('FQDN del servidor PostgreSQL.')
output fqdn string = postgres.properties.fullyQualifiedDomainName

@description('Nombre del servidor PostgreSQL.')
output serverName string = postgres.name

@description('Nombre de la base de datos.')
output databaseName string = database.name
