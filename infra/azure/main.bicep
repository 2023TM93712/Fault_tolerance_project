# Azure Bicep Template for Fault-Tolerant Full-Stack Application

@description('Location for all resources')
param location string = resourceGroup().location

@description('Base name for resources')
param baseName string = 'fault-tolerant'

@description('Container registry name')
param containerRegistryName string

@description('Environment for deployment')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

// Variables
var resourcePrefix = '${baseName}-${environment}'
var logAnalyticsWorkspaceName = '${resourcePrefix}-logs'
var containerAppEnvironmentName = '${resourcePrefix}-env'
var redisName = '${resourcePrefix}-redis'
var appInsightsName = '${resourcePrefix}-insights'

// Log Analytics Workspace
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Application Insights
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
  }
}

// Redis Cache
resource redisCache 'Microsoft.Cache/redis@2023-04-01' = {
  name: redisName
  location: location
  properties: {
    sku: {
      name: environment == 'prod' ? 'Standard' : 'Basic'
      family: 'C'
      capacity: environment == 'prod' ? 1 : 0
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    redisConfiguration: {
      'maxmemory-policy': 'allkeys-lru'
    }
  }
}

// Container App Environment
resource containerAppEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerAppEnvironmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspace.properties.customerId
        sharedKey: logAnalyticsWorkspace.listKeys().primarySharedKey
      }
    }
  }
}

// C++ Service Container App
resource cppServiceApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${resourcePrefix}-cpp-service'
  location: location
  properties: {
    managedEnvironmentId: containerAppEnvironment.id
    configuration: {
      ingress: {
        external: false
        targetPort: 8080
        transport: 'http'
      }
      registries: [
        {
          server: '${containerRegistryName}.azurecr.io'
          identity: 'system'
        }
      ]
      secrets: [
        {
          name: 'redis-connection-string'
          value: '${redisCache.properties.hostName}:6380,password=${redisCache.listKeys().primaryKey},ssl=True,abortConnect=False'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'cpp-service'
          image: '${containerRegistryName}.azurecr.io/cpp-service:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'PORT'
              value: '8080'
            }
            {
              name: 'REDIS_URL'
              secretRef: 'redis-connection-string'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/healthz'
                port: 8080
              }
              initialDelaySeconds: 30
              periodSeconds: 10
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/healthz'
                port: 8080
              }
              initialDelaySeconds: 5
              periodSeconds: 5
            }
          ]
        }
      ]
      scale: {
        minReplicas: environment == 'prod' ? 2 : 1
        maxReplicas: environment == 'prod' ? 10 : 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '30'
              }
            }
          }
        ]
      }
    }
  }
}

// Function Simulator Container App
resource functionSimApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${resourcePrefix}-function-sim'
  location: location
  properties: {
    managedEnvironmentId: containerAppEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 7071
        transport: 'http'
        corsPolicy: {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'OPTIONS']
          allowedHeaders: ['*']
        }
      }
      registries: [
        {
          server: '${containerRegistryName}.azurecr.io'
          identity: 'system'
        }
      ]
      secrets: [
        {
          name: 'redis-connection-string'
          value: '${redisCache.properties.hostName}:6380,password=${redisCache.listKeys().primaryKey},ssl=True,abortConnect=False'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'function-sim'
          image: '${containerRegistryName}.azurecr.io/function-sim:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'PORT'
              value: '7071'
            }
            {
              name: 'CPP_SERVICE_URL'
              value: 'https://${cppServiceApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'REDIS_URL'
              secretRef: 'redis-connection-string'
            }
            {
              name: 'MAX_RETRIES'
              value: '3'
            }
            {
              name: 'BASE_DELAY_MS'
              value: '100'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/function/health'
                port: 7071
              }
              initialDelaySeconds: 30
              periodSeconds: 10
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/function/health'
                port: 7071
              }
              initialDelaySeconds: 10
              periodSeconds: 5
            }
          ]
        }
      ]
      scale: {
        minReplicas: environment == 'prod' ? 2 : 1
        maxReplicas: environment == 'prod' ? 10 : 5
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// Frontend Container App
resource frontendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${resourcePrefix}-frontend'
  location: location
  properties: {
    managedEnvironmentId: containerAppEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
      }
      registries: [
        {
          server: '${containerRegistryName}.azurecr.io'
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: '${containerRegistryName}.azurecr.io/frontend:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'REACT_APP_FUNCTION_URL'
              value: 'https://${functionSimApp.properties.configuration.ingress.fqdn}'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              initialDelaySeconds: 30
              periodSeconds: 10
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              initialDelaySeconds: 5
              periodSeconds: 5
            }
          ]
        }
      ]
      scale: {
        minReplicas: environment == 'prod' ? 2 : 1
        maxReplicas: environment == 'prod' ? 5 : 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}

// Outputs
output frontendUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}'
output functionUrl string = 'https://${functionSimApp.properties.configuration.ingress.fqdn}'
output redisHostName string = redisCache.properties.hostName
output appInsightsConnectionString string = appInsights.properties.ConnectionString