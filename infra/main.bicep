targetScope = 'resourceGroup'

// -- Required parameters --

@description('Base name for all resources (e.g. dovetail)')
param appName string

@description('Azure region for all resources')
param location string = resourceGroup().location

@secure()
@description('PostgreSQL administrator password')
param postgresAdminPassword string

@secure()
@description('NEXTAUTH_SECRET — generate with: openssl rand -base64 32')
param nextAuthSecret string

// -- OAuth --

@description('OAuth provider: google or entra')
param oauthProvider string = 'google'

@secure()
@description('Google OAuth client ID (required if oauthProvider is google)')
param googleClientId string = ''

@secure()
@description('Google OAuth client secret')
param googleClientSecret string = ''

@secure()
@description('Microsoft Entra client ID (required if oauthProvider is entra)')
param entraClientId string = ''

@secure()
@description('Microsoft Entra client secret')
param entraClientSecret string = ''

@description('Microsoft Entra tenant ID')
param entraTenantId string = ''

// -- Embeddings --

@description('Embedding provider: openai or ollama')
param embeddingProvider string = 'openai'

@description('Embedding model name')
param embeddingModel string = 'text-embedding-3-small'

@secure()
@description('OpenAI API key (required if embeddingProvider is openai)')
param openaiApiKey string = ''

@description('Embedding base URL (for Ollama or custom endpoint)')
param embeddingBaseUrl string = ''

// -- RAG --

@secure()
@description('RAG API key — generate with: openssl rand -base64 32')
param ragApiKey string

// -- Container image tag --

@description('Docker image tag to deploy')
param imageTag string = 'latest'

// ============================================================
// Modules
// ============================================================

module registry 'modules/registry.bicep' = {
  name: 'registry'
  params: {
    name: replace('${appName}acr', '-', '')
    location: location
  }
}

module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    name: '${appName}-pg'
    location: location
    adminPassword: postgresAdminPassword
  }
}

module containerApps 'modules/container-apps.bicep' = {
  name: 'containerApps'
  params: {
    appName: appName
    location: location
    acrLoginServer: registry.outputs.loginServer
    acrName: registry.outputs.name
    imageTag: imageTag
    databaseUrl: 'postgres://dovetail:${postgresAdminPassword}@${postgres.outputs.fqdn}:5432/dovetail?sslmode=require'
    nextAuthSecret: nextAuthSecret
    oauthProvider: oauthProvider
    googleClientId: googleClientId
    googleClientSecret: googleClientSecret
    entraClientId: entraClientId
    entraClientSecret: entraClientSecret
    entraTenantId: entraTenantId
    embeddingProvider: embeddingProvider
    embeddingModel: embeddingModel
    openaiApiKey: openaiApiKey
    embeddingBaseUrl: embeddingBaseUrl
    ragApiKey: ragApiKey
  }
}

// ============================================================
// Outputs
// ============================================================

@description('ACR login server')
output acrLoginServer string = registry.outputs.loginServer

@description('PostgreSQL FQDN')
output postgresFqdn string = postgres.outputs.fqdn

@description('API URL')
output apiUrl string = containerApps.outputs.apiUrl

@description('Web URL')
output webUrl string = containerApps.outputs.webUrl
