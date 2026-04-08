@description('Name of the PostgreSQL server')
param name string

@description('Azure region')
param location string = resourceGroup().location

@description('Administrator login username')
param adminLogin string = 'dovetail'

@secure()
@description('Administrator login password')
param adminPassword string

@description('Name of the database to create')
param databaseName string = 'dovetail'

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: name
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

// Allow Azure services (Container Apps) to connect
resource firewallAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: server
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Enable pgvector extension
resource pgvectorConfig 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: server
  name: 'azure.extensions'
  properties: {
    value: 'VECTOR'
    source: 'user-override'
  }
}

// Create the application database
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

@description('Full connection string with sslmode=require (password placeholder — assembled in main.bicep)')
output connectionString string = 'postgres://${adminLogin}:PASSWORD@${server.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'

@description('Server FQDN')
output fqdn string = server.properties.fullyQualifiedDomainName
