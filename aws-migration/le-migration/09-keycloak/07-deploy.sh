#!/usr/bin/env bash
# ============================================================
# KEYCLOAK DEPLOY SCRIPT
# Usage:
#   ./08-deploy.sh           # Deploy all
#   ./08-deploy.sh destroy   # Delete all
#   ./08-deploy.sh status    # Check status
# ============================================================
set -euo pipefail

ACTION="${1:-deploy}"
NAMESPACE="keycloak"
SCRIPT_DIR="$(dirname "$0")"
LE_DIR="$(dirname "$0")/.."

echo "============================================================"
echo " LinkedEye Keycloak Deployment"
echo " Namespace: ${NAMESPACE}  |  Action: ${ACTION}"
echo "============================================================"

if [ "${ACTION}" = "status" ]; then
  kubectl get pods -n ${NAMESPACE} -o wide
  echo ""; kubectl get svc -n ${NAMESPACE}
  echo ""; kubectl get pvc -n ${NAMESPACE}
  echo ""; kubectl get ingress -n ${NAMESPACE}
  echo "  Keycloak URL:    https://le-keycloak.finspot.in"
  echo "  Admin Console:   https://le-keycloak.finspot.in/admin"
  exit 0
fi

if [ "${ACTION}" = "destroy" ]; then
  read -p "Delete Keycloak namespace and ALL data? (yes/no): " CONFIRM
  [ "${CONFIRM}" = "yes" ] && kubectl delete namespace ${NAMESPACE} --ignore-not-found || echo "Aborted."
  exit 0
fi

echo "[1/6] Creating namespace..."
kubectl apply -f "${SCRIPT_DIR}/01-namespace.yaml"

echo "[2/6] Creating TLS secret..."
bash "${LE_DIR}/07-jenkins/create-tls-secret.sh" 2>/dev/null || true

echo "[3/6] Deploying PostgreSQL..."
kubectl apply -f "${SCRIPT_DIR}/02-postgres.yaml"
kubectl rollout status deployment/keycloak-postgres -n ${NAMESPACE} --timeout=120s

echo "[4/6] Applying ConfigMaps and Secrets..."
kubectl apply -f "${SCRIPT_DIR}/03-configmap.yaml"

echo "[5/6] Deploying Keycloak..."
kubectl apply -f "${SCRIPT_DIR}/04-deployment.yaml"
kubectl apply -f "${SCRIPT_DIR}/05-service.yaml"
kubectl apply -f "${SCRIPT_DIR}/07-networkpolicy.yaml"

echo "[6/6] Applying Ingress..."
kubectl apply -f "${SCRIPT_DIR}/06-ingress.yaml"

echo ""
echo "============================================================"
echo " Waiting for Keycloak to start (may take 3-5 min)..."
kubectl rollout status deployment/keycloak -n ${NAMESPACE} --timeout=360s || true
echo ""
kubectl get pods -n ${NAMESPACE}
echo ""
echo "  Keycloak URL:     https://le-keycloak.finspot.in"
echo "  Admin Console:    https://le-keycloak.finspot.in/admin"
echo "  Admin user:       admin"
echo "  Admin pass:       (set in 03-configmap.yaml keycloak-secret)"
echo ""
echo "  Post-deploy:"
echo "    1. Login to admin console"
echo "    2. Create realm: linkedeye"
echo "    3. Add OIDC clients: jenkins, argocd, harbor, grafana"
echo "============================================================"
