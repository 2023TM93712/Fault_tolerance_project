# Azure Container Apps Deployment Template

# Prerequisites:
# - Azure CLI installed and logged in
# - Azure Container Apps extension installed: az extension add --name containerapp

# Variables - Update these values
RESOURCE_GROUP="fault-tolerant-rg"
LOCATION="eastus"
ENVIRONMENT_NAME="fault-tolerant-env"
CONTAINER_REGISTRY="youracr"
REDIS_NAME="fault-tolerant-redis"
LOG_ANALYTICS_WORKSPACE="fault-tolerant-logs"

# Create resource group
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION

# Create Log Analytics workspace
az monitor log-analytics workspace create \
  --resource-group $RESOURCE_GROUP \
  --workspace-name $LOG_ANALYTICS_WORKSPACE \
  --location $LOCATION

# Get Log Analytics workspace details
LOG_ANALYTICS_WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group $RESOURCE_GROUP \
  --workspace-name $LOG_ANALYTICS_WORKSPACE \
  --query customerId \
  --output tsv)

LOG_ANALYTICS_WORKSPACE_KEY=$(az monitor log-analytics workspace get-shared-keys \
  --resource-group $RESOURCE_GROUP \
  --workspace-name $LOG_ANALYTICS_WORKSPACE \
  --query primarySharedKey \
  --output tsv)

# Create Container Apps environment
az containerapp env create \
  --name $ENVIRONMENT_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --logs-workspace-id $LOG_ANALYTICS_WORKSPACE_ID \
  --logs-workspace-key $LOG_ANALYTICS_WORKSPACE_KEY

# Create Redis Cache
az redis create \
  --name $REDIS_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Basic \
  --vm-size c0

# Get Redis connection string
REDIS_CONNECTION=$(az redis show-access-keys \
  --name $REDIS_NAME \
  --resource-group $RESOURCE_GROUP \
  --query primaryKey \
  --output tsv)

REDIS_HOST=$(az redis show \
  --name $REDIS_NAME \
  --resource-group $RESOURCE_GROUP \
  --query hostName \
  --output tsv)

REDIS_URL="redis://:$REDIS_CONNECTION@$REDIS_HOST:6380"

# Deploy C++ Service
az containerapp create \
  --name cpp-service \
  --resource-group $RESOURCE_GROUP \
  --environment $ENVIRONMENT_NAME \
  --image $CONTAINER_REGISTRY.azurecr.io/cpp-service:latest \
  --target-port 8080 \
  --ingress internal \
  --min-replicas 1 \
  --max-replicas 5 \
  --cpu 0.5 \
  --memory 1Gi \
  --env-vars "PORT=8080" "REDIS_URL=$REDIS_URL" \
  --registry-server $CONTAINER_REGISTRY.azurecr.io

# Deploy Function Simulator
az containerapp create \
  --name function-sim \
  --resource-group $RESOURCE_GROUP \
  --environment $ENVIRONMENT_NAME \
  --image $CONTAINER_REGISTRY.azurecr.io/function-sim:latest \
  --target-port 7071 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 5 \
  --cpu 0.5 \
  --memory 1Gi \
  --env-vars "PORT=7071" \
              "CPP_SERVICE_URL=https://cpp-service" \
              "REDIS_URL=$REDIS_URL" \
              "MAX_RETRIES=3" \
              "BASE_DELAY_MS=100" \
              "NODE_ENV=production" \
  --registry-server $CONTAINER_REGISTRY.azurecr.io

# Get Function URL
FUNCTION_URL=$(az containerapp show \
  --name function-sim \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn \
  --output tsv)

# Deploy Frontend
az containerapp create \
  --name frontend \
  --resource-group $RESOURCE_GROUP \
  --environment $ENVIRONMENT_NAME \
  --image $CONTAINER_REGISTRY.azurecr.io/frontend:latest \
  --target-port 3000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 3 \
  --cpu 0.25 \
  --memory 0.5Gi \
  --env-vars "REACT_APP_FUNCTION_URL=https://$FUNCTION_URL" \
  --registry-server $CONTAINER_REGISTRY.azurecr.io

# Get Frontend URL
FRONTEND_URL=$(az containerapp show \
  --name frontend \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn \
  --output tsv)

echo "Deployment completed!"
echo "Frontend URL: https://$FRONTEND_URL"
echo "Function URL: https://$FUNCTION_URL"

# Optional: Set up custom domain and SSL certificate
# az containerapp hostname add \
#   --hostname your-domain.com \
#   --name frontend \
#   --resource-group $RESOURCE_GROUP

# Optional: Configure auto-scaling rules
az containerapp revision set-mode \
  --name cpp-service \
  --resource-group $RESOURCE_GROUP \
  --mode single

az containerapp revision set-mode \
  --name function-sim \
  --resource-group $RESOURCE_GROUP \
  --mode single