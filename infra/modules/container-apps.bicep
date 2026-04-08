@description('Base name for resources')
param appName string

@description('Azure region')
param location string = resourceGroup().location

@description('ACR login server (e.g. myregistry.azurecr.io)')
param acrLoginServer string

@description('ACR name (for admin credential pull)')
param acrName string

@description('Container image tag')
param imageTag string = 'latest'

// -- Secrets (passed as secure params) --

@secure()
@description('Full DATABASE_URL including password and sslmode=require')
param databaseUrl string

@secure()
@description('NEXTAUTH_SECRET for session encryption')
param nextAuthSecret string

@description('OAuth provider: google or entra')
param oauthProvider string = 'google'

@secure()
@description('Google OAuth client ID')
param googleClientId string = ''

@secure()
@description('Google OAuth client secret')
param googleClientSecret string = ''

@secure()
@description('Entra client ID')
param entraClientId string = ''

@secure()
@description('Entra client secret')
param entraClientSecret string = ''

@description('Entra tenant ID')
param entraTenantId string = ''

@description('Embedding provider: openai or ollama')
param embeddingProvider string = 'openai'

@description('Embedding model name')
param embeddingModel string = 'text-embedding-3-small'

@secure()
@description('OpenAI API key for embeddings')
param openaiApiKey string = ''

@description('Embedding base URL (for Ollama or custom endpoint)')
param embeddingBaseUrl string = ''

@secure()
@description('RAG API key')
param ragApiKey string = ''

// -- Log Analytics workspace (required by Container Apps Environment) --

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${appName}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// -- Container Apps Environment --

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${appName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// -- ACR credentials --

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

// -- API Container App --

resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${appName}-api'
  location: location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3001
        transport: 'http'
      }
      registries: [
        {
          server: acrLoginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
        { name: 'database-url', value: databaseUrl }
        { name: 'nextauth-secret', value: nextAuthSecret }
        { name: 'google-client-id', value: googleClientId }
        { name: 'google-client-secret', value: googleClientSecret }
        { name: 'entra-client-id', value: entraClientId }
        { name: 'entra-client-secret', value: entraClientSecret }
        { name: 'openai-api-key', value: openaiApiKey }
        { name: 'rag-api-key', value: ragApiKey }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${acrLoginServer}/dovetail-api:${imageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'PORT', value: '3001' }
            { name: 'NEXTAUTH_SECRET', secretRef: 'nextauth-secret' }
            { name: 'OAUTH_PROVIDER', value: oauthProvider }
            { name: 'EMBEDDING_PROVIDER', value: embeddingProvider }
            { name: 'EMBEDDING_MODEL', value: embeddingModel }
            { name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }
            { name: 'EMBEDDING_BASE_URL', value: embeddingBaseUrl }
            { name: 'RAG_API_KEY', secretRef: 'rag-api-key' }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/api/health'
                port: 3001
              }
              initialDelaySeconds: 30
              periodSeconds: 10
              failureThreshold: 20
              timeoutSeconds: 5
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// -- Web Container App --

resource webApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${appName}-web'
  location: location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
      }
      registries: [
        {
          server: acrLoginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password-web'
        }
      ]
      secrets: [
        { name: 'acr-password-web', value: acr.listCredentials().passwords[0].value }
        { name: 'nextauth-secret-web', value: nextAuthSecret }
        { name: 'google-client-id-web', value: googleClientId }
        { name: 'google-client-secret-web', value: googleClientSecret }
        { name: 'entra-client-id-web', value: entraClientId }
        { name: 'entra-client-secret-web', value: entraClientSecret }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${acrLoginServer}/dovetail-web:${imageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'API_URL', value: 'https://${apiApp.properties.configuration.ingress.fqdn}' }
            { name: 'NEXTAUTH_URL', value: 'https://${appName}-web.${environment.properties.defaultDomain}' }
            { name: 'NEXTAUTH_SECRET', secretRef: 'nextauth-secret-web' }
            { name: 'OAUTH_PROVIDER', value: oauthProvider }
            { name: 'GOOGLE_CLIENT_ID', secretRef: 'google-client-id-web' }
            { name: 'GOOGLE_CLIENT_SECRET', secretRef: 'google-client-secret-web' }
            { name: 'ENTRA_CLIENT_ID', secretRef: 'entra-client-id-web' }
            { name: 'ENTRA_CLIENT_SECRET', secretRef: 'entra-client-secret-web' }
            { name: 'ENTRA_TENANT_ID', value: entraTenantId }
            { name: 'AUTH_TRUST_HOST', value: 'true' }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

@description('API app external FQDN')
output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'

@description('Web app external FQDN')
output webUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
