using 'main.bicep'

// Required — change these before deploying
param appName = 'dovetail'
param location = 'eastus'
param postgresAdminPassword = '<CHANGE-ME: strong random password>'
param nextAuthSecret = '<CHANGE-ME: openssl rand -base64 32>'

// OAuth — fill in the provider you're using
param oauthProvider = 'google'
param googleClientId = ''
param googleClientSecret = ''
param entraClientId = ''
param entraClientSecret = ''
param entraTenantId = ''

// Embeddings (optional — leave empty to skip semantic search)
param embeddingProvider = 'openai'
param embeddingModel = 'text-embedding-3-small'
param openaiApiKey = ''
param embeddingBaseUrl = ''

// RAG API key
param ragApiKey = '<CHANGE-ME: openssl rand -base64 32>'

// Image tag (set to a specific tag for production deploys)
param imageTag = 'latest'
