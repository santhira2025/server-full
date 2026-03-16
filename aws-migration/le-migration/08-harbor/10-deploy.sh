#!/usr/bin/env bash
# ============================================================
# HARBOR DEPLOY SCRIPT
# Usage:
#   ./11-deploy.sh           # Deploy all
#   ./11-deploy.sh destroy   # Delete all
#   ./11-deploy.sh status    # Check status
# ============================================================
set -euo pipefail

ACTION="${1:-deploy}"
NAMESPACE="harbor"
SCRIPT_DIR="$(dirname "$0")"
LE_DIR="$(dirname "$0")/.."

echo "============================================================"
echo " LinkedEye Harbor Deployment"
echo " Namespace: ${NAMESPACE}  |  Action: ${ACTION}"
echo "============================================================"

if [ "${ACTION}" = "status" ]; then
  kubectl get pods -n ${NAMESPACE} -o wide
  echo ""; kubectl get svc -n ${NAMESPACE}
  echo ""; kubectl get pvc -n ${NAMESPACE}
  echo ""; kubectl get ingress -n ${NAMESPACE}
  echo "  Harbor URL: https://le-harbor.finspot.in"
  exit 0
fi

if [ "${ACTION}" = "destroy" ]; then
  read -p "Delete Harbor namespace and ALL data? (yes/no): " CONFIRM
  [ "${CONFIRM}" = "yes" ] && kubectl delete namespace ${NAMESPACE} --ignore-not-found || echo "Aborted."
  exit 0
fi

echo "[1/8] Creating namespace..."
kubectl apply -f "${SCRIPT_DIR}/01-namespace.yaml"

echo "[2/8] Creating TLS secret..."
bash "${LE_DIR}/07-jenkins/create-tls-secret.sh" 2>/dev/null || true

echo "[3/8] Deploying PostgreSQL..."
kubectl apply -f "${SCRIPT_DIR}/02-postgres.yaml"
kubectl rollout status deployment/harbor-postgres -n ${NAMESPACE} --timeout=120s

echo "[4/8] Deploying Redis..."
kubectl apply -f "${SCRIPT_DIR}/03-redis.yaml"
kubectl rollout status deployment/harbor-redis -n ${NAMESPACE} --timeout=60s

echo "[5/8] Creating PVCs..."
kubectl apply -f "${SCRIPT_DIR}/04-pvc.yaml"

echo "[6/8] Applying ConfigMaps and Secrets..."
kubectl apply -f "${SCRIPT_DIR}/05-configmap.yaml"

echo "[7/8] Deploying Harbor components..."
kubectl apply -f "${SCRIPT_DIR}/06-harbor-core.yaml"
kubectl apply -f "${SCRIPT_DIR}/07-harbor-portal.yaml"
kubectl apply -f "${SCRIPT_DIR}/08-harbor-registry.yaml"
kubectl apply -f "${SCRIPT_DIR}/09-harbor-jobservice.yaml"

echo "[8/8] Applying Ingress..."
kubectl apply -f "${SCRIPT_DIR}/10-ingress.yaml"

echo ""
echo "============================================================"
echo " Waiting for Harbor to be ready..."
kubectl rollout status deployment/harbor-core -n ${NAMESPACE} --timeout=300s || true
kubectl rollout status deployment/harbor-portal -n ${NAMESPACE} --timeout=180s || true
echo ""
kubectl get pods -n ${NAMESPACE}
echo ""
echo "  Harbor URL:    https://le-harbor.finspot.in"
echo "  Admin user:    admin"
echo "  Admin pass:    (set in 05-configmap.yaml harbor-core-secret)"
echo "  Docker login:  docker login le-harbor.finspot.in"
echo "============================================================"
