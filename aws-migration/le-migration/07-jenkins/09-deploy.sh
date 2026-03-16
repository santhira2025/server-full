#!/usr/bin/env bash
# ============================================================
# JENKINS + POSTGRESQL DEPLOY SCRIPT
# Deploys Jenkins with PostgreSQL to EKS namespace: jenkins
#
# Usage:
#   ./10-deploy.sh           # Deploy all
#   ./10-deploy.sh destroy   # Delete all resources
#   ./10-deploy.sh status    # Check status
# ============================================================
set -euo pipefail

ACTION="${1:-deploy}"
NAMESPACE="jenkins"
SCRIPT_DIR="$(dirname "$0")"

echo "============================================================"
echo " LinkedEye Jenkins Deployment"
echo " Namespace: ${NAMESPACE}"
echo " Action: ${ACTION}"
echo "============================================================"

# ── STATUS ────────────────────────────────────────────────────
if [ "${ACTION}" = "status" ]; then
  echo ""
  echo "[STATUS] Pods:"
  kubectl get pods -n ${NAMESPACE} -o wide
  echo ""
  echo "[STATUS] Services:"
  kubectl get svc -n ${NAMESPACE}
  echo ""
  echo "[STATUS] PVCs:"
  kubectl get pvc -n ${NAMESPACE}
  echo ""
  echo "[STATUS] Ingress:"
  kubectl get ingress -n ${NAMESPACE}
  echo ""
  echo "[STATUS] Jenkins URL:"
  echo "  https://jenkins.finspot.in"
  exit 0
fi

# ── DESTROY ───────────────────────────────────────────────────
if [ "${ACTION}" = "destroy" ]; then
  echo ""
  read -p "WARNING: This will delete Jenkins and all data. Continue? (yes/no): " CONFIRM
  if [ "${CONFIRM}" != "yes" ]; then
    echo "Aborted."
    exit 0
  fi
  kubectl delete namespace ${NAMESPACE} --ignore-not-found
  echo "Jenkins namespace deleted."
  exit 0
fi

# ── DEPLOY ────────────────────────────────────────────────────
echo ""
echo "[1/7] Creating namespace..."
kubectl apply -f "${SCRIPT_DIR}/01-namespace.yaml"

echo "[2/7] Applying RBAC..."
kubectl apply -f "${SCRIPT_DIR}/02-rbac.yaml"

echo "[3/7] Creating PVCs..."
kubectl apply -f "${SCRIPT_DIR}/03-pvc.yaml"

echo "[4/7] Deploying PostgreSQL..."
kubectl apply -f "${SCRIPT_DIR}/04-postgres.yaml"
echo "      Waiting for PostgreSQL to be ready..."
kubectl rollout status deployment/jenkins-postgres -n ${NAMESPACE} --timeout=120s

echo "[5/7] Applying ConfigMap and Secrets..."
kubectl apply -f "${SCRIPT_DIR}/05-configmap.yaml"

echo "[6/7] Deploying Jenkins..."
kubectl apply -f "${SCRIPT_DIR}/06-deployment.yaml"
kubectl apply -f "${SCRIPT_DIR}/07-service.yaml"
kubectl apply -f "${SCRIPT_DIR}/09-networkpolicy.yaml"

echo "[7/7] Applying Ingress..."
kubectl apply -f "${SCRIPT_DIR}/08-ingress.yaml"

echo ""
echo "============================================================"
echo "[DONE] Jenkins deployment submitted"
echo ""
echo "  Waiting for Jenkins to be ready (may take 2-3 min)..."
kubectl rollout status deployment/jenkins -n ${NAMESPACE} --timeout=300s || true
echo ""
echo "  Pods:"
kubectl get pods -n ${NAMESPACE}
echo ""
echo "  Jenkins URL:   https://jenkins.finspot.in"
echo "  Admin user:    admin"
echo "  Admin pass:    (set in 05-configmap.yaml jenkins-secrets)"
echo ""
echo "  To check logs:"
echo "    kubectl logs -n jenkins deployment/jenkins -f"
echo "    kubectl logs -n jenkins deployment/jenkins-postgres -f"
echo "============================================================"
