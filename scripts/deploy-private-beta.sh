#!/usr/bin/env bash

set -Eeuo pipefail

MODE="${1:-verify}"

RESOURCE_GROUP="studysnap-private-beta-rg"
ACR_NAME="studysnapeddbbe76"

BACKEND_APP="studysnap-backend"
FRONTEND_APP="studysnap-frontend"

BACKEND_REPOSITORY="studysnap-backend"
FRONTEND_REPOSITORY="studysnap-frontend"

ROOT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.." &&
  pwd
)"

cd "$ROOT_DIR"

fail() {
  echo
  echo "STOP: $1"
  exit 1
}

case "$MODE" in
  verify|frontend|all)
    ;;
  *)
    echo "Usage:"
    echo "  scripts/deploy-private-beta.sh verify"
    echo "  scripts/deploy-private-beta.sh frontend"
    echo "  scripts/deploy-private-beta.sh all"
    exit 1
    ;;
esac

echo "=================================================="
echo " STUDYSNAP PRIVATE BETA"
echo " Mode: $MODE"
echo "=================================================="

echo
echo "===== AZURE ACCOUNT ====="

az account show \
  --query '{
    subscription:name,
    subscriptionId:id,
    tenantId:tenantId
  }' \
  --output table

echo
echo "===== RESOLVE CLOUD ADDRESSES ====="

ACR_LOGIN_SERVER="$(
  az acr show \
    --name "$ACR_NAME" \
    --query loginServer \
    --output tsv
)"

BACKEND_FQDN="$(
  az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$BACKEND_APP" \
    --query properties.configuration.ingress.fqdn \
    --output tsv
)"

FRONTEND_FQDN="$(
  az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FRONTEND_APP" \
    --query properties.configuration.ingress.fqdn \
    --output tsv
)"

[ -n "$ACR_LOGIN_SERVER" ] \
  || fail "ACR login server is missing."

[ -n "$BACKEND_FQDN" ] \
  || fail "Backend address is missing."

[ -n "$FRONTEND_FQDN" ] \
  || fail "Frontend address is missing."

BACKEND_URL="https://${BACKEND_FQDN}"
BACKEND_WS_URL="wss://${BACKEND_FQDN}"
FRONTEND_URL="https://${FRONTEND_FQDN}"

echo "Backend:   $BACKEND_URL"
echo "WebSocket: $BACKEND_WS_URL"
echo "Frontend:  $FRONTEND_URL"

show_state() {
  echo
  echo "===== BACKEND STATE ====="

  az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$BACKEND_APP" \
    --query '{
      image:properties.template.containers[0].image,
      minReplicas:properties.template.scale.minReplicas,
      maxReplicas:properties.template.scale.maxReplicas,
      latestRevision:properties.latestRevisionName,
      readyRevision:properties.latestReadyRevisionName,
      provisioning:properties.provisioningState
    }' \
    --output table

  echo
  echo "===== FRONTEND STATE ====="

  az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FRONTEND_APP" \
    --query '{
      image:properties.template.containers[0].image,
      minReplicas:properties.template.scale.minReplicas,
      maxReplicas:properties.template.scale.maxReplicas,
      latestRevision:properties.latestRevisionName,
      readyRevision:properties.latestReadyRevisionName,
      provisioning:properties.provisioningState
    }' \
    --output table
}

verify_health() {
  echo
  echo "===== PUBLIC CONNECTION TESTS ====="

  local fake_email
  local backend_http
  local frontend_http
  local direct_auth_http
  local proxy_auth_http

  fake_email="studysnap-check-$(date +%s)@example.com"

  backend_http="$(
    curl \
      --silent \
      --show-error \
      --location \
      --connect-timeout 15 \
      --max-time 45 \
      --output /tmp/studysnap-health-check.json \
      --write-out '%{http_code}' \
      "${BACKEND_URL}/health"
  )"

  frontend_http="$(
    curl \
      --silent \
      --show-error \
      --location \
      --connect-timeout 15 \
      --max-time 45 \
      --output /tmp/studysnap-login-check.html \
      --write-out '%{http_code}' \
      "${FRONTEND_URL}/login"
  )"

  direct_auth_http="$(
    curl \
      --silent \
      --show-error \
      --location \
      --connect-timeout 15 \
      --max-time 45 \
      --request POST \
      --header 'Content-Type: application/json' \
      --data "{
        \"email\":\"${fake_email}\",
        \"password\":\"not-a-real-password\"
      }" \
      --output /tmp/studysnap-direct-auth-check.json \
      --write-out '%{http_code}' \
      "${BACKEND_URL}/api/auth/login"
  )"

  proxy_auth_http="$(
    curl \
      --silent \
      --show-error \
      --location \
      --connect-timeout 15 \
      --max-time 45 \
      --request POST \
      --header 'Content-Type: application/json' \
      --data "{
        \"email\":\"${fake_email}\",
        \"password\":\"not-a-real-password\"
      }" \
      --output /tmp/studysnap-proxy-auth-check.json \
      --write-out '%{http_code}' \
      "${FRONTEND_URL}/backend/api/auth/login"
  )"

  echo "Backend health:       $backend_http"
  echo "Frontend login page:  $frontend_http"
  echo "Direct login route:   $direct_auth_http"
  echo "Frontend login proxy: $proxy_auth_http"

  [ "$backend_http" = "200" ] \
    || fail "Backend health failed."

  case "$frontend_http" in
    2*|3*)
      ;;
    *)
      fail "Frontend login page failed."
      ;;
  esac

  [ "$direct_auth_http" = "401" ] \
    || fail "Direct authentication route failed."

  [ "$proxy_auth_http" = "401" ] \
    || fail "Frontend authentication proxy failed."

  echo
  echo "SUCCESS: Frontend, backend and database are connected."
}

wait_for_app() {
  local app_name="$1"
  local expected_image="$2"
  local ready=0

  for attempt in $(seq 1 36); do
    local image
    local latest_revision
    local ready_revision
    local provisioning

    image="$(
      az containerapp show \
        --resource-group "$RESOURCE_GROUP" \
        --name "$app_name" \
        --query properties.template.containers[0].image \
        --output tsv
    )"

    latest_revision="$(
      az containerapp show \
        --resource-group "$RESOURCE_GROUP" \
        --name "$app_name" \
        --query properties.latestRevisionName \
        --output tsv
    )"

    ready_revision="$(
      az containerapp show \
        --resource-group "$RESOURCE_GROUP" \
        --name "$app_name" \
        --query properties.latestReadyRevisionName \
        --output tsv
    )"

    provisioning="$(
      az containerapp show \
        --resource-group "$RESOURCE_GROUP" \
        --name "$app_name" \
        --query properties.provisioningState \
        --output tsv
    )"

    echo
    echo "App:          $app_name"
    echo "Attempt:      $attempt/36"
    echo "Image:        $image"
    echo "Latest:       $latest_revision"
    echo "Ready:        $ready_revision"
    echo "Provisioning: $provisioning"

    if \
      [ "$image" = "$expected_image" ] && \
      [ -n "$latest_revision" ] && \
      [ "$latest_revision" = "$ready_revision" ] && \
      [ "$provisioning" = "Succeeded" ]
    then
      ready=1
      break
    fi

    sleep 10
  done

  [ "$ready" -eq 1 ] \
    || fail "$app_name did not become ready."
}

if [ "$MODE" = "verify" ]; then
  show_state
  verify_health

  echo
  echo "SUCCESS: Current StudySnap cloud deployment is healthy."
  exit 0
fi

if [ -n "$(git status --porcelain)" ]; then
  git status --short
  fail "Commit changes before deployment."
fi

CURRENT_SHA="$(git rev-parse --short HEAD)"

if [ "$MODE" = "all" ]; then
  echo
  echo "===== BUILD BACKEND ====="

  BACKEND_IMAGE="${ACR_LOGIN_SERVER}/${BACKEND_REPOSITORY}:beta-${CURRENT_SHA}"

  az acr build \
    --registry "$ACR_NAME" \
    --image "${BACKEND_REPOSITORY}:beta-${CURRENT_SHA}" \
    backend

  echo
  echo "===== DEPLOY BACKEND ====="

  az containerapp update \
    --resource-group "$RESOURCE_GROUP" \
    --name "$BACKEND_APP" \
    --image "$BACKEND_IMAGE" \
    --min-replicas 1 \
    --max-replicas 1 \
    --output none

  wait_for_app \
    "$BACKEND_APP" \
    "$BACKEND_IMAGE"
fi

echo
echo "===== BUILD FRONTEND ====="

FRONTEND_IMAGE="${ACR_LOGIN_SERVER}/${FRONTEND_REPOSITORY}:beta-${CURRENT_SHA}"

az acr build \
  --registry "$ACR_NAME" \
  --image "${FRONTEND_REPOSITORY}:beta-${CURRENT_SHA}" \
  --build-arg "BACKEND_INTERNAL_URL=${BACKEND_URL}" \
  --build-arg "NEXT_PUBLIC_API_BASE_URL=${BACKEND_URL}" \
  --build-arg "NEXT_PUBLIC_WS_BASE_URL=${BACKEND_WS_URL}" \
  frontend

echo
echo "===== DEPLOY FRONTEND ====="

az containerapp update \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FRONTEND_APP" \
  --image "$FRONTEND_IMAGE" \
  --min-replicas 1 \
  --max-replicas 1 \
  --set-env-vars \
    "BACKEND_INTERNAL_URL=${BACKEND_URL}" \
    "NEXT_PUBLIC_API_BASE_URL=${BACKEND_URL}" \
    "NEXT_PUBLIC_WS_BASE_URL=${BACKEND_WS_URL}" \
  --output none

wait_for_app \
  "$FRONTEND_APP" \
  "$FRONTEND_IMAGE"

show_state
verify_health

echo
echo "=================================================="
echo " SUCCESS: STUDYSNAP DEPLOYMENT COMPLETE"
echo "=================================================="
echo
echo "Commit: $CURRENT_SHA"
echo "Phone:  $FRONTEND_URL"
