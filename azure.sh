#!/usr/bin/env bash
set -euo pipefail

# Fixed values based on your info
SUBSCRIPTION_ID="6da7fbc7-6f09-4eaf-9812-9aaa5a6b07a5"
RESOURCE_GROUP="iot-fault-rg"
LOCATION="centralindia"
ACR_NAME="myfaulttolerantappacr"

LOG_WS_NAME="log-iot-fault"
CONTAINERAPPS_ENV="env-iot-fault"

AUTH_APP_NAME="auth-service"
GATEWAY_APP_NAME="gateway-service"
WORKER_APP_NAME="worker-service"
FRONTEND_APP_NAME="frontend-web"

GITHUB_SP_NAME="sp-github-iot-fault"

echo ">>> az login (browser/device flow)…"
az login --use-device-code

echo ">>> Set subscription"
az account set --subscription "$SUBSCRIPTION_ID"

echo ">>> Create resource group (if not exists): $RESOURCE_GROUP"
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION"

echo ">>> Create Log Analytics workspace: $LOG_WS_NAME"
az monitor log-analytics workspace create \
  --resource-group "$RESOURCE_GROUP" \
  --workspace-name "$LOG_WS_NAME" \
  --location "$LOCATION"

LOG_WS_ID=$(az monitor log-analytics workspace show \
  --resource-group "$RESOURCE_GROUP" \
  --workspace-name "$LOG_WS_NAME" \
  --query id -o tsv)

LOG_WS_KEY=$(az monitor log-analytics workspace get-shared-keys \
  --resource-group "$RESOURCE_GROUP" \
  --workspace-name "$LOG_WS_NAME" \
  --query primarySharedKey -o tsv)

echo "Log workspace ID:  $LOG_WS_ID"
echo "Log workspace KEY: (hidden)"

echo ">>> Install/upgrade Container Apps CLI extension"
az extension add --name containerapp --upgrade

echo ">>> Register providers (if not already)"
az provider register --namespace Microsoft.Web     >/dev/null 2>&1 || true
az provider register --namespace Microsoft.App     >/dev/null 2>&1 || true
az provider register --namespace Microsoft.OperationalInsights >/dev/null 2>&1 || true
az provider register --namespace Microsoft.ContainerRegistry   >/dev/null 2>&1 || true

echo ">>> Create Container Apps Environment: $CONTAINERAPPS_ENV"
az containerapp env create \
  --name "$CONTAINERAPPS_ENV" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --logs-workspace-id "$LOG_WS_ID" \
  --logs-workspace-key "$LOG_WS_KEY"

echo ">>> Use existing ACR: $ACR_NAME"
ACR_LOGIN_SERVER=$(az acr show \
  --name "$ACR_NAME" \
  --query loginServer -o tsv)

echo "ACR login server: $ACR_LOGIN_SERVER"

echo ">>> Get ACR credentials (admin must be enabled on the registry)"
ACR_USERNAME=$(az acr credential show \
  --name "$ACR_NAME" \
  --query username -o tsv)

ACR_PASSWORD=$(az acr credential show \
  --name "$ACR_NAME" \
  --query passwords[0].value -o tsv)

echo ">>> Configure Container Apps Environment to pull from ACR"
az containerapp registry set \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CONTAINERAPPS_ENV" \
  --server "$ACR_LOGIN_SERVER" \
  --username "$ACR_USERNAME" \
  --password "$ACR_PASSWORD"

echo ">>> Create initial Container Apps (placeholder images)"

# auth (internal, port 9001)
az containerapp create \
  --name "$AUTH_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CONTAINERAPPS_ENV" \
  --image "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest" \
  --target-port 9001 \
  --ingress internal \
  --min-replicas 1 \
  --max-replicas 1

# gateway (internal, port 9002)
az containerapp create \
  --name "$GATEWAY_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CONTAINERAPPS_ENV" \
  --image "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest" \
  --target-port 9002 \
  --ingress internal \
  --min-replicas 1 \
  --max-replicas 1

# worker (no ingress)
az containerapp create \
  --name "$WORKER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CONTAINERAPPS_ENV" \
  --image "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest" \
  --ingress disabled \
  --min-replicas 1 \
  --max-replicas 1

# frontend (public, port 80)
FRONTEND_FQDN=$(
  az containerapp create \
    --name "$FRONTEND_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$CONTAINERAPPS_ENV" \
    --image "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest" \
    --target-port 80 \
    --ingress external \
    --min-replicas 1 \
    --max-replicas 1 \
    --query properties.configuration.ingress.fqdn -o tsv
)

echo ">>> Frontend will be reachable at: https://$FRONTEND_FQDN"

echo ">>> Create Service Principal for GitHub Actions (Contributor on this resource group)"
SP_JSON=$(az ad sp create-for-rbac \
  --name "$GITHUB_SP_NAME" \
  --role contributor \
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP" \
  --sdk-auth)

echo ""
echo "====================================================================="
echo "  COPY THIS JSON INTO A GITHUB SECRET NAMED: AZURE_CREDENTIALS"
echo "  (GitHub repo: 2023TM93712/Fault_tolerance_project)"
echo "====================================================================="
echo "$SP_JSON"
echo "====================================================================="

echo ""
echo "Also note these values for your GitHub workflow env (already hardcoded):"
echo "  RESOURCE_GROUP      = $RESOURCE_GROUP"
echo "  CONTAINERAPPS_ENV   = $CONTAINERAPPS_ENV"
echo "  LOCATION            = $LOCATION"
echo "  ACR_NAME            = $ACR_NAME"
echo "  ACR_LOGIN_SERVER    = $ACR_LOGIN_SERVER"
echo "  AUTH_APP_NAME       = $AUTH_APP_NAME"
echo "  GATEWAY_APP_NAME    = $GATEWAY_APP_NAME"
echo "  WORKER_APP_NAME     = $WORKER_APP_NAME"
echo "  FRONTEND_APP_NAME   = $FRONTEND_APP_NAME"
echo ""
echo "Done. Next: create GitHub secret AZURE_CREDENTIALS and add the workflow file."
