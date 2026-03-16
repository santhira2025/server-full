#!/usr/bin/env bash
# ============================================================
# VAULT DEPLOY SCRIPT
# Usage:
#   ./09-deploy.sh           # Deploy Vault
#   ./09-deploy.sh destroy   # Delete all
#   ./09-deploy.sh status    # Check status
#   ./09-deploy.sh init      # Initialize Vault (first time)
#   ./09-deploy.sh unseal    # Unseal Vault
#   ./09-deploy.sh setup     # Full post-init setup (policies, secrets engine)
# ============================================================
set -euo pipefail

ACTION="${1:-deploy}"
NAMESPACE="vault"
SCRIPT_DIR="$(dirname "$0")"
LE_DIR="$(dirname "$0")/.."

VAULT_POD() {
  kubectl get pod -n ${NAMESPACE} -l app=vault -o jsonpath='{.items[0].metadata.name}'
}

echo "============================================================"
echo " LinkedEye Vault"
echo " Namespace: ${NAMESPACE}  |  Action: ${ACTION}"
echo "============================================================"

# ── STATUS ────────────────────────────────────────────────────
if [ "${ACTION}" = "status" ]; then
  kubectl get pods -n ${NAMESPACE} -o wide
  echo ""; kubectl get svc -n ${NAMESPACE}
  echo ""; kubectl get ingress -n ${NAMESPACE}
  POD=$(VAULT_POD)
  echo ""
  echo "Vault seal status:"
  kubectl exec -n ${NAMESPACE} ${POD} -- vault status 2>&1 || true
  exit 0
fi

# ── DESTROY ───────────────────────────────────────────────────
if [ "${ACTION}" = "destroy" ]; then
  read -p "Delete Vault? ALL secrets will be LOST. Type 'DELETE VAULT': " CONFIRM
  [ "${CONFIRM}" = "DELETE VAULT" ] && kubectl delete namespace ${NAMESPACE} --ignore-not-found || echo "Aborted."
  exit 0
fi

# ── INIT (first time only) ────────────────────────────────────
if [ "${ACTION}" = "init" ]; then
  POD=$(VAULT_POD)
  echo "Initializing Vault (5 key shares, 3 threshold)..."
  kubectl exec -n ${NAMESPACE} ${POD} -- \
    vault operator init -key-shares=5 -key-threshold=3 \
    -format=json | tee /tmp/vault-init.json

  echo ""
  echo "========================================================"
  echo " CRITICAL: Save the output above securely!"
  echo " Update 03-configmap.yaml vault-init-secret with keys."
  echo " Saved locally to: /tmp/vault-init.json"
  echo "========================================================"
  exit 0
fi

# ── UNSEAL ────────────────────────────────────────────────────
if [ "${ACTION}" = "unseal" ]; then
  POD=$(VAULT_POD)
  echo "Unsealing Vault (need 3 of 5 keys)..."
  echo "Enter unseal key 1:"; read -s KEY1
  kubectl exec -n ${NAMESPACE} ${POD} -- vault operator unseal "${KEY1}"
  echo "Enter unseal key 2:"; read -s KEY2
  kubectl exec -n ${NAMESPACE} ${POD} -- vault operator unseal "${KEY2}"
  echo "Enter unseal key 3:"; read -s KEY3
  kubectl exec -n ${NAMESPACE} ${POD} -- vault operator unseal "${KEY3}"
  echo "Vault unsealed."
  kubectl exec -n ${NAMESPACE} ${POD} -- vault status
  exit 0
fi

# ── POST-INIT SETUP ───────────────────────────────────────────
if [ "${ACTION}" = "setup" ]; then
  POD=$(VAULT_POD)
  echo "Enter Vault root token:"; read -s ROOT_TOKEN
  export VAULT_TOKEN="${ROOT_TOKEN}"

  echo "Enabling KV secrets engine..."
  kubectl exec -n ${NAMESPACE} ${POD} -- \
    env VAULT_TOKEN="${ROOT_TOKEN}" \
    vault secrets enable -path=secret kv-v2

  echo "Enabling K8s auth method..."
  kubectl exec -n ${NAMESPACE} ${POD} -- \
    env VAULT_TOKEN="${ROOT_TOKEN}" \
    vault auth enable kubernetes

  echo "Configuring K8s auth..."
  K8S_HOST=$(kubectl config view --raw -o jsonpath='{.clusters[0].cluster.server}')
  kubectl exec -n ${NAMESPACE} ${POD} -- \
    env VAULT_TOKEN="${ROOT_TOKEN}" \
    vault write auth/kubernetes/config \
      kubernetes_host="${K8S_HOST}"

  echo "Writing admin policy..."
  kubectl exec -n ${NAMESPACE} ${POD} -- \
    env VAULT_TOKEN="${ROOT_TOKEN}" \
    vault policy write linkedeye-admin - << 'EOF'
path "secret/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "sys/health" {
  capabilities = ["read"]
}
EOF

  echo "Writing jenkins policy..."
  kubectl exec -n ${NAMESPACE} ${POD} -- \
    env VAULT_TOKEN="${ROOT_TOKEN}" \
    vault policy write jenkins - << 'EOF'
path "secret/le-*" {
  capabilities = ["read", "list"]
}
EOF

  echo "Creating sample secrets (dev client)..."
  kubectl exec -n ${NAMESPACE} ${POD} -- \
    env VAULT_TOKEN="${ROOT_TOKEN}" \
    vault kv put secret/le-dev/config \
      environment="dev" \
      cluster="linkedeye-finspot-k8s-cluster" \
      namespace="le-dev"

  echo ""
  echo "============================================================"
  echo " Vault setup complete!"
  echo "  Secrets engine: secret/ (kv-v2)"
  echo "  Auth method:    kubernetes"
  echo "  Policies:       linkedeye-admin, jenkins"
  echo ""
  echo "  Path convention: secret/le-{client}-prod/*"
  echo "  Example: vault kv put secret/le-indmoney-prod/db password=xxx"
  echo "============================================================"
  exit 0
fi

# ── DEPLOY ────────────────────────────────────────────────────
echo "[1/6] Creating namespace..."
kubectl apply -f "${SCRIPT_DIR}/01-namespace.yaml"

echo "[2/6] Creating TLS secret..."
bash "${LE_DIR}/07-jenkins/create-tls-secret.sh" 2>/dev/null || true

echo "[3/6] Applying RBAC..."
kubectl apply -f "${SCRIPT_DIR}/02-rbac.yaml"

echo "[4/6] Applying ConfigMap..."
kubectl apply -f "${SCRIPT_DIR}/03-configmap.yaml"
kubectl apply -f "${SCRIPT_DIR}/04-pvc.yaml"

echo "[5/6] Deploying Vault..."
kubectl apply -f "${SCRIPT_DIR}/05-deployment.yaml"
kubectl apply -f "${SCRIPT_DIR}/06-service.yaml"

echo "[6/6] Applying Ingress..."
kubectl apply -f "${SCRIPT_DIR}/07-ingress.yaml"

echo ""
echo "Waiting for Vault pod to be ready..."
kubectl rollout status deployment/vault -n ${NAMESPACE} --timeout=180s || true

echo ""
kubectl get pods -n ${NAMESPACE}
echo ""
echo "============================================================"
echo "  Vault URL:      https://ls-vault.finspot.in"
echo ""
echo "  NEXT STEPS (IMPORTANT):"
echo "  1. Initialize:  bash 09-deploy.sh init"
echo "     → Save the 5 unseal keys + root token securely!"
echo "  2. Unseal:      bash 09-deploy.sh unseal"
echo "  3. Setup:       bash 09-deploy.sh setup"
echo "     → Enables KV engine, K8s auth, policies"
echo "============================================================"
