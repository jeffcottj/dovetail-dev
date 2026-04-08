@description('Name of the container registry')
param name string

@description('Azure region')
param location string = resourceGroup().location

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: name
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

@description('ACR login server (e.g. myregistry.azurecr.io)')
output loginServer string = acr.properties.loginServer

@description('ACR resource name')
output name string = acr.name
