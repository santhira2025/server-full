#!/usr/bin/env bash
# ============================================================
# SHARED POSTGRESQL DEPLOY SCRIPT
# Single PostgreSQL for: Jenkins, Harbor, Keycloak, Vault,
#                        ArgoCD, Redmine, ITSM
# Usage:
#   ./07-deploy.sh           # Deploy
#   ./07-deploy.sh destroy   # Delete (DATA LOSS!)
#   ./07-deploy.sh status    # Check status
#   ./07-deploy.sh list-dbs  # List all databases
# ============================================================
set -euo pipefail

ACTION="${1:-deploy}"
NAMESPACE="le-postgres"
SCRIPT_DIR="$(dirname "$0")"

echo "============================================================"
echo " LinkedEye Shared PostgreSQL"
echo " Namespace: ${NAMESPACE}  |  Action: ${ACTION}"
echo "============================================================"

# ── STATUS ────────────────────────────────────────────────────
if [ "${ACTION}" = "status" ]; then
  echo ""
  echo "[Pods]"
  kubectl get pods -n ${NAMESPACE} -o wide
  echo ""
  echo "[PVC]"
  kubectl get pvc -n ${NAMESPACE}
  echo ""
  echo "[Service]"
  kubectl get svc -n ${NAMESPACE}
  echo ""
  echo "[DNS] Tools connect using:"
  echo "  le-postgres-svc.le-postgres.svc.cluster.local:5432"
  exit 0
fi

# ── LIST DBS ──────────────────────────────────────────────────
if [ "${ACTION}" = "list-dbs" ]; then
  PG_POD=$(kubectl get pod -n ${NAMESPACE} -l app=le-postgres -o jsonpath='{.items[0].metadata.name}')
  kubectl exec -n ${NAMESPACE} ${PG_POD} -- psql -U leadmin -c "\l"
  exit 0
fi

# ── DESTROY ───────────────────────────────────────────────────
if [ "${ACTION}" = "destroy" ]; then
  echo "WARNING: This will destroy ALL databases (Jenkins, Harbor, Keycloak...)"
  read -p "Type 'DELETE ALL' to confirm: " CONFIRM
  if [ "${CONFIRM}" = "DELETE ALL" ]; then
    kubectl delete namespace ${NAMESPACE} --ignore-not-found
    echo "Deleted."
  else
    echo "Aborted."
  fi
  exit 0
fi

# ── DEPLOY ────────────────────────────────────────────────────
echo "[1/5] Creating namespace..."
kubectl apply -f "${SCRIPT_DIR}/01-namespace.yaml"

echo "[2/5] Creating secrets..."
kubectl apply -f "${SCRIPT_DIR}/02-secret.yaml"

echo "[3/5] Creating init ConfigMap..."
kubectl apply -f "${SCRIPT_DIR}/03-init-configmap.yaml"

echo "[4/5] Creating PVC..."
kubectl apply -f "${SCRIPT_DIR}/04-pvc.yaml"

echo "[5/5] Deploying PostgreSQL..."
kubectl apply -f "${SCRIPT_DIR}/05-deployment.yaml"
kubectl apply -f "${SCRIPT_DIR}/06-service.yaml"

echo ""
echo "Waiting for PostgreSQL to be ready..."
kubectl rollout status deployment/le-postgres -n ${NAMESPACE} --timeout=180s

echo ""
echo "============================================================"
echo " PostgreSQL is READY"
echo ""
echo "  Host (from any namespace):"
echo "  le-postgres-svc.le-postgres.svc.cluster.local:5432"
echo ""
echo "  Databases created:"
echo "    jenkinsdb   → user: jenkins"
echo "    harbordb    → user: harbor"
echo "    keycloakdb  → user: keycloak"
echo "    vaultdb     → user: vault"
echo "    argocddb    → user: argocd"
echo "    redminedb   → user: redmine"
echo "    itsmdb      → user: itsm"
echo ""
echo "  Passwords: see 02-secret.yaml"
echo "  List DBs:  bash 07-deploy.sh list-dbs"
echo "============================================================"
