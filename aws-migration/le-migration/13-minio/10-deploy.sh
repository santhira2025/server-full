#!/usr/bin/env bash
# ============================================================
# MINIO DEPLOY SCRIPT
# S3-compatible object storage for LinkedEye
#
# Usage:
#   ./10-deploy.sh           # Deploy MinIO
#   ./10-deploy.sh destroy   # Delete all
#   ./10-deploy.sh status    # Check status
#   ./10-deploy.sh buckets   # List all buckets
#   ./10-deploy.sh init      # Re-run bucket init job
# ============================================================
set -euo pipefail

ACTION="${1:-deploy}"
NAMESPACE="minio"
SCRIPT_DIR="$(dirname "$0")"
LE_DIR="$(dirname "$0")/.."

echo "============================================================"
echo " LinkedEye MinIO (S3-compatible Storage)"
echo " Namespace: ${NAMESPACE}  |  Action: ${ACTION}"
echo "============================================================"

# ── STATUS ────────────────────────────────────────────────────
if [ "${ACTION}" = "status" ]; then
  kubectl get pods -n ${NAMESPACE} -o wide
  echo ""; kubectl get pvc -n ${NAMESPACE}
  echo ""; kubectl get svc -n ${NAMESPACE}
  echo ""; kubectl get ingress -n ${NAMESPACE}
  echo ""
  echo "  Console URL:  https://ls-minio.finspot.in"
  echo "  API URL:      https://ls-minio-api.finspot.in"
  exit 0
fi

# ── BUCKETS ───────────────────────────────────────────────────
if [ "${ACTION}" = "buckets" ]; then
  MC_POD=$(kubectl run mc-tmp --image=quay.io/minio/mc:latest \
    --restart=Never --rm -it -n ${NAMESPACE} \
    --env="MC_HOST_local=http://minioadmin:Minio@FinSpot2025!@minio-api-svc:9000" \
    --command -- mc ls local 2>/dev/null || true)
  exit 0
fi

# ── INIT ──────────────────────────────────────────────────────
if [ "${ACTION}" = "init" ]; then
  echo "Re-running bucket init job..."
  kubectl delete job minio-init -n ${NAMESPACE} --ignore-not-found
  kubectl apply -f "${SCRIPT_DIR}/08-init-job.yaml"
  kubectl wait --for=condition=complete job/minio-init -n ${NAMESPACE} --timeout=120s
  echo "Init job complete."
  exit 0
fi

# ── DESTROY ───────────────────────────────────────────────────
if [ "${ACTION}" = "destroy" ]; then
  echo "WARNING: ALL stored data will be deleted!"
  read -p "Type 'DELETE MINIO' to confirm: " CONFIRM
  [ "${CONFIRM}" = "DELETE MINIO" ] && kubectl delete namespace ${NAMESPACE} --ignore-not-found || echo "Aborted."
  exit 0
fi

# ── DEPLOY ────────────────────────────────────────────────────
echo "[1/7] Creating namespace..."
kubectl apply -f "${SCRIPT_DIR}/01-namespace.yaml"

echo "[2/7] Creating TLS secrets..."
bash "${LE_DIR}/07-jenkins/create-tls-secret.sh" 2>/dev/null || true

echo "[3/7] Creating secrets and configmap..."
kubectl apply -f "${SCRIPT_DIR}/02-secret.yaml"
kubectl apply -f "${SCRIPT_DIR}/04-configmap.yaml"

echo "[4/7] Creating PVC (500Gi)..."
kubectl apply -f "${SCRIPT_DIR}/03-pvc.yaml"

echo "[5/7] Deploying MinIO..."
kubectl apply -f "${SCRIPT_DIR}/05-deployment.yaml"
kubectl apply -f "${SCRIPT_DIR}/06-service.yaml"
kubectl apply -f "${SCRIPT_DIR}/09-networkpolicy.yaml"

echo "[6/7] Applying Ingress..."
kubectl apply -f "${SCRIPT_DIR}/07-ingress.yaml"

echo "Waiting for MinIO to be ready..."
kubectl rollout status deployment/minio -n ${NAMESPACE} --timeout=180s

echo "[7/7] Running bucket init job..."
kubectl apply -f "${SCRIPT_DIR}/08-init-job.yaml"
kubectl wait --for=condition=complete job/minio-init -n ${NAMESPACE} --timeout=120s || \
  echo "Init job still running — check: kubectl logs -n minio job/minio-init"

echo ""
kubectl get pods -n ${NAMESPACE}
echo ""
echo "============================================================"
echo "  MinIO Console:   https://ls-minio.finspot.in"
echo "  MinIO S3 API:    https://ls-minio-api.finspot.in"
echo "  Admin user:      minioadmin"
echo "  Admin pass:      Minio@FinSpot2025!"
echo ""
echo "  Buckets created:"
echo "    jenkins-artifacts  → Jenkins CI/CD builds"
echo "    velero-backups     → Kubernetes cluster backups"
echo "    harbor-registry    → Container image storage"
echo "    grafana-snapshots  → Dashboard snapshots"
echo "    linkedeye-logs     → Platform logs (90-day retention)"
echo ""
echo "  S3 endpoint for tools:"
echo "    http://minio-api-svc.minio.svc.cluster.local:9000"
echo ""
echo "  Cloudflare DNS (add 2 records):"
echo "    ls-minio.finspot.in     → CNAME → linkedeye-tools-alb-..."
echo "    ls-minio-api.finspot.in → CNAME → linkedeye-tools-alb-..."
echo "============================================================"
