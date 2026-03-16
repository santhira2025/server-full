#!/usr/bin/env bash
# ============================================================
# ARGOCD DEPLOY SCRIPT
# Usage:
#   ./09-deploy.sh           # Deploy all
#   ./09-deploy.sh destroy   # Delete all
#   ./09-deploy.sh status    # Check status
#   ./09-deploy.sh password  # Get/reset admin password
# ============================================================
set -euo pipefail

ACTION="${1:-deploy}"
NAMESPACE="argocd"
SCRIPT_DIR="$(dirname "$0")"
LE_DIR="$(dirname "$0")/.."

echo "============================================================"
echo " LinkedEye ArgoCD Deployment"
echo " Namespace: ${NAMESPACE}  |  Action: ${ACTION}"
echo "============================================================"

if [ "${ACTION}" = "status" ]; then
  kubectl get pods -n ${NAMESPACE} -o wide
  echo ""; kubectl get svc -n ${NAMESPACE}
  echo ""; kubectl get ingress -n ${NAMESPACE}
  echo "  ArgoCD URL: https://ls-argocd.finspot.in"
  exit 0
fi

if [ "${ACTION}" = "password" ]; then
  echo "Current admin password hash:"
  kubectl get secret argocd-secret -n ${NAMESPACE} \
    -o jsonpath='{.data.admin\.password}' | base64 -d
  echo ""
  echo "To reset password, update argocd-secret and restart argocd-server"
  exit 0
fi

if [ "${ACTION}" = "destroy" ]; then
  read -p "Delete ArgoCD namespace? (yes/no): " CONFIRM
  [ "${CONFIRM}" = "yes" ] && kubectl delete namespace ${NAMESPACE} --ignore-not-found || echo "Aborted."
  exit 0
fi

echo "[1/7] Creating namespace..."
kubectl apply -f "${SCRIPT_DIR}/01-namespace.yaml"

echo "[2/7] Creating TLS secret..."
bash "${LE_DIR}/07-jenkins/create-tls-secret.sh" 2>/dev/null || true

echo "[3/7] Applying RBAC..."
kubectl apply -f "${SCRIPT_DIR}/02-rbac.yaml"

echo "[4/7] Applying ConfigMaps and Secrets..."
kubectl apply -f "${SCRIPT_DIR}/03-configmap.yaml"

echo "[5/7] Deploying Redis..."
kubectl apply -f "${SCRIPT_DIR}/04-redis.yaml"
kubectl rollout status deployment/argocd-redis -n ${NAMESPACE} --timeout=60s

echo "[6/7] Deploying ArgoCD components..."
kubectl apply -f "${SCRIPT_DIR}/05-repo-server.yaml"
kubectl apply -f "${SCRIPT_DIR}/06-app-controller.yaml"
kubectl apply -f "${SCRIPT_DIR}/07-server.yaml"

echo "[7/7] Applying Ingress..."
kubectl apply -f "${SCRIPT_DIR}/08-ingress.yaml"

echo ""
echo "Waiting for ArgoCD server to be ready..."
kubectl rollout status deployment/argocd-server -n ${NAMESPACE} --timeout=300s || true
echo ""
kubectl get pods -n ${NAMESPACE}
echo ""
echo "============================================================"
echo "  ArgoCD URL:      https://ls-argocd.finspot.in"
echo "  Admin user:      admin"
echo "  Admin password:  ArgoCD@FinSpot2025!"
echo ""
echo "  CLI login:"
echo "    argocd login ls-argocd.finspot.in --username admin"
echo ""
echo "  Post-deploy:"
echo "    1. Login to UI → Settings → Clusters → add EKS cluster"
echo "    2. Settings → Repositories → add Harbor/GitLab repos"
echo "    3. Update Keycloak OIDC client secret in argocd-secret"
echo "============================================================"
